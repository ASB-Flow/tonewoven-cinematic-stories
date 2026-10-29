"""Local voice server: transcription (faster-whisper), voice/background separation (Demucs),
voice cloning TTS (Chatterbox) and muxing (FFmpeg).

Run with:  uv run uvicorn server:app --port 8765
"""

import asyncio
import gc
import importlib.util
import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("voice-server")

DATA_DIR = Path(os.environ.get("VOICE_SERVER_DATA", Path(__file__).parent / "data"))
VOICES_DIR = DATA_DIR / "voices"
JOBS_DIR = DATA_DIR / "jobs"
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs")
ALLOWED_ORIGINS = os.environ.get(
    "VOICE_SERVER_ORIGINS",
    "http://localhost:8080,http://localhost:8081,https://tonewoven-cinematic-stories.lovable.app",
).split(",")

MAX_VIDEO_BYTES = 300 * 1024 * 1024
MAX_VOICE_BYTES = 50 * 1024 * 1024
MIN_VOICE_SECONDS = 5
MAX_VOICE_SECONDS = 60
JOB_TTL_SECONDS = 24 * 3600
TTS_CHUNK_CHARS = 250
PAUSE_SECONDS = 0.15
# A phrase longer than its slot is sped up at most this much (pitch is kept)
MAX_TEMPO = 1.35
# Whisper segments are merged into phrases of at most this length
MAX_PHRASE_SECONDS = 12.0
BACKGROUND_GAIN = 0.85
# Longest YouTube video accepted (Shorts last up to 3 minutes)
MAX_YOUTUBE_SECONDS = 10 * 60
# Length of the speaker's voice sample taken from the video when dubbing with the original voice
ORIGINAL_REFERENCE_SECONDS = 20
# Standard voices (Microsoft Edge online voices): no model to download, needs internet
STANDARD_SAMPLE_RATE = 24000
STANDARD_PARALLEL = 4
# Subtitles: characters per line (landscape / vertical video), two lines per cue at most
SUBTITLE_LINE_CHARS = 32
SUBTITLE_LINE_CHARS_VERTICAL = 20

ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SEPARATION_AVAILABLE = importlib.util.find_spec("demucs") is not None

for directory in (VOICES_DIR, JOBS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="VoiceForge voice server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
    expose_headers=[
        "X-Speech-Duration", "X-Video-Duration", "X-Tempo", "X-Background", "X-Overflow", "X-Subtitles", "X-Engine",
    ],
)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    # Lets the hosted (https) app reach this server on localhost in Chromium browsers
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network"):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# One heavy model runs at a time. Whisper and Demucs are loaded per job and freed right after,
# so only the TTS model stays in memory between requests.
_model_lock = threading.Lock()
_tts_model = None


def get_tts():
    global _tts_model
    if _tts_model is None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        try:
            _tts_model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE, t3_model="v3")
        except TypeError:
            # Older chatterbox-tts releases only ship the V2 multilingual checkpoint
            _tts_model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
    return _tts_model


def free_memory() -> None:
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()


def run_ffmpeg(*args: str, cwd: Path | None = None) -> None:
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *args], capture_output=True, text=True, encoding="utf-8",
        errors="replace", cwd=cwd,
    )
    if result.returncode != 0:
        raise HTTPException(500, f"FFmpeg a échoué : {result.stderr.strip()[-500:]}")


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise HTTPException(400, "Fichier illisible : ce n'est pas un média valide")
    info = json.loads(result.stdout)
    return {
        "duration": float(info.get("format", {}).get("duration", 0) or 0),
        "streams": {s.get("codec_type") for s in info.get("streams", [])},
    }


async def save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> None:
    size = 0
    with destination.open("wb") as out:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(413, f"Fichier trop volumineux (max {max_bytes // (1024 * 1024)} Mo)")
            out.write(chunk)


def check_id(value: str) -> str:
    if not ID_PATTERN.match(value):
        raise HTTPException(400, "Identifiant invalide")
    return value


def cleanup_old_jobs() -> None:
    now = time.time()
    for job in JOBS_DIR.iterdir():
        if job.is_dir() and now - job.stat().st_mtime > JOB_TTL_SECONDS:
            shutil.rmtree(job, ignore_errors=True)


