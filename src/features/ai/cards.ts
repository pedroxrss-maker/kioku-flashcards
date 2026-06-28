/**
 * Pure helpers for AI-generated flashcards: the generation prompt, defensive
 * JSON parsing of the model output, and turning a list of generated cards into a
 * real Kioku deck via the existing repo. No Gemini calls live here (those are
 * in client.ts), so this stays easy to unit test.
 */
import { repo } from '../../db/repositories';
import { DECK_COLORS, makeCard } from '../../db/factories';
import { markTypeIn } from '../../lib/cardType';
import type { CardType } from '../../lib/cardType';
import type { Card, Deck } from '../../db/types';

export interface GeneratedCard {
  /** Which Kioku card type this becomes: basic, cloze, or type-in. */
  type: CardType;
  front: string;
  back: string;
}

export type GenerateSource =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; base64: string };

export interface GenerateRequest {
  /** Card types the user wants the model to produce (a mix of these). */
  types: CardType[];
  count: number;
  /** Target language of the cards, e.g. "Portuguese (Brazil)". */
  language: string;
  source: GenerateSource;
  /** Existing card fronts to avoid duplicating (used when chunking a big doc). */
  avoid?: string[];
  /** Free-text guidance from the user to steer which cards are made and how. */
  instructions?: string;
}

/**
 * Generation mode: a one-click preset so students don't have to write a prompt.
 *  - 'qa': the default — Q&A cards ABOUT the content (no preset; today's behavior).
 *  - 'transcription': literal sentence-by-sentence cards (front/back, verbatim),
 *    forced to the "basic" type. Ideal for language study.
 */
export type GenerationMode = 'qa' | 'transcription';

/** The literal-transcription instruction (pt-BR), injected as req.instructions so
 *  the user doesn't have to type it. buildGeneratePrompt already prioritizes
 *  req.instructions for the topic/focus and per-type distribution. */
export const TRANSCRIPTION_PRESET =
  'Use a seção de frases do material (cada par de frases em idiomas diferentes, ou cada frase do ' +
  'texto). Para CADA frase, crie exatamente um flashcard básico: a FRENTE é a frase no idioma ' +
  'original copiada literalmente, sem alterar nada; o VERSO é a tradução copiada literalmente, sem ' +
  'alterar nada. Não faça perguntas sobre o conteúdo. Não crie lacunas nem espaços em branco. Não ' +
  'resuma nem reformule. Mantenha a ordem exata em que as frases aparecem no material. Um flashcard ' +
  'por frase.';

/**
 * Build the effective req.instructions for a mode + the user's optional free-text
 * fine-tuning: the mode's preset comes FIRST, the user's text after it. 'qa' has
 * no preset, so it returns just the user's text. Returns undefined when empty.
 */
export function composeInstructions(mode: GenerationMode, userText?: string): string | undefined {
  const user = userText?.trim() ?? '';
  if (mode === 'transcription') {
    return user ? `${TRANSCRIPTION_PRESET} ${user}` : TRANSCRIPTION_PRESET;
  }
  return user || undefined;
}

/** System + user prompt for one generation call. The model is told to output a
 *  bare JSON array and nothing else. */
