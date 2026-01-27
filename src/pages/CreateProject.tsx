import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, ArrowLeft, Upload, Languages, User, Flame,
  MonitorPlay, Smartphone, Sparkles, Check, ChevronRight,
  Mic, FileText, Settings, Video
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Step = "script" | "voice" | "settings" | "generate";

const languages = [
  "English", "French", "Spanish", "German", "Italian", 
  "Portuguese", "Dutch", "Polish", "Russian", "Japanese",
  "Chinese", "Korean", "Arabic", "Hindi", "Turkish"
];

const voices = [
  { id: "male-deep", label: "Deep Male", description: "Authoritative, powerful" },
  { id: "male-warm", label: "Warm Male", description: "Friendly, approachable" },
  { id: "female-confident", label: "Confident Female", description: "Strong, inspiring" },
  { id: "female-calm", label: "Calm Female", description: "Soothing, reassuring" },
];

const intensityLevels = [
  { id: "low", label: "Low", description: "Calm and measured delivery" },
  { id: "medium", label: "Medium", description: "Balanced, engaging tone" },
  { id: "high", label: "High", description: "Powerful, intense energy" },
];

const videoFormats = [
  { id: "youtube", label: "YouTube", icon: MonitorPlay, aspect: "16:9" },
  { id: "shorts", label: "Shorts/Reels", icon: Smartphone, aspect: "9:16" },
];

