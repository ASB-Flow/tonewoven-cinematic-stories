import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Wand2, Plus, Video, Clock, CheckCircle2, 
  AlertCircle, MoreHorizontal, Play, Trash2, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Project {
  id: string;
  title: string;
  status: "draft" | "processing" | "completed" | "failed";
  language: string;
  createdAt: string;
  duration?: string;
}

const mockProjects: Project[] = [
  { id: "1", title: "Motivational Speech - Success", status: "completed", language: "English → French", createdAt: "2 hours ago", duration: "3:45" },
  { id: "2", title: "Morning Affirmations", status: "processing", language: "English → Spanish", createdAt: "5 hours ago" },
  { id: "3", title: "Leadership Mindset", status: "draft", language: "English", createdAt: "1 day ago" },
  { id: "4", title: "Overcoming Adversity", status: "completed", language: "English → German", createdAt: "2 days ago", duration: "5:12" },
];

const statusConfig = {
  draft: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: "Draft" },
  processing: { icon: Clock, color: "text-primary", bg: "bg-primary/10", label: "Processing" },
  completed: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
  failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
};

export const Dashboard = () => {
  const [projects] = useState<Project[]>(mockProjects);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-foreground" />
            </div>
            <span className="text-xl font-bold">VoiceForge</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">50 Credits</div>
              <div className="text-xs text-muted-foreground">Free Plan</div>
            </div>
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
            { label: "Total Projects", value: "12", icon: Video },
            { label: "Completed", value: "8", icon: CheckCircle2 },
            { label: "Processing", value: "2", icon: Clock },
            { label: "Credits Used", value: "45", icon: Wand2 },
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
                  {project.duration && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-background/80 text-xs font-medium">
                      {project.duration}
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
                    <span className="text-xs text-muted-foreground">{project.language}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{project.createdAt}</span>
                    {project.status === "completed" && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
