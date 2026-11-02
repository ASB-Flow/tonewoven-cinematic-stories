// Prompts du module « Parcours d'enseignements »

export const THEME_KEYS = [
  'but', 'potentiel', 'identite', 'vision',
  'planification', 'discipline', 'don_travail', 'relations',
  'leadership', 'caractere', 'royaume', 'transmission',
] as const;

export type AudienceLine = 'universal' | 'christian';

const AUDIENCE: Record<AudienceLine, string> = {
  universal:
    "Ligne « valeurs universelles » : le public est majoritairement musulman. Parle de but, de potentiel, de vision et de leadership sans citer la Bible ni employer un vocabulaire d'église. Tu peux parler de Dieu de façon respectueuse et générale.",
  christian:
    "Ligne chrétienne assumée, fidèle à l'enseignement du Dr Munroe : références bibliques possibles (livre et verset), ton respectueux des autres croyances.",
};

export const commonContext = (line: AudienceLine) => `Tu es un créateur de contenus d'enseignement pour un public sénégalais (18-40 ans, urbain et périurbain, francophone, souvent wolophone). Tu t'inspires des enseignements du Dr Myles Munroe (but, potentiel, vision, leadership, Royaume).
${AUDIENCE[line]}
Règles impératives :
- Tu reformules avec tes propres mots. Tu ne recopies jamais de longs passages de ses livres ou vidéos.
- Une citation fait au maximum une phrase et se termine par « — Dr Myles Munroe ».
- Ton chaleureux, direct, plein d'espoir, concret, jamais condescendant. Tutoiement.
- Exemples tirés de la vie au Sénégal (marché, pirogue, baobab, car rapide, teranga, famille, études, emploi des jeunes, entrepreneuriat), sans sujet politique partisan.
- Tu réponds uniquement avec un objet JSON valide, sans texte autour.`;

export const indexPrompt = (title: string, transcript: string) => ({
  system: commonContext('universal'),
  user: `Voici la transcription française d'un Short (titre : « ${title} »).
Renvoie un JSON avec exactement ces clés :
- "theme" : un seul parmi ${THEME_KEYS.join(', ')}
- "level" : 1 (découvrir : identité, but, potentiel, vision), 2 (développer : plan, discipline, don, relations) ou 3 (diriger : leadership, caractère, servir, transmettre)
- "key_idea" : l'idée clé reformulée en une phrase
- "short_quote" : une phrase marquante fidèle au texte (une seule phrase), ou null
- "examples" : la liste des images ou exemples utilisés par l'orateur (mots courts)

Transcription :
${transcript}`,
});

export const indexBookChapterPrompt = (bookTitle: string, chapterTitle: string, chapterText: string) => ({
  system: commonContext('universal'),
  user: `Voici un chapitre du livre « ${bookTitle} » du Dr Myles Munroe (${chapterTitle}). Il peut être en anglais ou en français.
Tu prépares des notes de lecture pour un parcours d'enseignement. Tire de ce chapitre 1 à 4 idées fortes, distinctes et utiles à un jeune Sénégalais.
Pour chaque idée, renvoie :
- "theme" : un seul parmi ${THEME_KEYS.join(', ')}
- "level" : 1 (découvrir), 2 (développer) ou 3 (diriger)
- "key_idea" : l'idée reformulée en français avec tes propres mots, en 1 à 2 phrases. Ne recopie pas le texte.
- "short_quote" : UNE seule phrase marquante du chapitre, traduite en français si besoin, ou null
Renvoie : {"notes": [{"theme": "...", "level": 1, "key_idea": "...", "short_quote": "..."}]}
Si le chapitre n'a pas de contenu d'enseignement (sommaire, remerciements, index, préface d'éditeur), renvoie {"notes": []}.

Chapitre :
${chapterText}`,
});

export interface WeekInput {
  week: number;
  level: number;
  title: string;
  references: string;
  challenge: string;
}

export interface SourceInput {
  id: string;
  /** « Short (transcription) » or « Livre « … », chapitre … » */
  origin: string;
  key_idea: string;
  short_quote: string | null;
  /** Transcript excerpt for Shorts; null for book notes (the book text is never stored) */
  excerpt: string | null;
}

