import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Wand2, Smartphone, Mic, Sparkles, Check, Download, Server,
  AlertCircle, Loader2, ChevronRight, RefreshCw, Film
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AUDIO_BUCKET, invokeFunction } from "@/lib/audio";
import {
  dubVideo, extractYouTubeId, getHealth, getSubtitles, numberSegments, parseNumberedTranslation, STANDARD_VOICES,
  transcribeYouTube, VOICE_SERVER_URL, type DubContent, type SubtitleMode, type Voice, type VoiceServerHealth,
} from "@/lib/voiceServer";
import { VoicePicker } from "@/components/VoicePicker";

type PipelineStep = {
  label: string;
  status: "pending" | "active" | "completed" | "error";
  detail?: string;
};

type ServerState = { status: "checking" } | { status: "online"; health: VoiceServerHealth } | { status: "offline" };

type VoiceMode = "original" | "mine" | "standard";

const VOICE_MODES: { mode: VoiceMode; title: string; text: string }[] = [
  { mode: "original", title: "Voix d'origine", text: "L'orateur parle français avec sa propre voix. Lent sur CPU." },
  { mode: "mine", title: "Ma voix", text: "Une voix que vous avez enregistrée ou importée. Lent sur CPU." },
  { mode: "standard", title: "Voix standard", text: "Une voix française prête à l'emploi. Rapide, sans clonage." },
];

const SUBTITLE_MODES: { mode: SubtitleMode; label: string }[] = [
  { mode: "burn", label: "Incrustés dans l'image" },
  { mode: "track", label: "Piste activable dans le lecteur" },
  { mode: "none", label: "Aucun" },
];

const initialPipeline = (): PipelineStep[] => [
  { label: "Téléchargement, transcription et séparation voix / musique", status: "pending" },
  { label: "Création du projet", status: "pending" },
  { label: "Traduction en français", status: "pending" },
  { label: "Voix française et montage", status: "pending" },
  { label: "Sauvegarde de la vidéo", status: "pending" },
];

