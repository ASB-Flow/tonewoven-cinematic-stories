import { motion } from "framer-motion";
import { Mic, Video, Sparkles, ArrowRight, Play, Zap, Globe, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Mic,
    title: "Voice Style Preservation",
    description: "Captures speaking pace, emotional intensity, and pause structure from your reference audio.",
  },
  {
    icon: Globe,
    title: "Multi-Language Support",
    description: "Transform your content into 29+ languages while keeping the original delivery style.",
  },
  {
    icon: Video,
    title: "Cinematic Video Assembly",
    description: "Auto-generates visuals with smooth transitions, background music, and professional editing.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Generate a full motivational video in minutes, not hours.",
  },
];

const steps = [
  { number: "01", title: "Paste Your Script", description: "Enter your motivational content or speech text" },
  { number: "02", title: "Upload Reference Audio", description: "Optional: Provide original voice for style matching" },
  { number: "03", title: "Configure Settings", description: "Choose language, voice gender, and intensity" },
  { number: "04", title: "Generate & Download", description: "Get your professionally produced video" },
];

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-foreground" />
            </div>
            <span className="text-xl font-bold">VoiceForge</span>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <Button variant="ghost" size="sm">Features</Button>
            <Button variant="ghost" size="sm">Pricing</Button>
            <Button variant="outline" size="sm">Sign In</Button>
            <Button variant="hero" size="sm">Get Started</Button>
          </motion.div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">AI-Powered Voice Style Preservation</span>
            </motion.div>
            
            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
              Transform Scripts Into
              <span className="block gradient-text">Cinematic Videos</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Preserve the original voice tone, rhythm, and emotional delivery. 
              Generate motivational videos in any language while keeping the soul of your content.
            </p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button variant="hero" size="xl" className="group">
                Start Creating
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button variant="glass" size="xl" className="group">
                <Play className="w-5 h-5" />
                Watch Demo
              </Button>
            </motion.div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-20 relative"
          >
            <div className="glass-card p-2 rounded-2xl glow-primary max-w-5xl mx-auto">
              <div className="bg-card rounded-xl overflow-hidden aspect-video flex items-center justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
                
                {/* Mock Interface */}
                <div className="absolute inset-4 flex gap-4">
                  {/* Left Panel - Script */}
                  <div className="flex-1 bg-muted/30 rounded-lg p-4 backdrop-blur-sm">
                    <div className="h-3 w-20 bg-primary/30 rounded mb-4" />
                    <div className="space-y-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-2 bg-foreground/10 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
                      ))}
                    </div>
                  </div>
                  
                  {/* Right Panel - Controls */}
                  <div className="w-64 bg-muted/30 rounded-lg p-4 backdrop-blur-sm">
                    <div className="h-3 w-16 bg-accent/30 rounded mb-4" />
                    <div className="space-y-3">
                      <div className="h-8 bg-secondary rounded-lg" />
                      <div className="h-8 bg-secondary rounded-lg" />
                      <div className="h-10 bg-gradient-to-r from-primary to-accent rounded-lg mt-6" />
                    </div>
                  </div>
                </div>
                
                {/* Center Play Button */}
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center cursor-pointer glow-primary"
                >
                  <Play className="w-8 h-8 text-foreground ml-1" />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 relative">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need to create professional motivational videos that resonate.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="glass-card p-6 group hover:glow-primary transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-6 bg-card/30">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Four simple steps to create your cinematic masterpiece.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative"
              >
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-primary/50 to-transparent" />
                )}
                <div className="text-5xl font-bold gradient-text mb-4">{step.number}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-3xl" />
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="container mx-auto text-center relative z-10"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Transform Your Content?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Join thousands of creators using VoiceForge to produce stunning motivational videos.
          </p>
          <Button variant="hero" size="xl" className="group">
            Get Started Free
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12 px-6">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-foreground" />
            </div>
            <span className="font-semibold">VoiceForge</span>
          </div>
          <p className="text-muted-foreground text-sm">
            © 2025 VoiceForge. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
