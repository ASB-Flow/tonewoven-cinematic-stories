import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { corsHeaders, jsonResponse, getUser, consumeCredits, refundCredits } from "../_shared/security.ts";
import {
  THEME_KEYS, composeWeekPrompt, formatsPrompt, indexBookChapterPrompt, indexPrompt,
  type AudienceLine, type SourceInput,
} from "./prompts.ts";

// Module « Parcours d'enseignements »
//  - index        : classe une transcription (projet Short FR) par thème et niveau
//  - index-book-chapter : tire d'un chapitre de livre 1 à 4 notes d'idées (jamais le texte lui-même)
//  - compose-week : écrit les 3 leçons d'une semaine du parcours à partir des sources du thème
//  - formats      : décline une leçon en script vidéo, post, WhatsApp, wolof et audio

const COSTS = { index: 1, 'index-book-chapter': 1, 'compose-week': 3, formats: 2 } as const;
type Action = keyof typeof COSTS;

const MODEL = 'openai/gpt-5-mini';
const MAX_TRANSCRIPT = 6000;
const MAX_EXCERPT = 1200;
const MAX_SOURCES = 8;
const MAX_BOOK_NOTES = 8;
const MAX_CHAPTER = 15000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_KEYS = ['hook', 'recall', 'principle', 'illustration', 'quote', 'action', 'teaser'] as const;
const FORMAT_KEYS = ['video', 'post', 'whatsapp', 'wolof', 'audio'] as const;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const POSITION_OFFSET: Record<number, number> = { 1: 0, 2: 2, 3: 4 };

// Same rule as src/lib/teaching.ts: Monday, Wednesday or Friday of the lesson's week
const publishDate = (startDate: string, week: number, position: number): string => {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const monday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(monday + ((week - 1) * 7 + (POSITION_OFFSET[position] ?? 0)) * DAY_MS).toISOString().slice(0, 10);
};

