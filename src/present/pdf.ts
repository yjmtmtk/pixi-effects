/**
 * A minimal PDF writer: one JPEG per page, full page, no dependencies. Enough for a deck exported as pages (`movie.exportPDF()`).
 */
export interface PdfPage {
  /** A JPEG file (baseline or progressive, RGB), embedded as it is. */
  jpeg: Uint8Array;
  /** The picture's size in pixels; the page is that size in CSS pixels (a pixel is 0.75 pt). */
  width: number;
  height: number;
}

const enc = (s: string): Uint8Array => { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff; return out; };
const num = (n: number): string => String(Math.round(n * 1000) / 1000);
/** A PDF text string: plain ASCII in parentheses, anything else (a dash, Japanese) as UTF-16BE in hex with its byte order mark. */
const textString = (s: string): string => {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, m => `\\${m}`)})`;
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
};

export function buildPdf(pages: PdfPage[], opts: { title?: string } = {}): Uint8Array {
  if (pages.length === 0) throw new Error('pixi-effects: a PDF needs at least one page');
  // object numbers: 1 catalog, 2 page tree, then (page, contents, image) × n, then the info
  const first = (i: number) => 3 + i * 3;
  const objects: Uint8Array[][] = [];                        // each object: the byte chunks between "n 0 obj\n" and "\nendobj\n"
  objects[1] = [enc('<< /Type /Catalog /Pages 2 0 R >>')];
  objects[2] = [enc(`<< /Type /Pages /Kids [${pages.map((_, i) => `${first(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`)];
  pages.forEach((p, i) => {
    const w = p.width * 0.75, h = p.height * 0.75, n = first(i);
    objects[n] = [enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)];
    const content = `q ${num(w)} 0 0 ${num(h)} 0 0 cm /Im0 Do Q`;
    objects[n + 1] = [enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)];
    objects[n + 2] = [enc(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`), p.jpeg, enc('\nendstream')];
  });
  const infoNo = opts.title !== undefined ? first(pages.length) : 0;
  if (infoNo) objects[infoNo] = [enc(`<< /Title ${textString(opts.title!)} /Producer (pixi-effects) >>`)];
  const count = (infoNo || first(pages.length)) ;                     // highest object number + 1 is the /Size

  const chunks: Uint8Array[] = [enc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  for (let n = 1; n < count + (infoNo ? 1 : 0); n++) {
    const body = objects[n];
    if (!body) continue;
    offsets[n] = offset;
    const parts = [enc(`${n} 0 obj\n`), ...body, enc('\nendobj\n')];
    for (const part of parts) { chunks.push(part); offset += part.length; }
  }
  const size = (infoNo || first(pages.length)) + (infoNo ? 1 : 0);
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${size} /Root 1 0 R${infoNo ? ` /Info ${infoNo} 0 R` : ''} >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(enc(xref));

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
