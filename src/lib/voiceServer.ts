// Client for the local voice server (voice-server/server.py)
export const VOICE_SERVER_URL = (import.meta.env.VITE_VOICE_SERVER_URL as string | undefined) ?? "http://localhost:8765";

export interface VoiceServerHealth {
  status: string;
  device: string;
  gpu: string | null;
  tts_loaded: boolean;
  separation?: boolean;
}

export interface Voice {
  id: string;
  name: string;
  created_at: number;
  duration: number;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionJob {
  job_id: string;
  transcript: string;
  segments: Segment[];
  language: string | null;
  duration: number;
  has_background: boolean;
  /** Enough speech in the video to reuse the speaker's own voice */
  has_original_voice: boolean;
  title?: string | null;
  channel?: string | null;
}

export interface DubResult {
  video: Blob;
  speechDuration: number;
  videoDuration: number;
  /** Highest speed-up applied to a phrase to fit its slot */
  tempo: number;
  background: boolean;
  /** Seconds of speech cut off at the end of the video */
  overflow: number;
  subtitles: SubtitleMode;
}

/** Timed phrases (preferred) or one block of text spoken from the start */
export type DubContent = { segments: Segment[] } | { text: string };

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${VOICE_SERVER_URL}${path}`, init);
  } catch {
    throw new Error("Serveur vocal injoignable : lancez voice-server sur votre machine.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : `Erreur du serveur vocal (${response.status})`);
  }
  return response;
};

export const getHealth = async (): Promise<VoiceServerHealth> => (await request("/health")).json();

export const listVoices = async (): Promise<Voice[]> => (await request("/voices")).json();

export const createVoice = async (name: string, audio: Blob, filename: string): Promise<Voice> => {
  const form = new FormData();
  form.append("name", name);
  form.append("file", audio, filename);
  return (await request("/voices", { method: "POST", body: form })).json();
};

export const deleteVoice = async (voiceId: string): Promise<void> => {
  await request(`/voices/${voiceId}`, { method: "DELETE" });
};

export const voiceSampleUrl = (voiceId: string) => `${VOICE_SERVER_URL}/voices/${voiceId}/sample`;

/** The voice server downloads the YouTube video itself, then transcribes it. */
export const transcribeYouTube = async (videoId: string, separate = true): Promise<TranscriptionJob> =>
  (await request("/jobs/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_id: videoId, separate }),
  })).json();

export type SubtitleMode = "burn" | "track" | "none";

export interface DubOptions {
  /** "clone": Chatterbox (a saved voice, or the speaker's voice when voiceId is null). "standard": Microsoft voice */
  engine: "clone" | "standard";
  voiceId?: string | null;
  standardVoice?: string;
  keepBackground: boolean;
  subtitles: SubtitleMode;
}

/** Ready-made French voices (no model to download, needs internet) */
export const STANDARD_VOICES = [
  { id: "fr-FR-HenriNeural", label: "Henri — homme, voix grave" },
  { id: "fr-FR-RemyMultilingualNeural", label: "Rémy — homme, naturel" },
  { id: "fr-FR-DeniseNeural", label: "Denise — femme, claire" },
  { id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne — femme, expressive" },
  { id: "fr-BE-GerardNeural", label: "Gérard — homme, accent belge" },
  { id: "fr-CA-ThierryNeural", label: "Thierry — homme, accent canadien" },
  { id: "fr-CA-SylvieNeural", label: "Sylvie — femme, accent canadien" },
] as const;

export const dubVideo = async (jobId: string, content: DubContent, options: DubOptions): Promise<DubResult> => {
  const response = await request(`/jobs/${jobId}/dub`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...content,
      engine: options.engine,
      voice_id: options.engine === "clone" ? options.voiceId ?? null : null,
      standard_voice: options.standardVoice,
      keep_background: options.keepBackground,
      subtitles: options.subtitles,
    }),
  });
  return {
    video: await response.blob(),
    speechDuration: Number(response.headers.get("X-Speech-Duration")) || 0,
    videoDuration: Number(response.headers.get("X-Video-Duration")) || 0,
    tempo: Number(response.headers.get("X-Tempo")) || 1,
    background: response.headers.get("X-Background") === "1",
    overflow: Number(response.headers.get("X-Overflow")) || 0,
    subtitles: (response.headers.get("X-Subtitles") as SubtitleMode | null) ?? "none",
  };
};

/** French subtitles (.srt) of the job's last dub */
export const getSubtitles = async (jobId: string): Promise<Blob> => (await request(`/jobs/${jobId}/subtitles`)).blob();

/** One numbered line per phrase, so the translation can be matched back to its timing. */
export const numberSegments = (segments: Segment[]): string =>
  segments.map((s, i) => `[${i + 1}] ${s.text.replace(/\s+/g, " ").trim()}`).join("\n");

/**
 * Reads a translation of numberSegments() output back into timed phrases.
 * Returns null when a line is missing or extra, so the caller can fall back to one block.
 */
export const parseNumberedTranslation = (translated: string, segments: Segment[]): Segment[] | null => {
  const lines = new Map<number, string>();
  for (const match of translated.matchAll(/^\s*\[(\d+)\]\s*(.*)$/gm)) {
    const text = match[2].trim();
    if (text) lines.set(Number(match[1]), text);
  }
  if (lines.size !== segments.length) return null;
  const result: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const text = lines.get(i + 1);
    if (!text) return null;
    result.push({ ...segments[i], text });
  }
  return result;
};

export const extractYouTubeId = (url: string): string | null => {
  const match = url.trim().match(
    /(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
};
