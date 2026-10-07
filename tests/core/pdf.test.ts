import { describe, it, expect } from 'vitest';
import { buildPdf } from '../../src/core/pdf';

// a real 1 x 1 baseline JPEG
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), c => c.charCodeAt(0));
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('buildPdf: JPEG pages into a PDF', () => {
  const pdf = buildPdf([{ jpeg: JPEG, width: 1280, height: 720 }, { jpeg: JPEG, width: 1280, height: 720 }, { jpeg: JPEG, width: 640, height: 360 }], { title: 'My deck' });
  const s = text(pdf);

  it('is a PDF: header, catalog, a page tree that counts the pages, an end marker', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toMatch(/\/Type \/Catalog \/Pages 2 0 R/);
    expect(s).toMatch(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count 3/);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect((s.match(/\/Type \/Page\b(?!s)/g) ?? [])).toHaveLength(3);
  });

  it('each page is the size of its picture in points (a CSS pixel is 0.75 pt: 1280 × 720 px is 960 × 540 pt)', () => {
    expect(s).toContain('/MediaBox [0 0 960 540]');
    expect(s).toContain('/MediaBox [0 0 480 270]');
    expect(s).toContain('960 0 0 540 0 0 cm');
  });

  it('every picture is embedded as it came (DCTDecode), with its width, height and exact length', () => {
    expect((s.match(/\/Filter \/DCTDecode/g) ?? [])).toHaveLength(3);
    expect(s).toContain(`/Length ${JPEG.length}`);
    expect(s).toContain('/Width 1280 /Height 720');
    // the JPEG's bytes are in the file, untouched
    const hay = Array.from(pdf);
    const needle = Array.from(JPEG);
    let found = 0;
    for (let i = 0; i + needle.length <= hay.length; i++) { if (hay[i] === needle[0] && needle.every((b, k) => hay[i + k] === b)) { found++; i += needle.length - 1; } }
    expect(found).toBe(3);
  });

  it('the cross-reference table is exact: every offset points at its "n 0 obj", and startxref points at the table', () => {
    const start = Number(/startxref\s+(\d+)/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    const lines = s.slice(start).split('\n');
    const size = Number(/\/Size (\d+)/.exec(s)![1]);
    const entries = lines.slice(2, 2 + size);
    expect(entries[0]).toMatch(/^0000000000 65535 f/);
    entries.slice(1).forEach((line, i) => {
      const off = Number(line.slice(0, 10));
      expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('the title goes in the document info', () => {
    expect(s).toContain('/Title (My deck)');
    expect(text(buildPdf([{ jpeg: JPEG, width: 10, height: 10 }], { title: 'a (b) \\ c' }))).toContain('/Title (a \\(b\\) \\\\ c)');
  });

  it('a title with a dash or Japanese is kept (UTF-16, as PDF wants it), not turned into question marks', () => {
    const s2 = text(buildPdf([{ jpeg: JPEG, width: 10, height: 10 }], { title: 'a — 花火' }));
    expect(s2).toContain('/Title <FEFF006100202014002082B1706B>');
  });

  it('without a title there is no info entry; no pages is an error', () => {
    expect(text(buildPdf([{ jpeg: JPEG, width: 10, height: 10 }]))).not.toContain('/Title');
    expect(() => buildPdf([])).toThrow(/at least one page/);
  });
});
