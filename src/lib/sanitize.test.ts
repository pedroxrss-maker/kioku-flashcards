// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml — inline style sanitization', () => {
  it('strips transform (mirroring)', () => {
    const out = sanitizeHtml('<div style="transform:scaleX(-1)">x</div>');
    expect(out).not.toMatch(/transform/i);
    expect(out).toContain('x');
  });

  it('strips transform-origin, direction and unicode-bidi', () => {
    const out = sanitizeHtml(
      '<div style="transform-origin:left;direction:rtl;unicode-bidi:bidi-override">x</div>',
    );
    expect(out).not.toMatch(/transform-origin/i);
    expect(out).not.toMatch(/direction/i);
    expect(out).not.toMatch(/unicode-bidi/i);
  });

  it('strips fixed/absolute positioning and offsets', () => {
    const out = sanitizeHtml(
      '<div style="position:fixed;top:0;left:0;right:0;bottom:0;inset:0;z-index:999">x</div>',
    );
    expect(out).not.toMatch(/position/i);
    expect(out).not.toMatch(/z-index/i);
    expect(out).not.toMatch(/inset/i);
    // top/left/right/bottom gone too (only "x" remains as content)
    expect(out).not.toMatch(/top:|left:|right:|bottom:/i);
  });

  it('preserves safe cosmetic styles', () => {
    const out = sanitizeHtml('<span style="color:red">hello</span>');
    expect(out).toContain('color');
    expect(out).toContain('red');
    expect(out).toContain('hello');
  });

  it('keeps the safe parts of a mixed style and drops the rest', () => {
    const out = sanitizeHtml('<div style="color:blue;transform:scaleX(-1);text-align:center">x</div>');
    expect(out).toContain('color');
    expect(out).toContain('text-align');
    expect(out).not.toMatch(/transform/i);
  });

  it('removes the style attribute entirely when nothing safe remains', () => {
    const out = sanitizeHtml('<div style="transform:scaleX(-1);position:absolute">x</div>');
    expect(out).not.toMatch(/style=/i);
  });

  it('drops values with expression()/behavior even on allowed props', () => {
    const out = sanitizeHtml('<div style="width:expression(alert(1));color:red">x</div>');
    expect(out).not.toMatch(/expression/i);
    // the safe declaration in the same attribute still survives
    expect(out).toContain('color');
  });
});

describe('sanitizeHtml — class sanitization', () => {
  it('drops imported (Anki) classes', () => {
    const out = sanitizeHtml('<div class="card front nightMode">x</div>');
    expect(out).not.toMatch(/class=/i);
  });

  it('keeps known Kioku classes (audio chip styling)', () => {
    const out = sanitizeHtml(
      '<span class="kioku-audio-chip nightMode"><span class="kioku-audio-lbl">a</span></span>',
    );
    expect(out).toContain('kioku-audio-chip');
    expect(out).toContain('kioku-audio-lbl');
    expect(out).not.toMatch(/nightMode/);
  });
});

describe('sanitizeHtml — existing protections still hold', () => {
  it('drops <script> with its content', () => {
    const out = sanitizeHtml('<script>alert(1)</script>hi');
    expect(out).not.toMatch(/script/i);
    expect(out).toContain('hi');
  });

  it('removes on* event handlers', () => {
    const out = sanitizeHtml('<div onclick="alert(1)">x</div>');
    expect(out).not.toMatch(/onclick/i);
  });

  it('removes javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('keeps a normal image and its src', () => {
    const out = sanitizeHtml('<img src="kioku-media://u/d/flag.jpg">');
    expect(out).toContain('kioku-media://u/d/flag.jpg');
  });
});
