import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { corsHeaders, jsonResponse, getUser, consumeCredits, refundCredits } from "../_shared/security.ts";

const TTS_COST = 3;
const MAX_TEXT_LENGTH = 5000;
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const user = await getUser(req);
  if (!user) {
    return jsonResponse(req, { error: 'Authentification requise' }, 401);
  }

  let charged = false;

  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== 'string') {
      return jsonResponse(req, { error: 'Text is required' }, 400);
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return jsonResponse(req, { error: `Texte trop long (maximum ${MAX_TEXT_LENGTH} caractères)` }, 400);
    }

    // Default to a deep male French-compatible voice
    const selectedVoiceId = voiceId || 'onwK4e9ZLuTAKqWW03F9'; // Daniel
    if (typeof selectedVoiceId !== 'string' || !VOICE_ID_PATTERN.test(selectedVoiceId)) {
      return jsonResponse(req, { error: 'Identifiant de voix invalide' }, 400);
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    if (!(await consumeCredits(user.id, TTS_COST))) {
      return jsonResponse(req, { error: 'Crédits insuffisants' }, 402);
    }
    charged = true;

    console.log(`Generating TTS for ${text.length} chars with voice ${selectedVoiceId} for user ${user.id}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      throw new Error(`TTS generation failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = base64Encode(audioBuffer);

    console.log(`TTS generated: ${audioBuffer.byteLength} bytes`);

    return jsonResponse(req, { audioContent: audioBase64, creditsUsed: TTS_COST });
  } catch (error) {
    console.error('TTS error:', error);
    if (charged) await refundCredits(user.id, TTS_COST);
    return jsonResponse(req, { error: error instanceof Error ? error.message : 'TTS generation failed' }, 500);
  }
});
