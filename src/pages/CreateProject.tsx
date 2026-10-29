import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, ArrowLeft, Sparkles, Check, ChevronRight,
  Mic, FileText, Loader2, Globe, Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AUDIO_BUCKET, generateSpeech, getAudioDuration, invokeFunction, voiceOptions } from "@/lib/audio";

type Step = "text" | "processing";

type PipelineStep = {
  label: string;
  status: "pending" | "active" | "completed" | "error";
  detail?: string;
};

const initialPipeline = (): PipelineStep[] => [
  { label: "Création du projet", status: "pending" },
  { label: "Traduction en français", status: "pending" },
  { label: "Génération de l'audio français", status: "pending" },
  { label: "Sauvegarde de l'audio", status: "pending" },
];

export const CreateProject = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>("text");
  const [sourceText, setSourceText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(voiceOptions[0].id);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(initialPipeline);

  const updatePipelineStep = useCallback((index: number, update: Partial<PipelineStep>) => {
    setPipelineSteps(prev => prev.map((step, i) => i === index ? { ...step, ...update } : step));
  }, []);

  const getProgress = () => {
    const completed = pipelineSteps.filter(s => s.status === "completed").length;
    return Math.round((completed / pipelineSteps.length) * 100);
  };

  const startPipeline = async () => {
    const text = sourceText.trim();
    if (!user || !text) return;

    setCurrentStep("processing");
    setPipelineSteps(initialPipeline());

    let projectId: string | null = null;
    let creditsUsed = 0;

    try {
      // Step 1: create the project right away so failures are recorded too
      updatePipelineStep(0, { status: "active" });
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: text.slice(0, 60) + (text.length > 60 ? "…" : ""),
          script: text,
          target_language: "Français",
          source_language: "Auto",
          voice_type: selectedVoice,
          status: "processing",
          progress: 0,
        })
        .select("id")
        .single();

      if (projectError || !project) {
        throw new Error(projectError?.message || "Impossible de créer le projet");
      }
      projectId = project.id;
      updatePipelineStep(0, { status: "completed", detail: `${text.length} caractères` });

      // Step 2: translate
      updatePipelineStep(1, { status: "active" });
      const translation = await invokeFunction<{ translatedText: string; creditsUsed?: number }>("translate-text", {
        text,
        targetLanguage: "French",
      });
      creditsUsed += translation.creditsUsed ?? 0;
      await supabase
        .from("projects")
        .update({ translated_text: translation.translatedText, credits_used: creditsUsed, progress: 33 })
        .eq("id", projectId);
      updatePipelineStep(1, { status: "completed", detail: `${translation.translatedText.length} caractères traduits` });

      // Step 3: generate the voice-over
      updatePipelineStep(2, { status: "active" });
      let audio: Blob | null = null;
      try {
        const speech = await generateSpeech(translation.translatedText, selectedVoice, (done, total) => {
          if (total > 1) updatePipelineStep(2, { detail: `Segment ${done}/${total}` });
        });
        audio = speech.blob;
        creditsUsed += speech.creditsUsed;
        updatePipelineStep(2, { status: "completed", detail: `${Math.round(audio.size / 1024)} Ko` });
      } catch (ttsError) {
        // The translation is still useful: keep the project and fall back to the browser voice
        const message = ttsError instanceof Error ? ttsError.message : "Erreur inconnue";
        console.error("TTS error:", ttsError);
        updatePipelineStep(2, { status: "error", detail: `${message} — la voix du navigateur sera utilisée` });
        toast.warning("Audio non généré : la voix du navigateur sera utilisée à la place.");
      }

      // Step 4: store the audio
      updatePipelineStep(3, { status: "active" });
      let audioPath: string | null = null;
      let duration: number | null = null;
      if (audio) {
        audioPath = `${user.id}/${projectId}.mp3`;
        const { error: uploadError } = await supabase.storage
          .from(AUDIO_BUCKET)
          .upload(audioPath, audio, { contentType: "audio/mpeg" });
        if (uploadError) throw new Error(`Échec de la sauvegarde de l'audio : ${uploadError.message}`);
        duration = await getAudioDuration(audio);
      }

      const { error: finalError } = await supabase
        .from("projects")
        .update({
          status: "completed",
          progress: 100,
          output_audio_path: audioPath,
          duration_seconds: duration,
          credits_used: creditsUsed,
        })
        .eq("id", projectId);
      if (finalError) throw new Error(finalError.message);

      updatePipelineStep(3, { status: "completed", detail: audioPath ? "Audio sauvegardé" : "Aucun audio à sauvegarder" });
      toast.success("Projet terminé !");
      navigate(`/project/${projectId}`);
    } catch (error) {
      console.error("Pipeline error:", error);
      const errorMsg = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error(errorMsg);

      setPipelineSteps(prev => prev.map(step =>
        step.status === "active" ? { ...step, status: "error", detail: errorMsg } : step
      ));

      if (projectId) {
        await supabase
          .from("projects")
          .update({ status: "failed", error_message: errorMsg, credits_used: creditsUsed })
          .eq("id", projectId);
      }
    }
  };

  const hasError = pipelineSteps.some(s => s.status === "error") && !pipelineSteps.some(s => s.status === "active");
  const wordCount = sourceText.split(/\s+/).filter(Boolean).length;

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
              { id: "text" as Step, label: "Texte et voix", icon: FileText },
              { id: "processing" as Step, label: "Traitement", icon: Loader2 },
            ].map((step, index) => {
              const isActive = step.id === currentStep;
              const stepOrder: Step[] = ["text", "processing"];
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
            Retour au tableau de bord
          </Button>
        </Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {/* Step 1: text and voice */}
            {currentStep === "text" && (
              <motion.div
                key="text"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-3xl font-bold mb-2">Nouveau projet</h1>
                  <p className="text-muted-foreground">
                    Collez un texte : il sera traduit en français puis converti en audio avec la voix de votre choix.
                  </p>
                </div>

                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Texte à transformer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Transcription, script, discours… dans n'importe quelle langue.
                  </p>
                  <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    maxLength={20000}
                    placeholder="Collez ici le texte à transformer en audio français..."
                    className="w-full h-48 bg-muted/50 rounded-lg p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="text-xs text-muted-foreground mt-2">
                    {sourceText.length} / 20 000 caractères · ~{Math.ceil(wordCount / 150)} min d'audio
                  </div>
                </div>

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

                <div className="glass-card p-6">
                  <h3 className="font-semibold mb-3">Pipeline de traitement</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400">
                      <FileText className="w-3.5 h-3.5" />
                      Texte
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
                  <p className="text-xs text-muted-foreground mt-3">
                    Coût : 2 crédits pour la traduction + 3 crédits par segment audio (~4 500 caractères).
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="hero"
                    size="lg"
                    onClick={startPipeline}
                    disabled={sourceText.trim().length < 10}
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
                    Ne fermez pas cette page pendant le traitement.
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

                {hasError && (
                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={() => setCurrentStep("text")}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Réessayer
                    </Button>
                    <Link to="/dashboard">
                      <Button variant="ghost">Voir mes projets</Button>
                    </Link>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default CreateProject;
