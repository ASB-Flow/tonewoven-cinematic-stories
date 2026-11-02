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
  const cleaned = raw.trim().replace(/^
