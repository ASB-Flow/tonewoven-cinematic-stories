import { supabase } from "@/integrations/supabase/client";

export const AUDIO_BUCKET = "audio-files";

export const voiceOptions = [
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", description: "Voix masculine profonde" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", description: "Voix féminine naturelle" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George", description: "Voix masculine chaleureuse" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily", description: "Voix féminine douce" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", label: "Roger", description: "Voix masculine autoritaire" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura", description: "Voix féminine confiante" },
];

// Must stay under the elevenlabs-tts MAX_TEXT_LENGTH (5000)
const TTS_CHUNK_LENGTH = 4500;

export const splitTextIntoChunks = (text: string, maxLength = TTS_CHUNK_LENGTH): string[] => {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // A single sentence longer than the limit is cut hard
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const parts: string[] = [];
    for (let i = 0; i < chunk.length; i += maxLength) parts.push(chunk.slice(i, i + maxLength));
    return parts;
  });
};

// supabase.functions.invoke hides the JSON error body of non-2xx responses behind error.context
export const invokeFunction = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error || data?.error) {
    const details = await error?.context?.json?.().catch(() => null);
    throw new Error(details?.error || data?.error || error?.message || `Échec de ${name}`);
  }
  return data as T;
};

const base64ToBytes = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// Generates the voice-over chunk by chunk; MP3 frames can simply be concatenated
export const generateSpeech = async (
  text: string,
  voiceId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; creditsUsed: number }> => {
  const chunks = splitTextIntoChunks(text);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let creditsUsed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const data = await invokeFunction<{ audioContent: string; creditsUsed?: number }>("elevenlabs-tts", {
      text: chunks[i],
      voiceId,
    });
    parts.push(base64ToBytes(data.audioContent));
    creditsUsed += data.creditsUsed ?? 0;
    onProgress?.(i + 1, chunks.length);
  }

  return { blob: new Blob(parts, { type: "audio/mpeg" }), creditsUsed };
};

export const getAudioDuration = (blob: Blob): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });

export const getSignedAudioUrl = async (path: string, download?: string): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, 60 * 60, download ? { download } : undefined);
  if (error || !data) throw new Error(error?.message || "Impossible d'accéder au fichier audio");
  return data.signedUrl;
};

// Works for any stored output (audio .mp3 or dubbed video .mp4): the extension comes from the path
export const downloadProjectFile = async (path: string, title: string) => {
  const extension = path.split(".").pop() || "mp3";
  const filename = `${title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "projet"}.${extension}`;
  const url = await getSignedAudioUrl(path, filename);
  const link = document.createElement("a");
  link.href = url;
  link.click();
};

// Fallback when no generated audio exists: the browser's own French voice
export const speakWithBrowser = (text: string, onEnd: () => void): boolean => {
  if (!("speechSynthesis" in window)) return false;

  let started = false;
  const speak = () => {
    if (started) return;
    started = true;
    window.speechSynthesis.onvoiceschanged = null;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    const frenchVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
    if (frenchVoice) utterance.voice = frenchVoice;
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    window.speechSynthesis.speak(utterance);
  };

  // Voices may load asynchronously; never start twice
  if (window.speechSynthesis.getVoices().length > 0) {
    speak();
  } else {
    window.speechSynthesis.onvoiceschanged = speak;
    setTimeout(speak, 500);
  }
  return true;
};

export const stopBrowserSpeech = () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
};

export const deleteProject = async (projectId: string, filePaths: (string | null)[]) => {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  const paths = filePaths.filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(AUDIO_BUCKET).remove(paths);
    if (storageError) console.error("File cleanup failed:", storageError);
  }
};
