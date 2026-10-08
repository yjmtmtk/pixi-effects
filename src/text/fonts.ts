const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont']);

/** True when `family` is a real font here: a generic name, a loaded web font, or an installed one (it draws differently from its fallback). */
export function fontAvailable(family: string): boolean {
  const f = family.trim().replace(/^["']|["']$/g, '');
  if (!f || GENERIC.has(f.toLowerCase())) return true;
  const g = document.createElement('canvas').getContext('2d');
  if (!g) return true;
  const sample = 'mmmmmmmmmmlliWWWW 0123 あいう';
  const width = (stack: string): number => { g.font = `72px ${stack}`; return g.measureText(sample).width; };
  const q = JSON.stringify(f);
  return width(`${q}, monospace`) !== width('monospace') || width(`${q}, serif`) !== width('serif');
}
