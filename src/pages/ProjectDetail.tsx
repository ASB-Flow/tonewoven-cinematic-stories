import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Wand2, Download, Trash2, FileText, Languages, Volume2,
  Play, Square, AlertCircle, Loader2, Clock, Video
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  deleteProject, downloadProjectFile, getSignedAudioUrl, speakWithBrowser, stopBrowserSpeech, voiceOptions,
} from "@/lib/audio";

type Project = Tables<"projects">;

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

export const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) {
        toast.error("Impossible de charger le projet");
      }
      setProject(data);
      try {
        if (data?.output_audio_path) setAudioUrl(await getSignedAudioUrl(data.output_audio_path));
        // output_video_url holds a storage path, like output_audio_path
        if (data?.output_video_url) setVideoUrl(await getSignedAudioUrl(data.output_video_url));
      } catch (fileError) {
        console.error(fileError);
        toast.error("Impossible de charger le fichier du projet");
      }
      setLoading(false);
    };
    load();
    return () => stopBrowserSpeech();
  }, [id]);

  const toggleBrowserSpeech = () => {
    if (!project?.translated_text) return;
    if (isSpeaking) {
      stopBrowserSpeech();
      setIsSpeaking(false);
      return;
    }
    const started = speakWithBrowser(project.translated_text, () => setIsSpeaking(false));
    if (started) setIsSpeaking(true);
    else toast.error("La synthèse vocale n'est pas disponible dans ce navigateur.");
  };

  const handleDownload = async (path: string | null) => {
    if (!project || !path) return;
    try {
      await downloadProjectFile(path, project.title);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec du téléchargement");
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    try {
      await deleteProject(project.id, [project.output_audio_path, project.output_video_url]);
      toast.success("Projet supprimé");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de la suppression");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Ce projet n'existe pas ou a été supprimé.</p>
        <Link to="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au tableau de bord
          </Button>
        </Link>
      </div>
    );
  }

  const voice = voiceOptions.find((v) => v.id === project.voice_type);

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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2 break-words">{project.title}</h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(project.created_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                {voice && ` · Voix ${voice.label}`}
                {` · ${project.credits_used} crédits`}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive hover:text-destructive shrink-0">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce projet ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Le texte, la traduction et l'audio seront définitivement supprimés.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {project.status === "failed" && (
            <div className="glass-card p-4 border border-destructive/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Le traitement a échoué</div>
                {project.error_message && (
                  <p className="text-sm text-muted-foreground mt-1">{project.error_message}</p>
                )}
              </div>
            </div>
          )}

          {project.status === "processing" && (
            <div className="glass-card p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-sm">Traitement en cours ou interrompu (page fermée pendant la génération).</span>
            </div>
          )}

          {/* Dubbed video (Short FR) */}
          {videoUrl && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Video className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Vidéo en français</h3>
                </div>
                <Button variant="outline" onClick={() => handleDownload(project.output_video_url)}>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger le MP4
                </Button>
              </div>
              <video controls src={videoUrl} className="w-full max-h-[70vh] rounded-lg bg-black" />
            </div>
          )}

          {/* Audio */}
          {!videoUrl && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Audio en français</h3>
              </div>
              {project.duration_seconds && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatDuration(project.duration_seconds)}
                </span>
              )}
            </div>

            {audioUrl ? (
              <div className="flex items-center gap-4">
                <audio controls src={audioUrl} className="flex-1" />
                <Button variant="outline" onClick={() => handleDownload(project.output_audio_path)}>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger
                </Button>
              </div>
            ) : project.translated_text ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Aucun fichier audio n'a été généré pour ce projet. Vous pouvez l'écouter avec la voix du navigateur.
                </p>
                <Button variant="hero" onClick={toggleBrowserSpeech}>
                  {isSpeaking ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isSpeaking ? "Arrêter" : "Écouter (voix du navigateur)"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun audio disponible.</p>
            )}
          </div>
          )}

          {/* Source text */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold">Texte original</h3>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
              {project.script}
            </div>
          </div>

          {/* Translation */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Languages className="w-5 h-5 text-green-400" />
              <h3 className="font-semibold">Traduction française</h3>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
              {project.translated_text || <span className="text-muted-foreground">Pas de traduction enregistrée.</span>}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default ProjectDetail;
