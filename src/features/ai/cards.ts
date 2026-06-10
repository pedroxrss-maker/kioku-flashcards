/**
 * Pure helpers for AI-generated flashcards: the generation prompt, defensive
 * JSON parsing of the model output, and turning a list of generated cards into a
 * real Kioku deck via the existing repo. No Anthropic calls live here (those are
 * in anthropic.ts), so this stays easy to unit test.
 */
import { repo } from '../../db/repositories';
import { DECK_COLORS, makeCard } from '../../db/factories';
import type { Deck } from '../../db/types';

export type CardKind = 'qa' | 'cloze' | 'reverse';

export interface GeneratedCard {
  front: string;
  back: string;
}

export type GenerateSource =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; base64: string };

export interface GenerateRequest {
  kind: CardKind;
  count: number;
  /** Target language of the cards, e.g. "Portuguese (Brazil)". */
  language: string;
  source: GenerateSource;
  /** Existing card fronts to avoid duplicating (used when chunking a big doc). */
  avoid?: string[];
}

/** System + user prompt for one generation call. The model is told to output a
 *  bare JSON array and nothing else. */
export function buildGeneratePrompt(req: GenerateRequest): { system: string; userText: string } {
  const kindRules =
    req.kind === 'cloze'
      ? 'Make CLOZE cards: put the hidden term in "front" using the syntax {{c1::term}} ' +
        '(exactly one cloze deletion per card, always numbered c1). "back" may hold a short ' +
        'extra explanation or be an empty string.'
      : req.kind === 'reverse'
        ? 'Make REVERSIBLE cards: for each concept output TWO objects, one term -> definition ' +
          'and one definition -> term.'
        : 'Make QUESTION/ANSWER cards: "front" is the question, "back" is the answer.';

  const system =
    'You generate study flashcards. ' +
    `Write every card in ${req.language}. ` +
    kindRules +
    ' ' +
    `Produce about ${req.count} high-quality, non-redundant cards. ` +
    'Keep each side concise and self-contained. Use plain text only (no markdown, no HTML). ' +
    'Output ONLY a JSON array of objects with string fields "front" and "back". ' +
    'No prose, no explanations, no code fences, nothing before or after the array.';

  const avoidLine =
    req.avoid && req.avoid.length > 0
      ? ` Do NOT repeat any of these existing card fronts: ${req.avoid.slice(0, 80).join(' | ')}.`
      : '';

  const userText =
    req.source.kind === 'pdf'
      ? 'Create flashcards from the attached PDF document.' + avoidLine
      : 'Create flashcards from the following material:\n\n' + req.source.text + avoidLine;

  return { system, userText };
}

/**
 * Parse the model output into cards defensively: strip any prose/code fences by
 * slicing from the first "[" to the last "]", JSON.parse in a try/catch, and
 * keep only well-formed { front, back } objects. Throws a pt-BR error on failure.
 */
export function parseCardsJson(raw: string): GeneratedCard[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < 0 || end < start) {
    throw new Error('A IA não retornou um JSON de cards válido. Tente novamente.');
  }
  let arr: unknown;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('Não foi possível ler os cards gerados (JSON inválido). Tente novamente.');
  }
  if (!Array.isArray(arr)) {
    throw new Error('A IA não retornou uma lista de cards. Tente novamente.');
  }
  const cards: GeneratedCard[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const front = String(rec.front ?? '').trim();
      const back = String(rec.back ?? '').trim();
      if (front || back) cards.push({ front, back });
    }
  }
  if (cards.length === 0) {
    throw new Error('A IA não gerou nenhum card. Tente um conteúdo maior ou outro tema.');
  }
  return cards;
}

/** Escape HTML and turn newlines into <br>, so plain-text model output renders
 *  safely as card HTML. Cloze markers ({{c1::...}}) are preserved. */
function toCardHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>')
    .trim();
}

/** Map a generation language name to a BCP-47 TTS code for the new deck. */
const LANG_TO_TTS: Record<string, string> = {
  'Portuguese (Brazil)': 'pt-BR',
  English: 'en-US',
  Spanish: 'es-ES',
  French: 'fr-FR',
  German: 'de-DE',
  Italian: 'it-IT',
  Japanese: 'ja-JP',
};

/** Create a real deck from generated cards via the existing repo, using the
 *  user's default algorithm. Returns the new deck (caller navigates to it). */
export async function createDeckFromGenerated(
  name: string,
  cards: GeneratedCard[],
  opts?: { category?: string; language?: string },
): Promise<Deck> {
  const settings = await repo.getSettings();
  const color = DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)];
  const deck = await repo.createDeck({
    name: name.trim() || 'Deck gerado por IA',
    color,
    category: opts?.category ?? 'IA',
    algorithm: settings.defaultAlgorithm,
    newPerDay: settings.newPerDay,
    reviewsPerDay: settings.reviewsPerDay,
    desiredRetention: settings.defaultDesiredRetention,
    ttsLang: opts?.language ? LANG_TO_TTS[opts.language] : undefined,
  });
  const made = cards
    .filter((c) => c.front.trim() || c.back.trim())
    .map((c) => makeCard({ deckId: deck.id, front: toCardHtml(c.front), back: toCardHtml(c.back) }));
  await repo.bulkInsertCards(made);
  return deck;
}