export const CreateProject = () => {
  const [currentStep, setCurrentStep] = useState<Step>("script");
  const [script, setScript] = useState("");
  const [hasReferenceAudio, setHasReferenceAudio] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("French");
  const [selectedVoice, setSelectedVoice] = useState("male-deep");
  const [selectedIntensity, setSelectedIntensity] = useState("high");
  const [selectedFormat, setSelectedFormat] = useState("youtube");

  const steps: { id: Step; label: string; icon: typeof FileText }[] = [
    { id: "script", label: "Script", icon: FileText },
    { id: "voice", label: "Voice", icon: Mic },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "generate", label: "Generate", icon: Video },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
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
            {steps.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = index < currentStepIndex;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                    isActive && "bg-primary/10 border border-primary/30",
                    !isActive && !isCompleted && "hover:bg-muted",
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
                </button>
              );
            })}
          </div>
        </nav>

        <Link to="/dashboard">
          <Button variant="ghost" className="w-full justify-start">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {/* Step 1: Script */}
            {currentStep === "script" && (
              <motion.div
                key="script"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-3xl font-bold mb-2">Enter Your Script</h1>
                  <p className="text-muted-foreground">
                    Paste your motivational content or speech text below.
                  </p>
                </div>

                <div className="glass-card p-6">
                  <label className="block text-sm font-medium mb-2">Script Content</label>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Every champion was once a contender who refused to give up. Today is your day to rise..."
                    className="w-full h-64 bg-muted/50 rounded-lg p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                    <span>{script.length} characters</span>
                    <span>~{Math.ceil(script.split(/\s+/).filter(Boolean).length / 150)} min</span>
                  </div>
                </div>

                {/* Reference Audio Upload */}
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold">Reference Audio (Optional)</h3>
                      <p className="text-sm text-muted-foreground">
                        Upload original audio to preserve the speaking style
                      </p>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium",
                      hasReferenceAudio ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                    )}>
                      {hasReferenceAudio ? "Uploaded" : "Optional"}
                    </div>
                  </div>
                  
                  <div
                    onClick={() => setHasReferenceAudio(true)}
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                  >
                    <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium">Drop audio file or click to upload</p>
                    <p className="text-sm text-muted-foreground mt-1">MP3, WAV, M4A up to 50MB</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button variant="hero" size="lg" onClick={nextStep} disabled={!script.trim()}>
                    Continue to Voice
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Voice Settings */}
            {currentStep === "voice" && (
              <motion.div
                key="voice"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-3xl font-bold mb-2">Voice Configuration</h1>
                  <p className="text-muted-foreground">
                    Select the target language and voice characteristics.
                  </p>
                </div>

                {/* Language Selection */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Languages className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Target Language</h3>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setSelectedLanguage(lang)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                          selectedLanguage === lang
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Type */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Voice Type</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {voices.map((voice) => (
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

                {/* Intensity */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Flame className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Intensity Level</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {intensityLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => setSelectedIntensity(level.id)}
                        className={cn(
                          "p-4 rounded-lg text-center transition-all border-2",
                          selectedIntensity === level.id
                            ? "border-primary bg-primary/10"
                            : "border-transparent bg-muted hover:bg-muted/80"
                        )}
                      >
                        <div className="font-medium">{level.label}</div>
                        <div className="text-xs text-muted-foreground mt-1">{level.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" size="lg" onClick={prevStep}>
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back
                  </Button>
                  <Button variant="hero" size="lg" onClick={nextStep}>
                    Continue to Settings
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Video Settings */}
            {currentStep === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-3xl font-bold mb-2">Video Settings</h1>
                  <p className="text-muted-foreground">
                    Configure the output format and visual preferences.
                  </p>
                </div>

                {/* Video Format */}
                <div className="glass-card p-6">
                  <h3 className="font-semibold mb-4">Video Format</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {videoFormats.map((format) => (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={cn(
                          "p-6 rounded-lg text-center transition-all border-2",
                          selectedFormat === format.id
                            ? "border-primary bg-primary/10"
                            : "border-transparent bg-muted hover:bg-muted/80"
                        )}
                      >
                        <format.icon className="w-10 h-10 mx-auto mb-3 text-primary" />
                        <div className="font-medium">{format.label}</div>
                        <div className="text-sm text-muted-foreground">{format.aspect}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="glass-card p-6">
                  <h3 className="font-semibold mb-4">Summary</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Script Length</span>
                      <span>{script.split(/\s+/).filter(Boolean).length} words</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Language</span>
                      <span>{selectedLanguage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Voice Type</span>
                      <span>{voices.find(v => v.id === selectedVoice)?.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Intensity</span>
                      <span className="capitalize">{selectedIntensity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Format</span>
                      <span>{videoFormats.find(f => f.id === selectedFormat)?.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference Audio</span>
                      <span>{hasReferenceAudio ? "Uploaded" : "None"}</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between font-medium">
                      <span>Credits Required</span>
                      <span className="text-primary">5 credits</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" size="lg" onClick={prevStep}>
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back
                  </Button>
                  <Button variant="hero" size="lg" onClick={nextStep}>
                    <Sparkles className="w-5 h-5" />
                    Generate Video
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Generation */}
            {currentStep === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h1 className="text-3xl font-bold mb-2">Generating Your Video</h1>
                  <p className="text-muted-foreground">
                    This typically takes 2-5 minutes depending on video length.
                  </p>
                </div>

                <div className="glass-card p-8">
                  {/* Progress Circle */}
                  <div className="flex justify-center mb-8">
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="hsl(var(--muted))"
                          strokeWidth="8"
                        />
                        <motion.circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="url(#gradient)"
                          strokeWidth="8"
                          strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 0.65 }}
                          transition={{ duration: 2, ease: "easeOut" }}
                          style={{ strokeDasharray: "283", strokeDashoffset: "0" }}
                        />
                        <defs>
                          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="hsl(var(--primary))" />
                            <stop offset="100%" stopColor="hsl(var(--accent))" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl font-bold">65%</span>
                      </div>
                    </div>
                  </div>

                  {/* Pipeline Steps */}
                  <div className="space-y-3">
                    {[
                      { label: "Analyzing voice style", status: "completed" },
                      { label: "Translating script to French", status: "completed" },
                      { label: "Generating voiceover", status: "active" },
                      { label: "Selecting visuals", status: "pending" },
                      { label: "Assembling video", status: "pending" },
                      { label: "Applying final touches", status: "pending" },
                    ].map((step, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          step.status === "completed" && "bg-accent/10",
                          step.status === "active" && "bg-primary/10 border border-primary/30"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                          step.status === "completed" && "bg-accent text-accent-foreground",
                          step.status === "active" && "bg-primary text-primary-foreground animate-pulse",
                          step.status === "pending" && "bg-muted text-muted-foreground"
                        )}>
                          {step.status === "completed" ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <span className={cn(
                          step.status === "pending" && "text-muted-foreground",
                          step.status === "active" && "text-foreground font-medium"
                        )}>
                          {step.label}
                        </span>
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

                <p className="text-center text-sm text-muted-foreground">
                  You can close this page. We'll email you when your video is ready.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default CreateProject;
