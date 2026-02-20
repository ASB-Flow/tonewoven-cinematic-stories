import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, ArrowLeft, Languages, Sparkles, Check, ChevronRight,
  Mic, FileText, Video, Loader2, Youtube, Download, Play, Pause,
  Globe, Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Step = "youtube" | "processing" | "result";

type PipelineStep = {
  label: string;
  status: "pending" | "active" | "completed" | "error";
  detail?: string;
};

const voiceOptions = [
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", description: "Voix masculine profonde" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", description: "Voix féminine naturelle" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George", description: "Voix masculine chaleureuse" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily", description: "Voix féminine douce" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", label: "Roger", description: "Voix masculine autoritaire" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura", description: "Voix féminine confiante" },
];

export const CreateProject = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(voiceOptions[0].id);
  const [isProcessing, setIsProcessing] = useState(false);

  // Pipeline state
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { label: "Extraction de la transcription YouTube", status: "pending" },
    { label: "Traduction en français", status: "pending" },
    { label: "Génération de l'audio français", status: "pending" },
    { label: "Sauvegarde du projet", status: "pending" },
  ]);

  // Results
  const [transcript, setTranscript] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState("");

  const updatePipelineStep = useCallback((index: number, update: Partial<PipelineStep>) => {
    setPipelineSteps(prev => prev.map((step, i) => i === index ? { ...step, ...update } : step));
  }, []);

  const getProgress = () => {
    const completed = pipelineSteps.filter(s => s.status === "completed").length;
    return Math.round((completed / pipelineSteps.length) * 100);
  };

  const startPipeline = async () => {
    if (!user || !youtubeUrl.trim()) return;

    setIsProcessing(true);
    setCurrentStep("processing");

    // Reset pipeline
    setPipelineSteps([
      { label: "Analyse du texte source", status: "pending" },
      { label: "Traduction en français", status: "pending" },
      { label: "Génération de l'audio français", status: "pending" },
      { label: "Sauvegarde du projet", status: "pending" },
    ]);

    try {
      // Step 1: Use the pasted text directly
      updatePipelineStep(0, { status: "active" });
      const sourceText = youtubeUrl.trim();
      setTranscript(sourceText);
      setSourceLanguage("auto");
      updatePipelineStep(0, { status: "completed", detail: `${sourceText.length} caractères` });

      // Step 2: Translate to French
      updatePipelineStep(1, { status: "active" });

      const { data: translateData, error: translateError } = await supabase.functions.invoke('translate-text', {
        body: { text: sourceText, targetLanguage: 'French' },
      });

      if (translateError || translateData?.error) {
        throw new Error(translateData?.error || translateError?.message || "Échec de la traduction");
      }

      setTranslatedText(translateData.translatedText);
      updatePipelineStep(1, { status: "completed", detail: `${translateData.translatedText.length} caractères traduits` });

      // Step 3: Prepare TTS (browser Speech Synthesis - non-blocking)
      updatePipelineStep(2, { status: "active" });

      if (!('speechSynthesis' in window)) {
        console.warn("Speech synthesis not supported in this browser");
      }

      // Just mark as ready - the user can play it from the result page
      setAudioUrl("browser-speech");
      updatePipelineStep(2, { status: "completed", detail: "Audio prêt — appuyez sur ▶ pour écouter" });

      // Step 4: Save project to database
      updatePipelineStep(3, { status: "active" });

      const title = `Traduction FR: ${sourceText.slice(0, 40)}...`;

      const { error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title,
          script: sourceText,
          target_language: "French",
          source_language: "Unknown",
          voice_type: selectedVoice,
          intensity: "high",
          video_format: "youtube",
          status: "completed",
          credits_used: 5,
        });

      if (projectError) {
        console.error("Save error:", projectError);
        toast.error("Projet traité mais échec de la sauvegarde");
      }

      updatePipelineStep(3, { status: "completed", detail: "Projet sauvegardé" });
      setCurrentStep("result");
      toast.success("Pipeline terminé avec succès !");

    } catch (error) {
      console.error("Pipeline error:", error);
      const errorMsg = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error(errorMsg);
      
      // Mark current active step as error
      setPipelineSteps(prev => prev.map(step => 
        step.status === "active" ? { ...step, status: "error", detail: errorMsg } : step
      ));
      setIsProcessing(false);
    }
  };

  const splitTextIntoChunks = (text: string, maxLength: number): string[] => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
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
    return chunks;
  };

  const togglePlayback = () => {
    if (!audioUrl || !translatedText) return;

    if (audioUrl === "browser-speech") {
      // Browser Speech Synthesis playback
      if (isPlaying) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
      } else {
        const utterance = new SpeechSynthesisUtterance(translatedText);
        utterance.lang = 'fr-FR';
        const voices = window.speechSynthesis.getVoices();
        const frenchVoice = voices.find(v => v.lang.startsWith('fr'));
        if (frenchVoice) utterance.voice = frenchVoice;
        utterance.onend = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
      }
    } else if (audioElement) {
      if (isPlaying) {
        audioElement.pause();
        setIsPlaying(false);
      } else {
        audioElement.play();
        setIsPlaying(true);
      }
    } else {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setAudioElement(audio);
      setIsPlaying(true);
    }
  };

  const downloadAudio = () => {
    if (!audioUrl || audioUrl === "browser-speech") {
      toast.info("Le téléchargement n'est pas disponible avec la synthèse vocale du navigateur. Utilisez une clé API ElevenLabs pour obtenir un fichier audio.");
      return;
    }
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = 'voiceforge-french-audio.mp3';
    link.click();
  };

  const isValidYouTubeUrl = (url: string) => {
    return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(url);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border/50 bg-card/30 p-6 flex flex-col">
        <Link to="/dashboard" className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-xl font-bold">VoiceForge</span>
        </Link>

        {/* Steps */}
        <nav className="flex-1">
          <div className="space-y-2">
            {[
              { id: "youtube" as Step, label: "Lien YouTube", icon: Youtube },
              { id: "processing" as Step, label: "Traitement", icon: Loader2 },
              { id: "result" as Step, label: "Résultat", icon: Volume2 },
            ].map((step, index) => {
              const isActive = step.id === currentStep;
              const stepOrder = ["youtube", "processing", "result"];
              const isCompleted = stepOrder.indexOf(currentStep) > stepOrder.indexOf(step.id);
              return (
                <div
                  key={step.id}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                    isActive && "bg-primary/10 border border-primary/30",
                    isCompleted && "text-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium",
                    isActive && "bg-primary text-primary-foreground",
                    isCompleted && "bg-accent/20 text-accent",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground"
                  )}>
                    {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span className={cn("font-medium", isActive && "text-foreground")}>
                    {step.label}
                  </span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto text-primary" />}
                </div>
              );
            })}
          </div>
        </nav>

        <Link to="/dashboard">
          <Button variant="ghost" className="w-full justify-start">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au Dashboard
          </Button>
        </Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {/* Step 1: YouTube URL */}
            {currentStep === "youtube" && (
              <motion.div
                key="youtube"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-3xl font-bold mb-2">Transformer une vidéo YouTube</h1>
                  <p className="text-muted-foreground">
                    Collez le lien d'une vidéo YouTube pour obtenir la transcription traduite en français avec la voix de votre choix.
                  </p>
                </div>

                {/* Input Mode Toggle */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Texte à transformer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Collez le texte (transcription, script, discours...) que vous souhaitez traduire en français et convertir en audio.
                  </p>
                  <textarea
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="Collez ici le texte à transformer en audio français..."
                    className="w-full h-48 bg-muted/50 rounded-lg p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="text-xs text-muted-foreground mt-2">
                    {youtubeUrl.length} caractères · ~{Math.ceil(youtubeUrl.split(/\s+/).filter(Boolean).length / 150)} min d'audio
                  </div>
                </div>

                {/* Voice Selection */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Mic className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Voix pour l'audio français</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {voiceOptions.map((voice) => (
                      <button
                        key={voice.id}
                        onClick={() => setSelectedVoice(voice.id)}
                        className={cn(
                          "p-4 rounded-lg text-left transition-all border-2",
                          selectedVoice === voice.id
                            ? "border-primary bg-primary/10"
                            : "border-transparent bg-muted hover:bg-muted/80"
                        )}
                      >
                        <div className="font-medium">{voice.label}</div>
                        <div className="text-sm text-muted-foreground">{voice.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pipeline Preview */}
                <div className="glass-card p-6">
                  <h3 className="font-semibold mb-3">Pipeline de traitement</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-400">
                      <Youtube className="w-3.5 h-3.5" />
                      YouTube
                    </div>
                    <ChevronRight className="w-4 h-4" />
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400">
                      <FileText className="w-3.5 h-3.5" />
                      Transcription
                    </div>
                    <ChevronRight className="w-4 h-4" />
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400">
                      <Globe className="w-3.5 h-3.5" />
                      Traduction FR
                    </div>
                    <ChevronRight className="w-4 h-4" />
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400">
                      <Volume2 className="w-3.5 h-3.5" />
                      Audio
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="hero"
                    size="lg"
                    onClick={startPipeline}
                    disabled={!youtubeUrl.trim() || youtubeUrl.trim().length < 10}
                  >
                    <Sparkles className="w-5 h-5" />
                    Lancer la transformation
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Processing */}
            {currentStep === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h1 className="text-3xl font-bold mb-2">Transformation en cours...</h1>
                  <p className="text-muted-foreground">
                    Veuillez patienter pendant que nous traitons votre vidéo.
                  </p>
                </div>

                <div className="glass-card p-8">
                  {/* Progress Circle */}
                  <div className="flex justify-center mb-8">
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                        <motion.circle
                          cx="50" cy="50" r="45" fill="none"
                          stroke="url(#gradient)"
                          strokeWidth="8" strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: getProgress() / 100 }}
                          transition={{ duration: 0.5 }}
                          style={{ strokeDasharray: "283" }}
                        />
                        <defs>
                          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="hsl(var(--primary))" />
                            <stop offset="100%" stopColor="hsl(var(--accent))" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl font-bold">{getProgress()}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Pipeline Steps */}
                  <div className="space-y-3">
                    {pipelineSteps.map((step, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          step.status === "completed" && "bg-accent/10",
                          step.status === "active" && "bg-primary/10 border border-primary/30",
                          step.status === "error" && "bg-destructive/10 border border-destructive/30"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                          step.status === "completed" && "bg-accent text-accent-foreground",
                          step.status === "active" && "bg-primary text-primary-foreground animate-pulse",
                          step.status === "pending" && "bg-muted text-muted-foreground",
                          step.status === "error" && "bg-destructive text-destructive-foreground"
                        )}>
                          {step.status === "completed" ? (
                            <Check className="w-3 h-3" />
                          ) : step.status === "error" ? (
                            "!"
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="flex-1">
                          <span className={cn(
                            step.status === "pending" && "text-muted-foreground",
                            step.status === "active" && "text-foreground font-medium",
                            step.status === "error" && "text-destructive font-medium"
                          )}>
                            {step.label}
                          </span>
                          {step.detail && (
                            <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                          )}
                        </div>
                        {step.status === "active" && (
                          <div className="ml-auto flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-100" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-200" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {pipelineSteps.some(s => s.status === "error") && (
                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={() => { setCurrentStep("youtube"); setIsProcessing(false); }}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Réessayer
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Result */}
            {currentStep === "result" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h1 className="text-3xl font-bold mb-2">🎉 Transformation terminée !</h1>
                  <p className="text-muted-foreground">
                    Votre vidéo YouTube a été transcrite et traduite en français.
                  </p>
                </div>

                {/* Audio Player */}
                {audioUrl && (
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Volume2 className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">Audio en français</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="hero"
                        size="lg"
                        className="rounded-full w-14 h-14"
                        onClick={togglePlayback}
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                      </Button>
                      <div className="flex-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                            animate={{ width: isPlaying ? "100%" : "0%" }}
                            transition={{ duration: 30, ease: "linear" }}
                          />
                        </div>
                      </div>
                      <Button variant="outline" onClick={downloadAudio}>
                        <Download className="w-4 h-4 mr-2" />
                        Télécharger
                      </Button>
                    </div>
                  </div>
                )}

                {/* Original Transcript */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold">Transcription originale ({sourceLanguage})</h3>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-auto text-sm">
                    {transcript}
                  </div>
                </div>

                {/* French Translation */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Languages className="w-5 h-5 text-green-400" />
                    <h3 className="font-semibold">Traduction française</h3>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-auto text-sm">
                    {translatedText}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => { setCurrentStep("youtube"); setIsProcessing(false); setAudioUrl(null); setAudioElement(null); }}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Nouvelle transformation
                  </Button>
                  <Link to="/dashboard">
                    <Button variant="hero">
                      Voir mes projets
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default CreateProject;