def split_for_tts(text: str, max_chars: int = TTS_CHUNK_CHARS) -> list[str]:
    sentences = re.findall(r"[^.!?…]+[.!?…]*", text.replace("\n", " "))
    chunks: list[str] = []
    for sentence in (s.strip() for s in sentences):
        if not sentence:
            continue
        # Long sentences are split on commas, then hard-cut on spaces
        while len(sentence) > max_chars:
            cut = sentence.rfind(",", 0, max_chars)
            if cut < max_chars // 3:
                cut = sentence.rfind(" ", 0, max_chars)
            if cut <= 0:
                cut = max_chars
            chunks.append(sentence[: cut + 1].strip())
            sentence = sentence[cut + 1 :].strip()
        if chunks and len(chunks[-1]) + len(sentence) + 1 <= max_chars:
            chunks[-1] = f"{chunks[-1]} {sentence}"
        elif sentence:
            chunks.append(sentence)
    return chunks


def merge_into_phrases(segments: list[dict], max_seconds: float = MAX_PHRASE_SECONDS) -> list[dict]:
    """Joins Whisper segments until a sentence ends, so each phrase is spoken in one breath."""
    phrases: list[dict] = []
    for seg in segments:
        text = seg["text"].strip()
        if not text:
            continue
        last = phrases[-1] if phrases else None
        if last and not re.search(r"[.!?…]$", last["text"]) and seg["end"] - last["start"] <= max_seconds:
            last["end"] = seg["end"]
            last["text"] = f"{last['text']} {text}"
        else:
            phrases.append({"start": seg["start"], "end": seg["end"], "text": text})
    return [{**p, "start": round(p["start"], 2), "end": round(p["end"], 2)} for p in phrases]


# ---------- Audio helpers ----------


def decode_audio(path: Path, sample_rate: int, channels: int) -> np.ndarray:
    """Decodes any media file to float32 samples, shape (frames, channels)."""
    result = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-vn", "-ac", str(channels), "-ar", str(sample_rate),
         "-f", "f32le", "pipe:1"],
        capture_output=True,
    )
    if result.returncode != 0:
        raise HTTPException(500, f"FFmpeg a échoué : {result.stderr.decode(errors='replace')[-500:]}")
    return np.frombuffer(result.stdout, np.float32).reshape(-1, channels)


def change_tempo(audio: np.ndarray, sample_rate: int, tempo: float) -> np.ndarray:
    """Speeds mono audio up (tempo > 1) without changing its pitch."""
    if abs(tempo - 1) < 0.01:
        return audio
    result = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(sample_rate), "-ac", "1", "-i", "pipe:0",
         "-af", f"atempo={tempo:.4f}", "-f", "f32le", "pipe:1"],
        input=audio.astype(np.float32).tobytes(),
        capture_output=True,
    )
    if result.returncode != 0:
        raise HTTPException(500, f"FFmpeg a échoué : {result.stderr.decode(errors='replace')[-500:]}")
    return np.frombuffer(result.stdout, np.float32).copy()


def trim_silence(audio: np.ndarray, sample_rate: int, threshold: float = 0.01) -> np.ndarray:
    voiced = np.flatnonzero(np.abs(audio) > threshold)
    if voiced.size == 0:
        return audio[:0]
    margin = int(0.03 * sample_rate)
    return audio[max(voiced[0] - margin, 0) : voiced[-1] + margin]


def whisper_context(title: str | None) -> str | None:
    """Turns a YouTube title into a hint for Whisper: no channel/hashtag tail and no ALL CAPS,
    which Whisper would otherwise copy into the transcript."""
    if not title:
        return None
    title = re.split(r"\s[|#]", title)[0]
    words = [w.lower() if len(w) > 1 and w.isupper() else w for w in title.split()]
    text = " ".join(words).strip(" -!")
    return f"{text[:1].upper()}{text[1:]}." if text else None


def transcribe_audio(path: Path, context: str | None = None, max_seconds: float | None = None) -> tuple[list[dict], str | None]:
    """context (e.g. the video title) helps Whisper with names and the topic."""
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")
    try:
        segments, info = model.transcribe(str(path), vad_filter=True, initial_prompt=context or None)
        result = [
            {"start": s.start, "end": min(s.end, max_seconds) if max_seconds else s.end, "text": s.text}
            for s in segments
        ]
        return result, info.language
    finally:
        del model
        free_memory()