export const composeWeekPrompt = (
  line: AudienceLine,
  week: WeekInput,
  previous: string | null,
  sources: SourceInput[],
) => ({
  system: commonContext(line),
  user: `Semaine ${week.week} d'un parcours de 12 semaines. Niveau ${week.level}. Thème : « ${week.title} » (œuvre de référence : ${week.references}). Défi de la semaine : « ${week.challenge} ».
Leçon précédente : ${previous ?? 'aucune, c\'est la toute première leçon du parcours'}.

Sources (Shorts transcrits et notes de lecture des livres du Dr Munroe) :
${sources.map((s, i) => `[${i + 1}] id=${s.id} · ${s.origin}
Idée clé : ${s.key_idea}
Citation : ${s.short_quote ?? '—'}${s.excerpt ? `\nExtrait : ${s.excerpt}` : ''}`).join('\n\n')}

Crée 3 leçons qui se suivent :
- position 1 = le principe de la semaine
- position 2 = l'obstacle typique qui empêche de le vivre au Sénégal
- position 3 = la pratique : le défi de la semaine, concret

Chaque leçon suit la fiche en 7 blocs, une seule idée par leçon :
- "hook" : accroche d'une phrase qui arrête le scroll
- "recall" : une phrase qui relie à la leçon précédente
- "principle" : l'idée reformulée simplement, 2 à 3 phrases
- "illustration" : une image ou une courte histoire sénégalaise, 2 à 4 phrases
- "quote" : une phrase courte attribuée « — Dr Myles Munroe », tirée des sources, ou "" s'il n'y en a pas
- "action" : ce que la personne fait aujourd'hui, en moins de 15 minutes, sans argent
- "teaser" : une phrase qui annonce la leçon suivante

Renvoie : {"lessons": [{"position": 1, "title": "...", "card": {"hook": "...", "recall": "...", "principle": "...", "illustration": "...", "quote": "...", "action": "...", "teaser": "..."}, "source_ids": ["..."]}, {...position 2}, {...position 3}]}
Dans source_ids, mets uniquement les id des sources réellement utilisées. Quand une citation vient d'un livre, ajoute son titre : « — Dr Myles Munroe, <titre> ».`,
});

export const formatsPrompt = (line: AudienceLine, code: string, title: string, card: Record<string, string>) => ({
  system: commonContext(line),
  user: `Leçon ${code} : « ${title} ».
Fiche :
${JSON.stringify(card, null, 2)}

Décline cette leçon en 5 formats. Renvoie un JSON avec exactement ces clés :
- "video" : script de Short vertical de 45 à 60 secondes (130 à 150 mots). Format : [0-3 s] accroche (ÉCRAN : texte à l'écran de 6 mots max, VOIX : ...) ; [3-40 s] principe et illustration en phrases courtes, avec une suggestion de plan visuel ; [40-55 s] action du jour ; [55-60 s] « Demain : ... ». Termine par 5 hashtags dont #Senegal et #Dakar.
- "post" : post Facebook / LinkedIn de 120 à 180 mots. Première ligne = accroche ; paragraphes de 1 à 2 phrases ; la citation entre guillemets ; l'action introduite par « 👉 Ton défi aujourd'hui : » ; une question qui invite à commenter ; dernière ligne « Leçon ${code} du parcours ».
- "whatsapp" : version statut ou message WhatsApp de 60 mots maximum.
- "wolof" : version en wolof parlé de Dakar (orthographe standard CLAD, mots français courants acceptés quand c'est l'usage), 80 à 120 mots, même structure : accroche, principe, exemple, action, teaser. Adapte, ne traduis pas mot à mot. Ajoute ensuite une ligne « --- Traduction pour relecture --- » et la traduction française ligne à ligne.
- "audio" : texte à lire à voix haute de 2 à 3 minutes (300 à 400 mots), ton de conversation. Commence par « Salam aleykum, bonjour, ici le parcours, leçon ${code}. ». Phrases courtes, l'idée clé répétée 3 fois, une petite histoire, l'action du jour, le teaser. Marque les pauses avec [pause].`,
});