export function buildGeneratePrompt(req: GenerateRequest): { system: string; userText: string } {
  const RULES: Record<CardType, string> = {
    basic:
      '"basic": a PURE question/answer (or term/definition) card. "front" is the question, "back" ' +
      'is the answer. A basic card must contain NO blank of any kind: no underscores ("___"), no ' +
      'empty gaps, and NEVER a {{c1::...}} marker. Only cloze cards may contain a blank.',
    cloze:
      '"cloze": a fill-in-the-blank whose "front" MUST contain the hidden word wrapped in the literal ' +
      'marker {{c1::answer}} — curly braces, the letters c1, a double colon "::", then the answer, ' +
      'then closing braces. Example: "front": "The capital of France is {{c1::Paris}}." Use exactly ' +
      'one {{c1::...}} marker per card, always numbered c1. A cloze card is INVALID if its "front" has ' +
      'no {{c1::...}} marker. NEVER blank a word with underscores or plain gaps — the ONLY allowed ' +
      'blank mechanism is the {{c1::...}} marker. "back" may hold a short extra note or be empty.',
    typein:
      '"typein": the learner types the answer. "front" is the prompt/question, "back" is the ' +
      'EXACT short expected answer.',
  };
  const types = req.types.length > 0 ? req.types : (['basic'] as CardType[]);
  const typesList = types.join(', ');
  const typeRules = types.map((t) => '- ' + RULES[t]).join('\n');

  const instrLine = req.instructions?.trim()
    ? 'The user instructions below take PRIORITY for the topic/focus and for any EXPLICIT number or ' +
      'per-type distribution of cards (follow that exactly, using only the allowed types). If the ' +
      'instructions do NOT state a number of cards, the requested count above is authoritative. The ' +
      `instructions also do NOT change the output language: write the cards in ${req.language} even ` +
      `if they are written in another language. User instructions: ${req.instructions.trim()} `
    : '';

  // With more than one type selected, REQUIRE every type to appear (the model
  // otherwise tends to skip cloze, the hardest to format). With one type, just
  // make that type. Explicit per-type distribution in the user instructions wins
  // (see instrLine), so this defers to it.
  const mixLine =
    types.length > 1
      ? 'TYPE COVERAGE (mandatory): you MUST produce cards of EACH of the following types, distributed ' +
        `roughly evenly across the deck: ${typesList}. Every selected type must be represented by at ` +
        'least a fair share of the cards. Do NOT omit any selected type — a deck missing one of the ' +
        'selected types is INVALID. If the user instructions below specify a per-type distribution, ' +
        'follow that split instead of an even one (but still include every selected type). '
      : `Produce only "${typesList}" cards. `;

  const cardWord = req.count === 1 ? 'card' : 'cards';
  const system =
    'You generate study flashcards. ' +
    'LANGUAGE (mandatory, overrides everything else): write EVERY card (both the "front" and the ' +
    `"back") in ${req.language}, regardless of the language of the source material or of the user ` +
    `instructions. Translate the content into ${req.language} when the source is in another language. ` +
    `COUNT (mandatory): output EXACTLY ${req.count} ${cardWord}, no more and no fewer, UNLESS the ` +
    'user instructions explicitly request a different number or a per-type distribution. If the ' +
    `instructions do not mention a number, output EXACTLY ${req.count} ${cardWord}. ` +
    `Use ONLY these card types: ${typesList}. ` +
    'Each card is a JSON object with string fields "type", "front" and "back", where "type" is ' +
    `one of: ${typesList}. Rules per type:\n${typeRules}\n` +
    'Make the cards high-quality and non-redundant. ' +
    mixLine +
    instrLine +
    `Keep each side concise and self-contained, written in ${req.language}. Use plain text only ` +
    '(no markdown, no HTML), except the {{c1::...}} cloze syntax when the type is cloze. ' +
    'Output ONLY a JSON array of those objects. ' +
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
      const t = String(rec.type ?? '').trim().toLowerCase();
      const type: CardType = t === 'cloze' ? 'cloze' : t === 'typein' ? 'typein' : 'basic';
      if (front || back) cards.push({ type, front, back });
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
    // Markdown **bold** -> <strong>. Done AFTER escaping, so the ONLY real tags in
    // the output are the ones we insert here (any '<' from the model is already
    // entity-encoded). Non-greedy, within a line; stray '**' stays literal.
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
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
 *  user's default algorithm. Returns the new deck plus the created cards (in the
 *  same order as the non-empty input cards), so the caller can attach images. */
export async function createDeckFromGenerated(
  name: string,
  cards: GeneratedCard[],
  opts?: { category?: string; language?: string; backHtmlSuffix?: string },
): Promise<{ deck: Deck; cards: Card[] }> {
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
  // Trusted HTML appended to each back AFTER toCardHtml (toCardHtml escapes its
  // input, so a footer can't go through it). Only the banco-provas flow passes a
  // suffix, so normal AI decks are untouched. It must survive sanitizeHtml on the
  // render path — the banco footer uses only allowed inline styles (font-size,
  // text-align, margin, color).
  const suffix = opts?.backHtmlSuffix ? `<br>${opts.backHtmlSuffix}` : '';
  const made = cards
    .filter((c) => c.front.trim() || c.back.trim())
    .map((c) => {
      const front = toCardHtml(c.front);
      return makeCard({
        deckId: deck.id,
        // type-in needs the hidden marker; cloze keeps its {{cN::}}; basic stays as-is.
        front: c.type === 'typein' ? markTypeIn(front) : front,
        back: toCardHtml(c.back) + suffix,
      });
    });
  await repo.bulkInsertCards(made);
  return { deck, cards: made };
}
