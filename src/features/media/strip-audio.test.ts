// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { stripAudioHtml } from './media';

describe('stripAudioHtml', () => {
  it('removes an attached audio chip (span + <audio>) but keeps the text', () => {
    const html =
      'Olá <span class="kioku-audio-chip"><span class="kioku-audio-lbl">🔊 ouvir</span>' +
      '<audio controls src="kioku-audio://abc"></audio></span> mundo';
    const out = stripAudioHtml(html);
    expect(out).not.toContain('kioku-audio');
    expect(out).not.toContain('<audio');
    expect(out).not.toContain('kioku-audio-chip');
    expect(out).toContain('Olá');
    expect(out).toContain('mundo');
  });

  it('removes a bare <audio> element and leftover [sound:] tokens', () => {
    expect(stripAudioHtml('<audio src="kioku-audio://x"></audio>')).toBe('');
    expect(stripAudioHtml('frente [sound:a.mp3]')).toBe('frente');
  });

  it('leaves audio-free HTML untouched', () => {
    const html = '<b>pergunta</b> sem áudio';
    expect(stripAudioHtml(html)).toBe(html);
  });
});
