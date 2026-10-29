# Voice server (local)

Local service used by the **Short FR** page (`/short`):

0. downloads the Short from its YouTube link (yt-dlp, videos up to 10 minutes);
1. transcribes it into timed phrases (faster-whisper);
2. separates the voices from the music and sound effects (Demucs `htdemucs`);
3. speaks each translated phrase with your cloned voice (Chatterbox Multilingual), starting when the
   original speaker started, and speeds a phrase up (max ×1.35, same pitch) only if it would overrun;
   Instead of a cloned voice, a ready-made French voice (Microsoft Edge online voices, `edge-tts`) can be
   used: no model to download and much faster, but it needs internet and does not clone;
4. mixes the French voice over the original music and puts it back on the video (FFmpeg), with French
   subtitles burned into the image or added as a track (the `.srt` is at `GET /jobs/{id}/subtitles`).

Whisper and Demucs are loaded for each video and freed right after, so only the voice model stays in memory.

## Requirements

- [uv](https://docs.astral.sh/uv/)
- FFmpeg and ffprobe in `PATH`
- Node.js, Deno or Bun in `PATH` (yt-dlp needs a JavaScript runtime for YouTube)
- If YouTube downloads start failing, update yt-dlp: `uv lock --upgrade-package yt-dlp && uv sync`
- Runs on CPU by default: expect roughly 10-20 minutes of generation for a 60-second Short

## Install

```sh
cd voice-server
uv sync
```

uv installs Python 3.11 if needed and the CPU build of PyTorch.

To use an NVIDIA GPU instead (much faster, ~2.4 GB download), point the `torch` and `torchaudio`
sources in `pyproject.toml` at `https://download.pytorch.org/whl/cu124`, then run `uv lock && uv sync`.

## Run

```sh
cd voice-server
uv run uvicorn server:app --port 8765
```

The first transcription and the first dub download the model weights (a few GB) from Hugging Face.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `WHISPER_MODEL` | `small` | faster-whisper size (`base`, `small`, `medium`…) |
| `DEMUCS_MODEL` | `htdemucs` | Demucs model used to remove the voices |
| `VOICE_SERVER_ORIGINS` | localhost:8080/8081 + the Lovable app | The only web apps allowed to call the server (others get 403) |
| `VOICE_SERVER_HOSTS` | (none) | Extra host names to answer to, besides localhost, 127.0.0.1 and [::1] |
| `VOICE_SERVER_DATA` | `voice-server/data` | Where voices and jobs are stored |

The web app reads the server URL from `VITE_VOICE_SERVER_URL` (default `http://localhost:8765`).

Voice samples stay on this machine in `data/voices/`. Jobs are deleted after 24 hours.

## Security

The server has no login, so it protects itself from other websites open in your browser:

- Requests from a web page whose origin is not in `VOICE_SERVER_ORIGINS` are refused (403). Local tools
  that send no `Origin` header, such as curl or Python scripts, are allowed.
- Requests addressed to another host name than localhost are refused, which blocks DNS rebinding.
- Uploads must be a real media file (MP4, MOV, WebM, MKV, WAV, MP3, OGG, FLAC, AAC). Playlists and
  concat lists are refused, and ffmpeg may only read local files, never network URLs.

Keep the default `--host 127.0.0.1`: do not expose the server on your network.
