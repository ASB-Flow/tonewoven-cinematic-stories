import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, getUser, consumeCredits, refundCredits } from "../_shared/security.ts";

const TRANSLATION_COST = 2;
const MAX_TEXT_LENGTH = 20000;
const LANGUAGE_PATTERN = /^[\p{L} ()-]{2,40}$/u;

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
    const { text, targetLanguage } = await req.json();

    if (!text || typeof text !== 'string') {
      return jsonResponse(req, { error: 'Text is required' }, 400);
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return jsonResponse(req, { error: `Texte trop long (maximum ${MAX_TEXT_LENGTH} caractères)` }, 400);
    }

    const language = targetLanguage || 'French';
    if (typeof language !== 'string' || !LANGUAGE_PATTERN.test(language)) {
      return jsonResponse(req, { error: 'Langue cible invalide' }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!(await consumeCredits(user.id, TRANSLATION_COST))) {
      return jsonResponse(req, { error: 'Crédits insuffisants' }, 402);
    }
    charged = true;

    console.log(`Translating ${text.length} chars to ${language} for user ${user.id}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text to ${language}.

Rules:
- Preserve the original meaning, tone, and emotion
- Keep the same speaking style (formal/informal)
- Do NOT add any commentary or explanation
- Return ONLY the translated text
- Preserve paragraph breaks and structure`
          },
          {
            role: 'user',
            content: text
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        await refundCredits(user.id, TRANSLATION_COST);
        charged = false;
        return jsonResponse(req, { error: 'Rate limit exceeded. Please try again later.' }, 429);
      }
      if (response.status === 402) {
        await refundCredits(user.id, TRANSLATION_COST);
        charged = false;
        return jsonResponse(req, { error: 'AI credits exhausted. Please add funds.' }, 402);
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`Translation failed: ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content;

    if (!translatedText) {
      throw new Error('No translation returned');
    }

    console.log(`Translation complete: ${translatedText.length} chars`);

    return jsonResponse(req, { translatedText, targetLanguage: language, creditsUsed: TRANSLATION_COST });
  } catch (error) {
    console.error('Translation error:', error);
    if (charged) await refundCredits(user.id, TRANSLATION_COST);
    return jsonResponse(req, { error: error instanceof Error ? error.message : 'Translation failed' }, 500);
  }
});
