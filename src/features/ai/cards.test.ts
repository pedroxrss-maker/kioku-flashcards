import { describe, it, expect } from 'vitest';
import { buildGeneratePrompt, composeInstructions, TRANSCRIPTION_PRESET } from './cards';
import type { GenerateRequest } from './cards';
import type { CardType } from '../../lib/cardType';

/**
 * The generation prompt is pure text, so we assert on its wording. The key
 * regression these guard: when several card types are selected, the model used
 * to skip cloze (the hardest to format) because the prompt only asked for "a
 * balanced mix". The prompt now REQUIRES every selected type and spells out the
 * literal {{c1::...}} cloze marker.
 */
function req(types: CardType[], extra: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    types,
    count: 12,
    language: 'Portuguese (Brazil)',
    source: { kind: 'text', text: 'Some study material about France.' },
    ...extra,
  };
}

describe('buildGeneratePrompt', () => {
  it('requires EVERY selected type (not just a mix) when several are chosen', () => {
    const { system } = buildGeneratePrompt(req(['basic', 'cloze', 'typein']));
    expect(system).toContain('EACH of the following types');
    expect(system).toContain('Every selected type must be represented');
    expect(system).toContain('Do NOT omit any selected type');
    // Lists all three selected types.
    expect(system).toContain('basic, cloze, typein');
    // The old loose wording is gone.
    expect(system).not.toContain('balanced mix of the allowed types');
  });

  it('spells out the literal {{c1::...}} cloze marker with a concrete example', () => {
    const { system } = buildGeneratePrompt(req(['basic', 'cloze', 'typein']));
    expect(system).toContain('{{c1::answer}}'); // the literal syntax
    expect(system).toContain('{{c1::Paris}}'); // a concrete example
    expect(system).toContain('A cloze card is INVALID'); // mandatory marker
  });

  it('forbids any blank in basic cards (no underscores, no cloze markers)', () => {
    const { system } = buildGeneratePrompt(req(['basic', 'cloze']));
    expect(system).toContain('A basic card must contain NO blank');
    expect(system).toContain('NEVER a {{c1::...}} marker');
    expect(system).toContain('Only cloze cards may contain a blank');
  });

  it('produces only the one type when a single type is selected (no coverage mandate)', () => {
    const { system } = buildGeneratePrompt(req(['cloze']));
    expect(system).toContain('Produce only "cloze" cards.');
    expect(system).not.toContain('EACH of the following types');
  });

  it('keeps user-instruction per-type distribution as the priority', () => {
    const { system } = buildGeneratePrompt(req(['basic', 'cloze'], { instructions: '50% cloze, 50% basic' }));
    expect(system).toContain('take PRIORITY');
    expect(system).toContain('follow that split instead of an even one');
    expect(system).toContain('50% cloze, 50% basic');
  });
});

describe('composeInstructions (generation-mode presets)', () => {
  it('Q&A mode injects no preset (returns just the user text, or undefined)', () => {
    expect(composeInstructions('qa', undefined)).toBeUndefined();
    expect(composeInstructions('qa', '   ')).toBeUndefined();
    expect(composeInstructions('qa', 'foque no capítulo 3')).toBe('foque no capítulo 3');
  });

  it('transcription mode injects the literal-transcription preset with no user text', () => {
    expect(composeInstructions('transcription', undefined)).toBe(TRANSCRIPTION_PRESET);
    expect(composeInstructions('transcription', '')).toBe(TRANSCRIPTION_PRESET);
  });

  it('transcription mode puts the preset FIRST, then appends the user fine-tuning', () => {
    const out = composeInstructions('transcription', 'foque no capítulo 2');
    expect(out).toBe(`${TRANSCRIPTION_PRESET} foque no capítulo 2`);
    expect(out?.startsWith(TRANSCRIPTION_PRESET)).toBe(true);
    expect(out?.endsWith('foque no capítulo 2')).toBe(true);
  });

  it('the transcription preset carries the literal-copy, no-reformulation rules', () => {
    expect(TRANSCRIPTION_PRESET).toContain('copiada literalmente');
    expect(TRANSCRIPTION_PRESET).toContain('Não faça perguntas sobre o conteúdo');
    expect(TRANSCRIPTION_PRESET).toContain('Não resuma nem reformule');
    expect(TRANSCRIPTION_PRESET).toContain('Mantenha a ordem exata');
    expect(TRANSCRIPTION_PRESET).toContain('Um flashcard por frase');
  });
});