def separate_background(video: Path, destination: Path, vocals_destination: Path | None = None) -> bool:
    """Writes the video's music and sound effects without the voices (and, if asked, the voices alone).
    Returns False if unavailable."""
    if not SEPARATION_AVAILABLE:
        return False
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model(DEMUCS_MODEL)
    model.eval()
    try:
        mix = torch.from_numpy(decode_audio(video, model.samplerate, 2).T.copy())
        reference = mix.mean(0)
        mean, std = reference.mean(), reference.std() + 1e-8
        with torch.no_grad():
            sources = apply_model(model, ((mix - mean) / std)[None], device=DEVICE, split=True, overlap=0.25,
                                  progress=False)[0]
        sources = sources * std + mean
        keep = [i for i, name in enumerate(model.sources) if name != "vocals"]
        background = sources[keep].sum(0)
        sf.write(str(destination), background.T.numpy(), model.samplerate, subtype="PCM_16")
        if vocals_destination is not None:
            vocals = sources[model.sources.index("vocals")].mean(0)
            sf.write(str(vocals_destination), vocals.numpy(), model.samplerate, subtype="PCM_16")
        return True
    finally:
        del model
        free_memory()


def build_original_reference(job_dir: Path, phrases: list[dict]) -> bool:
    """Builds a voice sample of the video's speaker from their phrases (isolated voice if available)."""
    source = job_dir / "vocals.wav"
    if not source.exists():
        source = job_dir / "source.wav"
    sample_rate = 24000
    audio = decode_audio(source, sample_rate, 1)[:, 0]
    parts: list[np.ndarray] = []
    total = 0
    for phrase in phrases:
        part = audio[int(phrase["start"] * sample_rate) : int(phrase["end"] * sample_rate)]
        parts.append(part)
        total += part.size
        if total >= ORIGINAL_REFERENCE_SECONDS * sample_rate:
            break
    if total < MIN_VOICE_SECONDS * sample_rate:
        return False
    sample = np.concatenate(parts)[: ORIGINAL_REFERENCE_SECONDS * sample_rate]
    peak = float(np.abs(sample).max())
    if peak > 0:
        sample = sample * (0.9 / peak)
    sf.write(str(job_dir / "reference.wav"), sample, sample_rate, subtype="PCM_16")
    return True


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "gpu": torch.cuda.get_device_name(0) if DEVICE == "cuda" else None,
        "tts_loaded": _tts_model is not None,
        "separation": SEPARATION_AVAILABLE,
    }


# ---------- Voices ----------


def read_voice(voice_dir: Path) -> dict | None:
    meta = voice_dir / "meta.json"
    if not meta.exists():
        return None
    return json.loads(meta.read_text(encoding="utf-8"))


@app.get("/voices")
def list_voices():
    voices = [read_voice(d) for d in VOICES_DIR.iterdir() if d.is_dir()]
    return sorted((v for v in voices if v), key=lambda v: v["created_at"], reverse=True)


