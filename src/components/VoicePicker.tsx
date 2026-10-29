import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Trash2, Check, Loader2, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { createVoice, deleteVoice, listVoices, voiceSampleUrl, type Voice } from "@/lib/voiceServer";

const MAX_RECORDING_SECONDS = 60;
const MIN_RECORDING_SECONDS = 10;

const GUIDE_TEXT = `Bonjour, ceci est un enregistrement de ma voix pour mes vidéos en français.
Je parle calmement, avec mon rythme naturel, comme si je m'adressais à quelqu'un en face de moi.
Chaque personne possède un potentiel immense, souvent caché, qui n'attend qu'à être révélé.
Le succès ne vient pas du hasard : il naît de la vision, de la discipline et de la persévérance.
Aujourd'hui, je choisis d'avancer avec confiance, de grandir chaque jour et d'inspirer ceux qui m'entourent.`;

interface VoicePickerProps {
  enabled: boolean;
  selectedVoiceId: string | null;
  onSelect: (voice: Voice | null) => void;
}

export const VoicePicker = ({ enabled, selectedVoiceId, onSelect }: VoicePickerProps) => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState("Ma voix");
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    listVoices()
      .then((list) => {
        setVoices(list);
        if (!selectedVoiceId && list.length > 0) onSelect(list[0]);
      })
      .catch((error) => toast.error(error.message));
    // Only reload when the server becomes reachable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    audioRef.current?.pause();
  }, []);

  useEffect(() => () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  };

  const startRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      toast.error("Accès au micro refusé.");
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      setRecorded(blob);
      setRecordedUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = recorder;
    recorder.start();

    setRecorded(null);
    setRecordedUrl(null);
    setElapsed(0);
    setRecording(true);
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) stopRecording();
    }, 250);
  };

  const saveVoice = async (audio: Blob, filename: string) => {
    if (!name.trim()) {
      toast.error("Donnez un nom à votre voix.");
      return;
    }
    setSaving(true);
    try {
      const voice = await createVoice(name.trim(), audio, filename);
      setVoices((prev) => [voice, ...prev]);
      onSelect(voice);
      setRecorded(null);
      setRecordedUrl(null);
      setImportFile(null);
      toast.success(`Voix « ${voice.name} » enregistrée (${voice.duration} s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de l'enregistrement de la voix");
    } finally {
      setSaving(false);
    }
  };

  const removeVoice = async (voice: Voice) => {
    try {
      await deleteVoice(voice.id);
      setVoices((prev) => prev.filter((v) => v.id !== voice.id));
      if (selectedVoiceId === voice.id) onSelect(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de la suppression");
    }
  };

  const toggleSample = (voice: Voice) => {
    audioRef.current?.pause();
    if (playingId === voice.id) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(voiceSampleUrl(voice.id));
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(voice.id);
  };

  const extension = recorded?.type.includes("ogg") ? "ogg" : recorded?.type.includes("mp4") ? "m4a" : "webm";

  return (
    <div className="space-y-5">
      {voices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {voices.map((voice) => (
            <div
              key={voice.id}
              onClick={() => onSelect(voice)}
              className={cn(
                "p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-3",
                selectedVoiceId === voice.id ? "border-primary bg-primary/10" : "border-transparent bg-muted hover:bg-muted/80",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {selectedVoiceId === voice.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  {voice.name}
                </div>
                <div className="text-xs text-muted-foreground">Échantillon de {voice.duration} s</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Écouter l'échantillon"
                onClick={(e) => { e.stopPropagation(); toggleSample(voice); }}
              >
                {playingId === voice.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                aria-label="Supprimer la voix"
                onClick={(e) => { e.stopPropagation(); removeVoice(voice); }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0" htmlFor="voice-name">
            {voices.length > 0 ? "Ajouter une voix" : "Créer ma voix"}
          </label>
          <input
            id="voice-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="flex-1 bg-muted/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Nom de la voix"
          />
        </div>

        <Tabs defaultValue="record">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="record"><Mic className="w-4 h-4 mr-2" />Enregistrer</TabsTrigger>
            <TabsTrigger value="import"><Upload className="w-4 h-4 mr-2" />Importer</TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Lisez ce texte à voix haute, dans un endroit calme, avec votre ton naturel ({MIN_RECORDING_SECONDS} à {MAX_RECORDING_SECONDS} secondes) :
            </p>
            <blockquote className="bg-muted/50 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-line">
              {GUIDE_TEXT}
            </blockquote>
            <div className="flex items-center gap-4">
              {recording ? (
                <Button variant="destructive" onClick={stopRecording}>
                  <Square className="w-4 h-4 mr-2" />
                  Arrêter
                </Button>
              ) : (
                <Button variant="outline" onClick={startRecording} disabled={!enabled || saving}>
                  <Mic className="w-4 h-4 mr-2" />
                  {recorded ? "Recommencer" : "Commencer l'enregistrement"}
                </Button>
              )}
              {(recording || recorded) && (
                <span className={cn("text-sm tabular-nums", recording && "text-destructive")}>
                  {recording && "● "}{elapsed} s / {MAX_RECORDING_SECONDS} s
                </span>
              )}
            </div>
            {recordedUrl && !recording && (
              <div className="flex items-center gap-3">
                <audio controls src={recordedUrl} className="flex-1" />
                <Button
                  variant="hero"
                  onClick={() => recorded && saveVoice(recorded, `recording.${extension}`)}
                  disabled={saving || elapsed < MIN_RECORDING_SECONDS}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Utiliser cet enregistrement
                </Button>
              </div>
            )}
            {recorded && !recording && elapsed < MIN_RECORDING_SECONDS && (
              <p className="text-xs text-destructive">Enregistrement trop court : au moins {MIN_RECORDING_SECONDS} secondes.</p>
            )}
          </TabsContent>

          <TabsContent value="import" className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Un fichier audio propre de votre voix seule (MP3, WAV, M4A…), sans musique, de 10 secondes à 1 minute.
            </p>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2 file:text-foreground"
            />
            {importFile && (
              <Button variant="hero" onClick={() => saveVoice(importFile, importFile.name)} disabled={!enabled || saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importer cette voix
              </Button>
            )}
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          L'échantillon reste sur votre machine (dossier voice-server/data), il n'est envoyé à aucun service en ligne.
        </p>
      </div>
    </div>
  );
};

export default VoicePicker;