const text = (value: unknown, max = 4000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** One sentence at most, closing quote mark kept: longer quotes are cut at the first sentence end */
const firstSentence = (value: string): string =>
  (value.match(/^[^.!?]*[.!?]+(?:\s*[»"”])?/)?.[0] ?? value).trim();

const parseJson = (raw: string): Record<string, unknown> => {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error("Réponse de l'IA illisible");
  return JSON.parse(cleaned.slice(start, end + 1));
};

const askModel = async (prompt: { system: string; user: string }): Promise<Record<string, unknown>> => {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY is not configured');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, 'Trop de demandes, réessayez dans un instant.');
    if (response.status === 402) throw new HttpError(402, 'Crédits IA épuisés. Ajoutez des fonds.');
    console.error('AI gateway error:', response.status, await response.text());
    throw new Error(`Génération échouée (${response.status})`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Aucune réponse de l'IA");
  return parseJson(content);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const user = await getUser(req);
  if (!user) {
    return jsonResponse(req, { error: 'Authentification requise' }, 401);
  }

  // Reads and writes go through the user's own session, so row level security applies
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
    auth: { persistSession: false },
  });

  let cost = 0;

  try {
    const body = await req.json();
    const action = body?.action as Action;
    if (!(action in COSTS)) {
      return jsonResponse(req, { error: 'Action inconnue' }, 400);
    }

    // Everything is loaded and checked before any credit is spent
    if (action === 'index') {
      const projectId = String(body.projectId ?? '');
      if (!UUID.test(projectId)) return jsonResponse(req, { error: 'Projet invalide' }, 400);

      const { data: project } = await db
        .from('projects')
        .select('id, title, script, translated_text')
        .eq('id', projectId)
        .maybeSingle();
      if (!project) return jsonResponse(req, { error: 'Projet introuvable' }, 404);
      const transcript = (project.translated_text || project.script || '').slice(0, MAX_TRANSCRIPT);
      if (!transcript.trim()) return jsonResponse(req, { error: 'Ce projet ne contient aucune transcription' }, 400);

      cost = COSTS.index;
      if (!(await consumeCredits(user.id, cost))) {
        cost = 0;
        return jsonResponse(req, { error: 'Crédits insuffisants' }, 402);
      }

      const result = await askModel(indexPrompt(project.title, transcript));
      const theme = THEME_KEYS.includes(result.theme as typeof THEME_KEYS[number]) ? result.theme as string : null;
      const level = Number(result.level);
      if (!theme || ![1, 2, 3].includes(level) || !text(result.key_idea)) {
        throw new Error("Classement de l'IA incomplet, réessayez");
      }

      const { data: source, error } = await db
        .from('teaching_sources')
        .upsert({
          user_id: user.id,
          project_id: projectId,
          theme,
          level,
          key_idea: text(result.key_idea, 500),
          short_quote: text(result.short_quote, 300) || null,
          examples: Array.isArray(result.examples) ? result.examples.map((e) => text(e, 80)).filter(Boolean).slice(0, 10) : [],
        }, { onConflict: 'project_id' })
        .select('id, project_id, theme, level, key_idea, short_quote')
        .single();
      if (error) throw new Error(error.message);

      return jsonResponse(req, { source, creditsUsed: cost });
    }

    if (action === 'index-book-chapter') {
      const bookTitle = text(body.bookTitle, 200);
      const chapterTitle = text(body.chapterTitle, 200) || 'Chapitre';
      const chapterIndex = Number(body.chapterIndex);
      const chapterText = text(body.text, MAX_CHAPTER);
      if (!bookTitle || !Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterText.length < 200) {
        return jsonResponse(req, { error: 'Chapitre invalide ou trop court' }, 400);
      }

      cost = COSTS['index-book-chapter'];
      if (!(await consumeCredits(user.id, cost))) {
        cost = 0;
        return jsonResponse(req, { error: 'Crédits insuffisants' }, 402);
      }

      const result = await askModel(indexBookChapterPrompt(bookTitle, chapterTitle, chapterText));
      const notes = (Array.isArray(result.notes) ? result.notes as Array<Record<string, unknown>> : [])
        .filter((n) => THEME_KEYS.includes(n.theme as typeof THEME_KEYS[number]) && [1, 2, 3].includes(Number(n.level)) && text(n.key_idea))
        .slice(0, 4)
        .map((n) => ({
          user_id: user.id,
          book_title: bookTitle,
          chapter_index: chapterIndex,
          chapter_title: chapterTitle,
          theme: n.theme as string,
          level: Number(n.level),
          key_idea: text(n.key_idea, 500),
          short_quote: firstSentence(text(n.short_quote, 300)) || null,
        }));

      // Re-indexing a chapter replaces its notes
      const { error: deleteError } = await db
        .from('teaching_book_notes')
        .delete()
        .eq('book_title', bookTitle)
        .eq('chapter_index', chapterIndex);
      if (deleteError) throw new Error(deleteError.message);

      if (notes.length === 0) return jsonResponse(req, { notes: [], creditsUsed: cost });
      const { data: saved, error } = await db
        .from('teaching_book_notes')
        .insert(notes)
        .select('id, book_title, chapter_index, chapter_title, theme, level, key_idea, short_quote');
      if (error) throw new Error(error.message);

      return jsonResponse(req, { notes: saved, creditsUsed: cost });
    }

    if (action === 'compose-week') {
      const pathId = String(body.pathId ?? '');
      const weekNumber = Number(body.week);
      if (!UUID.test(pathId) || !Number.isInteger(weekNumber)) {
        return jsonResponse(req, { error: 'Parcours ou semaine invalide' }, 400);
      }

      const { data: path } = await db
        .from('teaching_paths')
        .select('id, audience_line, start_date, plan')
        .eq('id', pathId)
        .maybeSingle();
      if (!path) return jsonResponse(req, { error: 'Parcours introuvable' }, 404);
      const week = (path.plan as Array<Record<string, unknown>>).find((w) => Number(w.week) === weekNumber);
      if (!week) return jsonResponse(req, { error: `Semaine ${weekNumber} absente du plan` }, 400);

      const { data: indexed } = await db
        .from('teaching_sources')
        .select('project_id, key_idea, short_quote, projects(translated_text, script)')
        .eq('theme', String(week.theme))
        .order('created_at', { ascending: true })
        .limit(MAX_SOURCES);
      const { data: bookNotes } = await db
        .from('teaching_book_notes')
        .select('id, book_title, chapter_title, key_idea, short_quote')
        .eq('theme', String(week.theme))
        .order('created_at', { ascending: true })
        .limit(MAX_BOOK_NOTES);
      if ((indexed?.length ?? 0) + (bookNotes?.length ?? 0) === 0) {
        return jsonResponse(req, { error: 'Aucun Short ni chapitre de livre indexé sur ce thème.' }, 400);
      }
      const sources: SourceInput[] = [
        ...(indexed ?? []).map((s: Record<string, any>) => ({
          id: s.project_id,
          origin: 'Short (transcription)',
          key_idea: s.key_idea,
          short_quote: s.short_quote,
          excerpt: String(s.projects?.translated_text || s.projects?.script || '').slice(0, MAX_EXCERPT),
        })),
        ...(bookNotes ?? []).map((n: Record<string, any>) => ({
          id: n.id,
          origin: `Livre « ${n.book_title} », ${n.chapter_title}`,
          key_idea: n.key_idea,
          short_quote: n.short_quote,
          excerpt: null,
        })),
      ];
      const projectIds = new Set((indexed ?? []).map((s: Record<string, any>) => s.project_id as string));
      const noteIds = new Set((bookNotes ?? []).map((n: Record<string, any>) => n.id as string));

      // The last lesson before this week, so the first lesson can recall it
      const { data: previousLesson } = await db
        .from('teaching_lessons')
        .select('title, card')
        .eq('path_id', pathId)
        .lt('week', weekNumber)
        .order('week', { ascending: false })
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const previous = previousLesson
        ? `« ${previousLesson.title} » : ${(previousLesson.card as Record<string, string>)?.principle ?? ''}`
        : null;

      cost = COSTS['compose-week'];
      if (!(await consumeCredits(user.id, cost))) {
        cost = 0;
        return jsonResponse(req, { error: 'Crédits insuffisants' }, 402);
      }

      const result = await askModel(composeWeekPrompt(
        path.audience_line as AudienceLine,
        {
          week: weekNumber,
          level: Number(week.level),
          title: String(week.title),
          references: String(week.references ?? ''),
          challenge: String(week.challenge ?? ''),
        },
        previous,
        sources,
      ));

      const generated = Array.isArray(result.lessons) ? result.lessons as Array<Record<string, any>> : [];
      const rows = [1, 2, 3].map((position) => {
        const lesson = generated.find((l) => Number(l.position) === position) ?? generated[position - 1];
        if (!lesson || !text(lesson.title) || typeof lesson.card !== 'object') {
          throw new Error("L'IA n'a pas rendu les 3 leçons, réessayez");
        }
        const card = Object.fromEntries(CARD_KEYS.map((k) => [k, text(lesson.card?.[k], 1500)]));
        const used: string[] = Array.isArray(lesson.source_ids)
          ? lesson.source_ids.filter((id: unknown): id is string => typeof id === 'string')
          : [];
        return {
          path_id: pathId,
          user_id: user.id,
          level: Number(week.level),
          week: weekNumber,
          position,
          title: text(lesson.title, 200),
          card,
          formats: {},
          source_project_ids: used.filter((id) => projectIds.has(id)),
          source_note_ids: used.filter((id) => noteIds.has(id)),
          status: 'draft',
          publish_date: publishDate(path.start_date, weekNumber, position),
        };
      });

      const { data: lessons, error } = await db
        .from('teaching_lessons')
        .upsert(rows, { onConflict: 'path_id,week,position' })
        .select('*');
      if (error) throw new Error(error.message);

      return jsonResponse(req, { lessons, creditsUsed: cost });
    }

    // formats
    const lessonId = String(body.lessonId ?? '');
    if (!UUID.test(lessonId)) return jsonResponse(req, { error: 'Leçon invalide' }, 400);

    const { data: lesson } = await db
      .from('teaching_lessons')
      .select('id, level, week, position, title, card, teaching_paths(audience_line)')
      .eq('id', lessonId)
      .maybeSingle();
    if (!lesson) return jsonResponse(req, { error: 'Leçon introuvable' }, 404);

    cost = COSTS.formats;
    if (!(await consumeCredits(user.id, cost))) {
      cost = 0;
      return jsonResponse(req, { error: 'Crédits insuffisants' }, 402);
    }

    const line = ((lesson as Record<string, any>).teaching_paths?.audience_line ?? 'universal') as AudienceLine;
    const code = `N${lesson.level}-S${lesson.week}-L${lesson.position}`;
    const result = await askModel(formatsPrompt(line, code, lesson.title, lesson.card as Record<string, string>));
    const formats = Object.fromEntries(FORMAT_KEYS.map((k) => [k, text(result[k], 6000)]));
    if (!formats.video || !formats.post) throw new Error("Formats incomplets, réessayez");

    const { data: updated, error } = await db
      .from('teaching_lessons')
      .update({ formats })
      .eq('id', lessonId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    return jsonResponse(req, { lesson: updated, creditsUsed: cost });
  } catch (error) {
    console.error('teaching-generate error:', error);
    if (cost > 0) await refundCredits(user.id, cost);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse(req, { error: error instanceof Error ? error.message : 'Génération échouée' }, status);
  }
});