@app.post("/voices")
async def create_voice(name: str = Form(...), file: UploadFile = File(...)):
    name = name.strip()[:60]
    if not name:
        raise HTTPException(400, "Nom de voix requis")

    voice_id = uuid.uuid4().hex
    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir()
    try:
        raw = voice_dir / "upload"
        await save_upload(file, raw, MAX_VOICE_BYTES)
        info = probe(raw)
        if "audio" not in info["streams"]:
            raise HTTPException(400, "Le fichier ne contient pas d'audio")
        if info["duration"] < MIN_VOICE_SECONDS:
            raise HTTPException(400, f"Enregistrement trop court (minimum {MIN_VOICE_SECONDS} secondes)")

        # Mono 24 kHz WAV, trimmed, with leading/trailing silence removed
        run_ffmpeg(
            "-i", str(raw), "-t", str(MAX_VOICE_SECONDS), "-ac", "1", "-ar", "24000",
            "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                   "silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm",
            str(voice_dir / "reference.wav"),
        )
        raw.unlink(missing_ok=True)
        meta = {
            "id": voice_id,
            "name": name,
            "created_at": int(time.time()),
            "duration": round(probe(voice_dir / "reference.wav")["duration"], 1),
        }
        (voice_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        return meta
    except Exception:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise


@app.get("/voices/{voice_id}/sample")
def voice_sample(voice_id: str):
    path = VOICES_DIR / check_id(voice_id) / "reference.wav"
    if not path.exists():
        raise HTTPException(404, "Voix introuvable")
    return FileResponse(path, media_type="audio/wav")


@app.delete("/voices/{voice_id}")
def delete_voice(voice_id: str):
    voice_dir = VOICES_DIR / check_id(voice_id)
    if not voice_dir.exists():
        raise HTTPException(404, "Voix introuvable")
    shutil.rmtree(voice_dir)
    return {"deleted": voice_id}


# ---------- Jobs: transcribe a video, then dub it ----------


async def process_job(job_id: str, job_dir: Path, video: Path, separate: bool, extra: dict | None = None) -> dict:
    """Isolates the voice from the music (if asked), then transcribes the voice into timed phrases."""
    info = probe(video)
    if "video" not in info["streams"]:
        raise HTTPException(400, "Le fichier ne contient pas de vidéo")
    if "audio" not in info["streams"]:
        raise HTTPException(400, "La vidéo n'a pas de piste audio à transcrire")

    audio = job_dir / "source.wav"
    run_ffmpeg("-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(audio))

    def process():
        with _model_lock:
            has_background = False
            if separate:
                try:
                    has_background = separate_background(
                        video, job_dir / "background.wav", job_dir / "vocals.wav"
                    )
                except Exception:
                    # The dub still works without it: the original audio is then fully replaced
                    log.exception("Voice/background separation failed")
            # Whisper hears the voice better without the music: on a Myles Munroe Short it fixed
            # "nothing is going to happen" -> "nothing is permanent"
            speech = job_dir / "vocals.wav" if has_background else audio
            segments, language = transcribe_audio(speech, whisper_context((extra or {}).get("title")), info["duration"])
            return segments, language, has_background

    # Keep the event loop free (health checks) while the models run
    segments, language, has_background = await run_in_threadpool(process)
    phrases = merge_into_phrases(segments)
    has_original_voice = build_original_reference(job_dir, phrases)

    job = {
        "job_id": job_id,
        "transcript": " ".join(p["text"] for p in phrases),
        "segments": phrases,
        "language": language,
        "duration": round(info["duration"], 2),
        "has_background": has_background,
        # Enough speech to reuse the speaker's own voice for the French dub
        "has_original_voice": has_original_voice,
        **(extra or {}),
    }
    (job_dir / "job.json").write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
    return job


def new_job_dir() -> tuple[str, Path]:
    cleanup_old_jobs()
    job_id = uuid.uuid4().hex
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir()
    return job_id, job_dir


@app.post("/jobs")
async def create_job(file: UploadFile = File(...), separate: bool = Form(True)):
    job_id, job_dir = new_job_dir()
    try:
        video = job_dir / "source.mp4"
        await save_upload(file, video, MAX_VIDEO_BYTES)
        return await process_job(job_id, job_dir, video, separate)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise


class YouTubeJobRequest(BaseModel):
    video_id: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")
    separate: bool = True


def download_youtube(video_id: str, job_dir: Path) -> dict:
    import yt_dlp
    from yt_dlp.utils import DownloadError, match_filter_func

    options = {
        # H.264 MP4 up to 1080x1920 first: it plays everywhere and is copied as is when muxing
        # (YouTube often serves AV1, which many players and editors cannot read)
        "format": "bv*[vcodec^=avc1][height<=1920]+ba[ext=m4a]/bv*[ext=mp4][height<=1920]+ba[ext=m4a]/b[ext=mp4]/b",
        "merge_output_format": "mp4",
        "outtmpl": str(job_dir / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "noprogress": True,
        "max_filesize": MAX_VIDEO_BYTES,
        "match_filter": match_filter_func(f"duration <= {MAX_YOUTUBE_SECONDS}"),
        # YouTube needs a JavaScript runtime; use whichever is installed
        "js_runtimes": {"deno": {}, "node": {}, "bun": {}},
    }
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(f"https://www.youtube.com/watch?v={video_id}")
    except DownloadError as error:
        message = re.sub(r"\x1b\[[0-9;]*m", "", str(error)).replace("ERROR: ", "")
        raise HTTPException(400, f"Téléchargement YouTube impossible : {message[:300]}")
    if not info or not (job_dir / "source.mp4").exists():
        raise HTTPException(
            400, f"Vidéo non téléchargée (plus de {MAX_YOUTUBE_SECONDS // 60} minutes, ou plus de "
                 f"{MAX_VIDEO_BYTES // (1024 * 1024)} Mo ?)"
        )
    return {"title": info.get("title"), "channel": info.get("channel") or info.get("uploader")}


@app.post("/jobs/youtube")
async def create_youtube_job(body: YouTubeJobRequest):
    job_id, job_dir = new_job_dir()
    try:
        meta = await run_in_threadpool(download_youtube, body.video_id, job_dir)
        return await process_job(job_id, job_dir, job_dir / "source.mp4", body.separate,
                                 {"video_id": body.video_id, **meta})
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise


class Segment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str = Field(min_length=1, max_length=2000)


class DubRequest(BaseModel):
    # "clone": Chatterbox with a saved voice (voice_id) or the video speaker's voice (no voice_id).
    # "standard": a ready-made Microsoft voice, fast and without a model to download.
    engine: Literal["clone", "standard"] = "clone"
    voice_id: str | None = None
    standard_voice: str = Field(default="fr-FR-HenriNeural", pattern=r"^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$")
    # Timed phrases (preferred), or one block of text spoken from the start of the video
    segments: list[Segment] | None = Field(default=None, max_length=500)
    text: str | None = Field(default=None, max_length=20000)
    keep_background: bool = True
    # French subtitles: burned into the image, as a track the player can toggle, or none
    subtitles: Literal["none", "burn", "track"] = "none"
    exaggeration: float = Field(default=0.5, ge=0.25, le=2.0)
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def needs_content(self):
        if not self.segments and not (self.text and self.text.strip()):
            raise ValueError("segments ou text requis")
        return self


def synthesize(model, text: str, reference: Path, body: DubRequest) -> np.ndarray:
    pause = np.zeros(int(model.sr * PAUSE_SECONDS), np.float32)
    parts: list[np.ndarray] = []
    for chunk in split_for_tts(text):
        wav = model.generate(
            chunk,
            language_id="fr",
            audio_prompt_path=str(reference),
            exaggeration=body.exaggeration,
            cfg_weight=body.cfg_weight,
        )
        parts.extend([trim_silence(wav.squeeze(0).cpu().numpy().astype(np.float32), model.sr), pause])
    return np.concatenate(parts[:-1]) if parts else np.zeros(0, np.float32)


def synthesize_cloned(texts: list[str], reference: Path, body: DubRequest) -> tuple[list[np.ndarray], int]:
    with _model_lock:
        model = get_tts()
        clips = [synthesize(model, text, reference, body) for text in texts]
        free_memory()
    return clips, model.sr


async def _standard_clip(text: str, voice: str, path: Path) -> None:
    import edge_tts

    for attempt in range(3):
        try:
            await edge_tts.Communicate(text=text, voice=voice).save(str(path))
            if path.exists() and path.stat().st_size > 0:
                return
        except Exception:
            log.warning("Standard voice attempt %d failed", attempt + 1, exc_info=True)
        await asyncio.sleep(1 + attempt)
    raise HTTPException(502, "Service de voix standard (Microsoft) injoignable : vérifiez la connexion internet")


def synthesize_standard(texts: list[str], voice: str, clips_dir: Path) -> tuple[list[np.ndarray], int]:
    clips_dir.mkdir(exist_ok=True)
    paths = [clips_dir / f"{index:04d}.mp3" for index in range(len(texts))]

    async def run():
        limit = asyncio.Semaphore(STANDARD_PARALLEL)

        async def one(text: str, path: Path):
            async with limit:
                await _standard_clip(text, voice, path)

        await asyncio.gather(*(one(text, path) for text, path in zip(texts, paths)))

    asyncio.run(run())
    clips = [trim_silence(decode_audio(path, STANDARD_SAMPLE_RATE, 1)[:, 0], STANDARD_SAMPLE_RATE) for path in paths]
    shutil.rmtree(clips_dir, ignore_errors=True)
    return clips, STANDARD_SAMPLE_RATE


# ---------- Subtitles ----------


def _wrap_two_lines(text: str, line_chars: int = SUBTITLE_LINE_CHARS) -> str:
    if len(text) <= line_chars:
        return text
    words = text.split()
    # Break where the two lines are the most balanced
    best = min(range(1, len(words)), key=lambda i: abs(len(" ".join(words[:i])) - len(" ".join(words[i:]))))
    return f"{' '.join(words[:best])}\n{' '.join(words[best:])}"


def build_cues(spoken: list[tuple[float, float, str]], line_chars: int = SUBTITLE_LINE_CHARS) -> list[tuple]:
    """Splits each spoken phrase into cues of two lines at most, timed by their share of characters."""
    cues = []
    for start, end, text in spoken:
        chunks: list[str] = []
        current = ""
        for word in text.split():
            if current and len(current) + 1 + len(word) > line_chars * 2:
                chunks.append(current)
                current = word
            else:
                current = f"{current} {word}".strip()
        if current:
            chunks.append(current)
        total = sum(len(chunk) for chunk in chunks) or 1
        cursor = start
        for chunk in chunks:
            duration = (end - start) * len(chunk) / total
            cues.append((cursor, cursor + duration, _wrap_two_lines(chunk, line_chars)))
            cursor += duration
    return cues


def _timecode(seconds: float) -> str:
    total_ms = int(round(max(seconds, 0) * 1000))
    hours, rest = divmod(total_ms, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    secs, ms = divmod(rest, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_srt(cues: list[tuple], path: Path) -> None:
    blocks = [f"{i}\n{_timecode(start)} --> {_timecode(end)}\n{text}\n" for i, (start, end, text) in enumerate(cues, 1)]
    path.write_text("\n".join(blocks), encoding="utf-8")


def video_size(path: Path) -> tuple[int, int]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    try:
        width, height = (int(v) for v in result.stdout.strip().split(",")[:2])
        return width, height
    except ValueError:
        return 1920, 1080


def subtitle_style(width: int, height: int) -> str:
    vertical = height > width
    # Sizes are in libass units (the image is 288 units high whatever its resolution)
    return (
        "FontName=Arial,Bold=1,"
        f"FontSize={10 if vertical else 18},"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.2,Shadow=0,"
        f"Alignment=2,MarginV={55 if vertical else 22}"
    )


# ---------- Dubbing ----------


@app.get("/jobs/{job_id}/reference")
def job_reference(job_id: str):
    """The speaker's voice sample taken from the video."""
    path = JOBS_DIR / check_id(job_id) / "reference.wav"
    if not path.exists():
        raise HTTPException(404, "Échantillon de voix introuvable")
    return FileResponse(path, media_type="audio/wav")


@app.get("/jobs/{job_id}/subtitles")
def job_subtitles(job_id: str):
    """French subtitles of the last dub, as an .srt file."""
    path = JOBS_DIR / check_id(job_id) / "subtitles.srt"
    if not path.exists():
        raise HTTPException(404, "Sous-titres introuvables : générez d'abord le doublage")
    return FileResponse(path, media_type="application/x-subrip", filename="sous-titres-fr.srt")


@app.post("/jobs/{job_id}/dub")
def dub_job(job_id: str, body: DubRequest):
    job_dir = JOBS_DIR / check_id(job_id)
    job_file = job_dir / "job.json"
    if not job_file.exists():
        raise HTTPException(404, "Tâche introuvable ou expirée : réimportez la vidéo")

    reference = None
    if body.engine == "clone":
        if body.voice_id:
            reference = VOICES_DIR / check_id(body.voice_id) / "reference.wav"
            if not reference.exists():
                raise HTTPException(404, "Voix introuvable")
        else:
            reference = job_dir / "reference.wav"
            if not reference.exists():
                raise HTTPException(400, "Pas assez de parole dans la vidéo pour reprendre la voix d'origine")

    job = json.loads(job_file.read_text(encoding="utf-8"))
    video_duration = float(job["duration"])
    if body.segments:
        segments = sorted(body.segments, key=lambda s: s.start)
    else:
        segments = [Segment(start=0, end=video_duration, text=body.text.strip())]

    texts = [segment.text for segment in segments]
    if body.engine == "standard":
        clips, sr = synthesize_standard(texts, body.standard_voice, job_dir / "clips")
    else:
        clips, sr = synthesize_cloned(texts, reference, body)

    track = np.zeros(max(int(round(video_duration * sr)), 1), np.float32)
    cursor = 0.0
    max_tempo = 1.0
    speech_seconds = 0.0
    overflow = 0.0
    spoken: list[tuple[float, float, str]] = []

    for index, (segment, clip) in enumerate(zip(segments, clips)):
        if clip.size == 0:
            continue
        # Start where the speaker started, unless the previous phrase is still running
        start = max(segment.start, cursor)
        slot_end = segments[index + 1].start if index + 1 < len(segments) else video_duration
        available = max(slot_end - start, 0.1)
        duration = clip.size / sr
        if duration > available:
            tempo = min(duration / available, MAX_TEMPO)
            clip = change_tempo(clip, sr, tempo)
            max_tempo = max(max_tempo, tempo)
            duration = clip.size / sr

        first = int(start * sr)
        last = min(first + clip.size, track.size)
        if last > first:
            track[first:last] += clip[: last - first]
        speech_seconds += duration
        overflow = max(overflow, start + duration - video_duration)
        cursor = start + duration
        if start < video_duration:
            spoken.append((start, min(cursor, video_duration), segment.text))

    peak = float(np.abs(track).max()) if track.size else 0.0
    if peak > 0.98:
        track *= 0.98 / peak

    speech_path = job_dir / "speech.wav"
    sf.write(str(speech_path), track, sr, subtype="PCM_16")

    # Subtitles follow the French speech as it was placed, not the original timing
    srt_name = "subtitles.srt"
    width, height = video_size(job_dir / "source.mp4")
    line_chars = SUBTITLE_LINE_CHARS_VERTICAL if height > width else SUBTITLE_LINE_CHARS
    write_srt(build_cues(spoken, line_chars), job_dir / srt_name)
    subtitles = body.subtitles if spoken else "none"

    background = job_dir / "background.wav"
    use_background = body.keep_background and background.exists()

    # Run from the job folder so the subtitles filter gets a plain relative path (no Windows escaping)
    inputs = ["-i", "source.mp4", "-i", "speech.wav"]
    filters = []
    if use_background:
        inputs += ["-i", "background.wav"]
        filters.append(
            f"[2:a]volume={BACKGROUND_GAIN}[bg];"
            "[1:a]aresample=44100,aformat=channel_layouts=stereo[voice];"
            "[bg][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]"
        )
        audio_map = "[aout]"
    else:
        audio_map = "1:a:0"

    if subtitles == "burn":
        filters.append(f"[0:v]subtitles={srt_name}:force_style='{subtitle_style(width, height)}'[vout]")
        video_map = "[vout]"
        video_codec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]
    else:
        video_map = "0:v:0"
        video_codec = ["-c:v", "copy"]

    extra_maps = []
    if subtitles == "track":
        subtitle_input = len(inputs) // 2
        inputs += ["-i", srt_name]
        extra_maps = ["-map", f"{subtitle_input}:0", "-c:s", "mov_text", "-metadata:s:s:0", "language=fre"]

    run_ffmpeg(
        *inputs,
        *(["-filter_complex", ";".join(filters)] if filters else []),
        "-map", video_map, "-map", audio_map, *extra_maps,
        *video_codec, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "dubbed.mp4",
        cwd=job_dir,
    )

    return FileResponse(
        job_dir / "dubbed.mp4",
        media_type="video/mp4",
        filename="short-fr.mp4",
        headers={
            "X-Speech-Duration": f"{speech_seconds:.2f}",
            "X-Video-Duration": f"{video_duration:.2f}",
            "X-Tempo": f"{max_tempo:.3f}",
            "X-Background": "1" if use_background else "0",
            "X-Overflow": f"{max(overflow, 0):.2f}",
            "X-Subtitles": subtitles,
            "X-Engine": body.engine,
        },
    )
