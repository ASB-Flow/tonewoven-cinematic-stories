import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { 
  Wand2, Plus, Video, Clock, CheckCircle2, 
  AlertCircle, MoreHorizontal, Play, Trash2, Download, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Project {
  id: string;
  title: string;
  status: "draft" | "processing" | "completed" | "failed";
  target_language: string;
  source_language: string;
  created_at: string;
  duration_seconds?: number;
}

interface Credits {
  balance: number;
  plan: string;
}

const statusConfig = {
  draft: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: "Draft" },
  processing: { icon: Clock, color: "text-primary", bg: "bg-primary/10", label: "Processing" },
  completed: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
  failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
};

const formatDuration = (seconds?: number) => {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      // Fetch projects
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (projectsError) {
        toast.error("Failed to load projects");
      } else {
        setProjects(projectsData || []);
      }
      
      // Fetch credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("credits")
        .select("*")
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

  const handleDeleteProject = async (projectId: string) => {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);
    
    if (error) {
      toast.error("Failed to delete project");
    } else {
      setProjects(projects.filter(p => p.id !== projectId));
      toast.success("Project deleted");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
  };

  const completedCount = projects.filter(p => p.status === "completed").length;
  const processingCount = projects.filter(p => p.status === "processing").length;

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
              <div className="text-sm font-medium">{credits?.balance ?? 50} Credits</div>
              <div className="text-xs text-muted-foreground capitalize">{credits?.plan ?? 'Free'} Plan</div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
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
            <h1 className="text-3xl font-bold mb-2">My Projects</h1>
            <p className="text-muted-foreground">Create and manage your video projects</p>
          </div>
          <Link to="/create">
            <Button variant="hero" size="lg" className="group">
              <Plus className="w-5 h-5" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Projects", value: projects.length.toString(), icon: Video },
            { label: "Completed", value: completedCount.toString(), icon: CheckCircle2 },
            { label: "Processing", value: processingCount.toString(), icon: Clock },
            { label: "Credits Available", value: (credits?.balance ?? 50).toString(), icon: Wand2 },
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
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-6">Create your first video project to get started</p>
            <Link to="/create">
              <Button variant="hero" size="lg">
                <Plus className="w-5 h-5" />
                Create Project
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
                  className="glass-card overflow-hidden group hover:glow-primary transition-all duration-300"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {project.status === "completed" ? (
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          className="w-14 h-14 rounded-full bg-foreground/90 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Play className="w-6 h-6 text-background ml-1" />
                        </motion.div>
                      ) : project.status === "processing" ? (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 backdrop-blur-sm">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-sm font-medium">Processing...</span>
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
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold line-clamp-1">{project.title}</h3>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                    
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
                      <span>{formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}</span>
                      <div className="flex gap-1">
                        {project.status === "completed" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteProject(project.id)}
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
    </div>
  );
};

export default Dashboard;
