import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { YoutubeTranscript } from "npm:youtube-transcript@1.2.1";
import { corsHeaders, jsonResponse, getUser } from "../_shared/security.ts";

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const user = await getUser(req);
  if (!user) {
    return jsonResponse(req, { error: 'Authentification requise' }, 401);
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return jsonResponse(req, { error: 'YouTube URL is required' }, 400);
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return jsonResponse(req, { error: 'URL YouTube invalide' }, 400);
    }

    console.log('Extracting transcript for video:', videoId);

    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error("Aucun sous-titre disponible pour cette vidéo.");
    }

    const text = transcriptItems
      .map((item: { text: string }) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`Transcript extracted: ${text.length} chars, ${transcriptItems.length} segments`);

    // Try to detect language from the first transcript config
    const language = 'auto';

    return jsonResponse(req, { transcript: text, language, videoId });
  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Échec de l\'extraction';
    
    // Provide helpful error messages
    let userMessage = message;
    if (message.includes('Could not get the transcript') || message.includes('disabled')) {
      userMessage = "Les sous-titres ne sont pas disponibles pour cette vidéo. Essayez une vidéo avec des sous-titres activés.";
    }
    
    return jsonResponse(req, { error: userMessage }, 500);
  }
});
