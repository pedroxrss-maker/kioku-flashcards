/**
 * Minimal HTML sanitizer for the render path. Card HTML is mostly first-party
 * (our editor), but imported `.apkg` content is third-party — strip scripts,
 * event handlers and javascript: URLs while keeping basic formatting + images.
 */

const ALLOWED = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN', 'UL', 'OL',
  'LI', 'IMG', 'A', 'SUB', 'SUP', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'CODE',
  'PRE', 'HR', 'B*', 'FONT', 'AUDIO', 'SOURCE',
]);
const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG',
]);

/** Classes kept on imported content. Anki template classes are dropped (they
 *  shouldn't carry over or accidentally match app CSS); our own audio-chip
 *  classes must survive for the render-path styling. */
const KIOKU_CLASSES = new Set(['kioku-audio-chip', 'kioku-audio-lbl', 'kioku-audio-del']);

/** Allowlist of cosmetic CSS properties kept on inline `style`. Everything else
 *  (transform, transform-origin, direction, unicode-bidi, position/top/right/
 *  bottom/left/inset, z-index, …) is dropped so imported styles can't mirror,
 *  displace, or escape the card. No url()-bearing props (background shorthand,
 *  list-style-image) are allowed, so a style can't load or point anywhere. */
const SAFE_STYLE_PROPS = new Set([
  'color', 'background-color',
  'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'white-space',
  'text-align', 'text-transform', 'vertical-align',
  'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-width', 'border-style', 'border-radius',
  'list-style', 'list-style-type', 'list-style-position',
]);

/** Even an allowlisted property is dropped if its value tries to run script or
 *  load a dangerous URL (old-IE expression()/behavior:, or url() pointing at
 *  javascript:/vbscript:/data:text/html). */
const DANGEROUS_VALUE =
  /expression\s*\(|behavior\s*:|javascript:|vbscript:|url\s*\(\s*['"]?\s*(?:javascript|vbscript|data:text\/html)/i;

/** Keep only allowlisted, safe declarations from an inline style string; returns
 *  the cleaned style (may be empty, in which case the caller drops the attr). */
function sanitizeStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    if (!SAFE_STYLE_PROPS.has(prop)) continue;
    if (DANGEROUS_VALUE.test(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName.toUpperCase();
      if (DROP_WITH_CONTENT.has(tag)) {
        child.remove();
        return;
      }
      // Strip dangerous attributes everywhere.
      Array.from(child.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        if (name.startsWith('on')) {
          child.removeAttribute(attr.name);
        } else if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          /^\s*(javascript|data:text\/html|vbscript):/i.test(value)
        ) {
          child.removeAttribute(attr.name);
        } else if (name === 'style') {
          // Imported cards can carry layout-breaking inline CSS (transform,
          // direction, absolute/fixed positioning). Keep only safe cosmetics.
          const cleaned = sanitizeStyle(value);
          if (cleaned) child.setAttribute('style', cleaned);
          else child.removeAttribute(attr.name);
        } else if (name === 'class') {
          // Drop Anki template classes; keep only our own (audio-chip styling).
          const kept = value.split(/\s+/).filter((c) => KIOKU_CLASSES.has(c));
          if (kept.length) child.setAttribute('class', kept.join(' '));
          else child.removeAttribute(attr.name);
        }
      });
      if (!ALLOWED.has(tag)) {
        // Unwrap unknown tags but keep their (already-walked) children.
        walk(child);
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      walk(child);
    });
  };

  walk(doc.body);
  return doc.body.innerHTML;
}