export const ShortDubbing = () => {
  const { user } = useAuth();
  const [server, setServer] = useState<ServerState>({ status: "checking" });
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("original");
  const [standardVoice, setStandardVoice] = useState<string>(STANDARD_VOICES[0].id);
  const [subtitles, setSubtitles] = useState<SubtitleMode>("burn");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [keepBackground, setKeepBackground] = useState(true);
  const [running, setRunning] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStep[] | null>(null);
  const [result, setResult] = useState<{ url: string; srtUrl: string | null; projectId: string } | null>(null);

  const youtubeId = extractYouTubeId(youtubeUrl);

  const checkServer = useCallback(async () => {
    setServer({ status: "checking" });
    try {
      setServer({ status: "online", health: await getHealth() });
    } catch {
      setServer({ status: "offline" });
    }
  }, []);

  useEffect(() => {
    checkServer();
  }, [checkServer]);

  useEffect(() => () => {
    if (!result) return;
    URL.revokeObjectURL(result.url);
    if (result.srtUrl) URL.revokeObjectURL(result.srtUrl);
  }, [result]);

  const updateStep = (index: number, update: Partial<PipelineStep>) =>
    setPipeline((prev) => prev && prev.map((s, i) => (i === index ? { ...s, ...update } : s)));

  const useOriginalVoice = voiceMode === "original";
  const voiceReady = voiceMode === "standard" || (useOriginalVoice ? rightsConfirmed : Boolean(voice));
  const canStart = server.status === "online" && voiceReady && youtubeId && !running;

  const start = async () => {
    if (!user || !youtubeId || !voiceReady) return;

    setRunning(true);
    setResult(null);
    setPipeline(initialPipeline());

    let projectId: string | null = null;
    let creditsUsed = 0;

    try {
      // 1. The voice server downloads the Short, transcribes it and isolates its music
      updateStep(0, { status: "active", detail: "Téléchargement de la vidéo depuis YouTube…" });
      // Always isolate the voice: Whisper transcribes it better without the music,
      // and it gives a cleaner sample when reusing the speaker's voice
      const job = await transcribeYouTube(youtubeId, true);
      if (!job.transcript || job.segments.length === 0) throw new Error("Aucune parole détectée dans la vidéo.");
      if (useOriginalVoice && !job.has_original_voice) {
        throw new Error("Pas assez de parole dans la vidéo (5 s minimum) pour reprendre la voix d'origine.");
      }
      const backgroundNote = job.has_background ? " · voix isolée de la musique" : " · séparation voix / musique indisponible";
      updateStep(0, {
        status: "completed",
        detail: `${job.segments.length} phrases · langue « ${job.language ?? "?"} » · ${Math.round(job.duration)} s${backgroundNote}`,
      });

      // 2. Record the project
      updateStep(1, { status: "active" });
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: `Short FR · ${job.title?.slice(0, 80) || youtubeId}`,
          script: job.transcript,
          source_language: job.language?.toUpperCase() ?? "Auto",
          target_language: "Français",
          voice_type: voiceMode === "standard" ? `edge:${standardVoice}`
            : useOriginalVoice || !voice ? "original" : `local:${voice.name}`,
          video_format: "shorts",
          status: "processing",
          duration_seconds: Math.round(job.duration),
          progress: 20,
        })
        .select("id")
        .single();
      if (projectError || !project) throw new Error(projectError?.message || "Impossible de créer le projet");
      projectId = project.id;
      updateStep(1, { status: "completed" });

      // 3. Translate phrase by phrase, keeping the [n] markers so each phrase keeps its timing
      updateStep(2, { status: "active" });
      const translation = await invokeFunction<{ translatedText: string; creditsUsed?: number }>("translate-text", {
        text: numberSegments(job.segments),
        targetLanguage: "French",
      });
      creditsUsed += translation.creditsUsed ?? 0;
      const frenchSegments = parseNumberedTranslation(translation.translatedText, job.segments);
      const frenchText = frenchSegments
        ? frenchSegments.map((s) => s.text).join(" ")
        : translation.translatedText.replace(/^\s*\[\d+\]\s*/gm, "").trim();
      const content: DubContent = frenchSegments ? { segments: frenchSegments } : { text: frenchText };
      await supabase
        .from("projects")
        .update({ translated_text: frenchText, credits_used: creditsUsed, progress: 50 })
        .eq("id", projectId);
      updateStep(2, {
        status: "completed",
        detail: frenchSegments
          ? `${frenchSegments.length} phrases traduites`
          : `${frenchText.length} caractères (phrases non alignées : la voix suivra le texte d'un seul bloc)`,
      });

      // 4. Speak the French phrases and rebuild the video
      updateStep(3, {
        status: "active",
        detail: voiceMode === "standard"
          ? "Génération de la voix standard…"
          : server.status === "online" && server.health.device === "cpu"
            ? "Voix clonée sur CPU : comptez 10 à 20 minutes pour un Short d'une minute. Gardez cette page ouverte…"
            : "Peut prendre quelques minutes (chargement du modèle la première fois)…",
      });
      const dub = await dubVideo(job.job_id, content, {
        engine: voiceMode === "standard" ? "standard" : "clone",
        voiceId: voiceMode === "mine" ? voice?.id ?? null : null,
        standardVoice,
        keepBackground,
        subtitles,
      });
      const srtUrl = await getSubtitles(job.job_id).then((blob) => URL.createObjectURL(blob)).catch(() => null);
      const notes = [
        `Voix : ${dub.speechDuration.toFixed(1)} s pour ${dub.videoDuration.toFixed(1)} s de vidéo`,
        dub.background ? "musique d'origine conservée" : "piste d'origine remplacée",
        dub.subtitles === "burn" && "sous-titres incrustés",
        dub.subtitles === "track" && "piste de sous-titres ajoutée",
        dub.tempo > 1.01 && `certaines phrases accélérées jusqu'à ×${dub.tempo.toFixed(2)}`,
        dub.overflow > 0.2 && `${dub.overflow.toFixed(1)} s coupées à la fin`,
      ].filter(Boolean);
      updateStep(3, { status: "completed", detail: notes.join(" · ") });
      setResult({ url: URL.createObjectURL(dub.video), srtUrl, projectId });

      // 5. Store the final video
      updateStep(4, { status: "active" });
      const videoPath = `${user.id}/${projectId}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(videoPath, dub.video, { contentType: "video/mp4" });

      await supabase
        .from("projects")
        .update({
          status: "completed",
          progress: 100,
          output_video_url: uploadError ? null : videoPath,
          error_message: uploadError ? `Vidéo non sauvegardée en ligne : ${uploadError.message}` : null,
          credits_used: creditsUsed,
        })
        .eq("id", projectId);

      if (uploadError) {
        updateStep(4, { status: "error", detail: `${uploadError.message} — téléchargez la vidéo ci-dessous` });
        toast.warning("Vidéo générée mais non sauvegardée en ligne. Téléchargez-la maintenant.");
      } else {
        updateStep(4, { status: "completed", detail: `${(dub.video.size / (1024 * 1024)).toFixed(1)} Mo` });
        toast.success("Votre Short en français est prêt !");
      }
    } catch (error) {
      console.error("Short dubbing error:", error);
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error(message);
      setPipeline((prev) => prev && prev.map((s) => (s.status === "active" ? { ...s, status: "error", detail: message } : s)));
      if (projectId) {
        await supabase
          .from("projects")
          .update({ status: "failed", error_message: message, credits_used: creditsUsed })
          .eq("id", projectId);
      }
    } finally {
      setRunning(false);
    }
  };

  const download = (url: string, extension: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `short-fr-${youtubeId ?? "video"}.${extension}`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-foreground" />
            </div>
            <span className="text-xl font-bold">VoiceForge</span>
          </Link>
          <Link to="/dashboard">
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Mes projets
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-primary" />
              Short en français, avec votre voix
            </h1>
            <p className="text-muted-foreground">
              Importez un Short YouTube : il est transcrit, traduit en français, puis redoublé avec votre propre voix.
            </p>
          </div>

          {/* Voice server status */}
          <div className={cn(
            "glass-card p-4 flex items-start gap-3",
            server.status === "offline" && "border border-destructive/30",
          )}>
            <Server className={cn(
              "w-5 h-5 shrink-0 mt-0.5",
              server.status === "online" ? "text-green-500" : server.status === "offline" ? "text-destructive" : "text-muted-foreground",
            )} />
            <div className="flex-1 text-sm">
              {server.status === "checking" && <span>Connexion au serveur vocal…</span>}
              {server.status === "online" && (
                <span>
                  Serveur vocal connecté · {server.health.gpu ?? "CPU (lent)"}
                </span>
              )}
              {server.status === "offline" && (
                <div className="space-y-2">
                  <div className="font-medium text-destructive">Serveur vocal injoignable ({VOICE_SERVER_URL})</div>
                  <p className="text-muted-foreground">Lancez-le sur votre machine, puis réessayez :</p>
                  <pre className="bg-muted/50 rounded-md p-3 text-xs overflow-x-auto">
{`cd voice-server
uv run uvicorn server:app --port 8765`}
                  </pre>
                </div>
              )}
            </div>
            {server.status !== "checking" && (
              <Button variant="ghost" size="icon" onClick={checkServer} aria-label="Revérifier le serveur">
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Voice */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mic className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">1. La voix</h3>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mb-4" role="radiogroup" aria-label="Voix du doublage">
              {VOICE_MODES.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={voiceMode === option.mode}
                  onClick={() => setVoiceMode(option.mode)}
                  disabled={running}
                  className={cn(
                    "text-left p-4 rounded-lg border transition-colors",
                    voiceMode === option.mode ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="font-medium text-sm">{option.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{option.text}</div>
                </button>
              ))}
            </div>
            {voiceMode === "standard" ? (
              <div>
                <label className="text-sm font-medium" htmlFor="standard-voice">Voix française</label>
                <select
                  id="standard-voice"
                  value={standardVoice}
                  onChange={(e) => setStandardVoice(e.target.value)}
                  disabled={running}
                  className="mt-1 w-full bg-muted/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {STANDARD_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Voix en ligne de Microsoft : demande une connexion internet, aucun modèle à télécharger.
                </p>
              </div>
            ) : useOriginalVoice ? (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                  disabled={running}
                  className="mt-1 accent-primary"
                />
                <span>
                  J'ai l'autorisation de reproduire la voix de cette personne
                  <span className="block text-xs text-muted-foreground">
                    Un échantillon d'environ 20 s de sa voix est extrait de la vidéo, sur votre machine uniquement.
                  </span>
                </span>
              </label>
            ) : (
              <VoicePicker
                enabled={server.status === "online"}
                selectedVoiceId={voice?.id ?? null}
                onSelect={setVoice}
              />
            )}
          </div>

          {/* Short */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">2. Le Short</h3>
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor="youtube-url">Lien YouTube</label>
              <input
                id="youtube-url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/shorts/…"
                className="mt-1 w-full bg-muted/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {youtubeUrl && !youtubeId && (
                <p className="text-xs text-destructive mt-1">Lien YouTube non reconnu.</p>
              )}
            </div>

            {youtubeId && (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                title="Short YouTube"
                className="w-[200px] aspect-[9/16] rounded-lg bg-black"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>

          <div className="glass-card p-6 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium" htmlFor="subtitles">Sous-titres français</label>
              <select
                id="subtitles"
                value={subtitles}
                onChange={(e) => setSubtitles(e.target.value as SubtitleMode)}
                disabled={running}
                className="mt-1 w-full bg-muted/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {SUBTITLE_MODES.map((m) => <option key={m.mode} value={m.mode}>{m.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Le fichier .srt est toujours téléchargeable.</p>
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={keepBackground}
                onChange={(e) => setKeepBackground(e.target.checked)}
                disabled={running}
                className="mt-1 accent-primary"
              />
              <span>
                Conserver la musique et les bruitages d'origine
                <span className="block text-xs text-muted-foreground">
                  Seule la voix est remplacée. Décochez pour remplacer toute la piste audio.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button variant="hero" size="lg" onClick={start} disabled={!canStart}>
              {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Générer la version française
            </Button>
          </div>

          {/* Pipeline */}
          {pipeline && (
            <div className="glass-card p-6 space-y-3">
              {pipeline.map((step, index) => (
                <div
                  key={step.label}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg",
                    step.status === "completed" && "bg-accent/10",
                    step.status === "active" && "bg-primary/10 border border-primary/30",
                    step.status === "error" && "bg-destructive/10 border border-destructive/30",
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0",
                    step.status === "completed" && "bg-accent text-accent-foreground",
                    step.status === "active" && "bg-primary text-primary-foreground",
                    step.status === "pending" && "bg-muted text-muted-foreground",
                    step.status === "error" && "bg-destructive text-destructive-foreground",
                  )}>
                    {step.status === "completed" ? <Check className="w-3 h-3" />
                      : step.status === "active" ? <Loader2 className="w-3 h-3 animate-spin" />
                      : step.status === "error" ? <AlertCircle className="w-3 h-3" />
                      : index + 1}
                  </div>
                  <div className="flex-1">
                    <span className={cn(step.status === "pending" && "text-muted-foreground", step.status === "error" && "text-destructive")}>
                      {step.label}
                    </span>
                    {step.detail && <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="glass-card p-6 space-y-4">
              <h3 className="font-semibold">Votre Short en français</h3>
              <video src={result.url} controls className="w-full max-w-[320px] mx-auto aspect-[9/16] rounded-lg bg-black object-contain" />
              <div className="flex justify-center gap-3 flex-wrap">
                <Button variant="hero" onClick={() => download(result.url, "mp4")}>
                  <Download className="w-4 h-4" />
                  Télécharger le MP4
                </Button>
                {result.srtUrl && (
                  <Button variant="outline" onClick={() => download(result.srtUrl as string, "srt")}>
                    <Download className="w-4 h-4" />
                    Sous-titres (.srt)
                  </Button>
                )}
                <Link to={`/project/${result.projectId}`}>
                  <Button variant="outline">
                    Voir le projet
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default ShortDubbing;
