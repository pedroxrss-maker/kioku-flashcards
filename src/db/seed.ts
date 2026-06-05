import { defaultSettings, makeCard, makeDeck } from './factories';
import { db } from './db';
import type { Card, Deck } from './types';

interface SeedPair {
  front: string;
  back: string;
}

const ENGLISH_VOCAB: SeedPair[] = [
  { front: 'ephemeral', back: '<b>efêmero</b> — que dura muito pouco tempo.<br><span style="color:#9a9a96">The ephemeral beauty of a sunset.</span>' },
  { front: 'serendipity', back: '<b>serendipidade</b> — descoberta feliz por acaso.<br><span style="color:#9a9a96">Finding that café was pure serendipity.</span>' },
  { front: 'resilience', back: '<b>resiliência</b> — capacidade de se recuperar.<br><span style="color:#9a9a96">She showed great resilience after the loss.</span>' },
  { front: 'to thrive', back: '<b>prosperar</b> / florescer.<br><span style="color:#9a9a96">Plants thrive in sunlight.</span>' },
  { front: 'cumbersome', back: '<b>incômodo</b> / pesado e difícil de manusear.<br><span style="color:#9a9a96">A cumbersome process.</span>' },
  { front: 'to grasp', back: '<b>agarrar</b> ou <b>compreender</b>.<br><span style="color:#9a9a96">I couldn\'t grasp the concept at first.</span>' },
  { front: 'meticulous', back: '<b>meticuloso</b> — extremamente cuidadoso.<br><span style="color:#9a9a96">A meticulous planner.</span>' },
  { front: 'to alleviate', back: '<b>aliviar</b> — tornar menos severo.<br><span style="color:#9a9a96">This will alleviate the pain.</span>' },
  { front: 'inevitable', back: '<b>inevitável</b> — que não pode ser evitado.' },
  { front: 'to endure', back: '<b>suportar</b> / perdurar.<br><span style="color:#9a9a96">Friendships that endure.</span>' },
];

const GENERAL: SeedPair[] = [
  { front: 'Qual é a capital do Japão?', back: '<b>Tóquio</b> (東京).' },
  { front: 'Quantos ossos tem o corpo humano adulto?', back: '<b>206</b> ossos.' },
  { front: 'Qual planeta é conhecido como o Planeta Vermelho?', back: '<b>Marte</b>.' },
  { front: 'Quem pintou a Mona Lisa?', back: '<b>Leonardo da Vinci</b>.' },
  { front: 'Qual é o maior oceano da Terra?', back: '<b>Oceano Pacífico</b>.' },
  { front: 'Em que ano o homem pisou na Lua pela primeira vez?', back: '<b>1969</b> (Apollo 11).' },
  { front: 'Qual é o elemento químico de símbolo <b>O</b>?', back: '<b>Oxigênio</b>.' },
];

function cardsFor(deckId: string, pairs: SeedPair[]): Card[] {
  return pairs.map((p) => makeCard({ deckId, front: p.front, back: p.back }));
}

/**
 * Seed two sample decks on first run so the UI is never empty. Idempotent:
 * skips if any decks already exist or the seed marker is set.
 */
export async function seedIfEmpty(): Promise<void> {
  const deckCount = await db.decks.count();
  const settings = await db.settings.get('global');
  if (deckCount > 0 || settings?.seededAt) return;

  const english: Deck = makeDeck({
    name: 'Inglês — Vocabulário Essencial',
    color: '#1f6dff',
    category: 'Idiomas',
    algorithm: 'fsrs',
    ttsLang: 'en-US',
  });
  const general: Deck = makeDeck({
    name: 'Conhecimentos Gerais',
    color: '#ff9d00',
    category: 'Geral',
    algorithm: 'sm2',
    ttsLang: 'pt-BR',
  });

  const cards = [
    ...cardsFor(english.id, ENGLISH_VOCAB),
    ...cardsFor(general.id, GENERAL),
  ];

  await db.transaction('rw', db.decks, db.cards, db.settings, async () => {
    await db.decks.bulkAdd([english, general]);
    await db.cards.bulkAdd(cards);
    await db.settings.put({
      ...defaultSettings(),
      ...(settings ?? {}),
      id: 'global',
      seededAt: Date.now(),
    });
  });
}
