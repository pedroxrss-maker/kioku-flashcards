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
        if (name.startsWith('on')) child.removeAttribute(attr.name);
        else if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          /^\s*(javascript|data:text\/html|vbscript):/i.test(value)
        ) {
          child.removeAttribute(attr.name);
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
