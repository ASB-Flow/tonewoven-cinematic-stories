import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Wand2, Plus, Video, Clock, CheckCircle2,
  AlertCircle, Play, Trash2, Download, LogOut, Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { deleteProject, downloadProjectFile } from "@/lib/audio";

interface Project {
  id: string;
  title: string;
  status: "draft" | "processing" | "completed" | "failed";
  target_language: string;
  source_language: string;
  created_at: string;
  duration_seconds: number | null;
  output_audio_path: string | null;
  // Storage path of the dubbed video (Short FR projects)
  output_video_url: string | null;
}

interface Credits {
  balance: number;
  plan: string;
}

const statusConfig = {
  draft: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: "Brouillon" },
  processing: { icon: Clock, color: "text-primary", bg: "bg-primary/10", label: "En cours" },
  completed: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Terminé" },
  failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Échec" },
};

const formatDuration = (seconds: number | null) => {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("id, title, status, target_language, source_language, created_at, duration_seconds, output_audio_path, output_video_url")
        .order("created_at", { ascending: false });

      if (projectsError) {
        toast.error("Impossible de charger les projets");
      } else {
        setProjects(projectsData || []);
      }

      const { data: creditsData, error: creditsError } = await supabase
        .from("credits")
        .select("balance, plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (creditsError) {
        console.error("Credits error:", creditsError);
      } else {
        setCredits(creditsData);
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    const { id, output_audio_path, output_video_url } = projectToDelete;
    setProjectToDelete(null);
    try {
      await deleteProject(id, [output_audio_path, output_video_url]);
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success("Projet supprimé");
    } catch {
      toast.error("Échec de la suppression");
    }
  };

  const handleDownload = async (project: Project) => {
    const path = project.output_video_url || project.output_audio_path;
    if (!path) return;
    try {
      await downloadProjectFile(path, project.title);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec du téléchargement");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Déconnecté");
  };

  const completedCount = projects.filter(p => p.status === "completed").length;
  const processingCount = projects.filter(p => p.status === "processing").length;
  const creditsLabel = credits ? credits.balance.toString() : "—";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-foreground" />
            </div>
            <span className="text-xl font-bold">VoiceForge</span>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{creditsLabel} crédits</div>
              {credits && <div className="text-xs text-muted-foreground capitalize">Offre {credits.plan}</div>}
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Se déconnecter">
              <LogOut className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Mes projets</h1>
            <p className="text-muted-foreground">Créez et gérez vos projets audio et vidéo</p>
          </div>
          <div className="flex gap-3">
            <Link to="/short">
              <Button variant="outline" size="lg">
                <Smartphone className="w-5 h-5" />
                Short en français
              </Button>
            </Link>
            <Link to="/create">
              <Button variant="hero" size="lg" className="group">
                <Plus className="w-5 h-5" />
                Nouveau projet
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Projets", value: projects.length.toString(), icon: Video },
            { label: "Terminés", value: completedCount.toString(), icon: CheckCircle2 },
            { label: "En cours", value: processingCount.toString(), icon: Clock },
            { label: "Crédits disponibles", value: creditsLabel, icon: Wand2 },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <stat.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Aucun projet pour l'instant</h3>
            <p className="text-muted-foreground mb-6">Créez votre premier projet pour commencer</p>
            <Link to="/create">
              <Button variant="hero" size="lg">
                <Plus className="w-5 h-5" />
                Créer un projet
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, index) => {
              const status = statusConfig[project.status];
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="glass-card overflow-hidden group hover:glow-primary transition-all duration-300 cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {project.status === "completed" ? (
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          className="w-14 h-14 rounded-full bg-foreground/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Play className="w-6 h-6 text-background ml-1" />
                        </motion.div>
                      ) : project.status === "processing" ? (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 backdrop-blur-sm">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-sm font-medium">En cours...</span>
                        </div>
                      ) : (
                        <Video className="w-12 h-12 text-muted-foreground/50" />
                      )}
                    </div>
                    {project.duration_seconds && (
                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-background/80 text-xs font-medium">
                        {formatDuration(project.duration_seconds)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold line-clamp-1 mb-2">{project.title}</h3>

                    <div className="flex items-center gap-2 mb-3">
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        <status.icon className="w-3 h-3" />
                        {status.label}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {project.source_language} → {project.target_language}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(project.created_at), { addSuffix: true, locale: fr })}</span>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {(project.output_video_url || project.output_audio_path) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Télécharger"
                            onClick={() => handleDownload(project)}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Supprimer le projet"
                          onClick={() => setProjectToDelete(project)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={projectToDelete !== null} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce projet ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {projectToDelete?.title} » sera définitivement supprimé, avec sa traduction et son audio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
