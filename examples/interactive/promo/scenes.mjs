// The scenes of the promo: what a person does on each sample page, as data. capture.mjs plays them one frame at a time.
//   plan(api) → { cursor: [{ t, x, y }], clicks: [{ t, x?, y? }], acts: [{ t, d?, run(api, k, i) }], inner(i, t) }
// `acts` run once at `t` (d: 0) or on every frame from `t` for `d` seconds (k goes 0 → 1); `inner` is the frame the page's movie shows at output frame i.
const set = (sel, value) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`;
const typeInto = (sel, text) => async (api, k) => { const n = Math.round(k * text.length); await api.ev(set(sel, text.slice(0, n))); };
const click = (sel) => async (api) => { await api.ev(`document.querySelector(${JSON.stringify(sel)}).click()`); };
const lerp = (a, b, u) => a + (b - a) * u;

export const SCENES = {
  // 1. a form: type a name, pick a colour, drag the age
  card: {
    page: 'card', seconds: 7.5,
    async plan(api) {
      const name = await api.center('#name'), age = await api.rect('#age');
      const sw = [await api.center('#swatch button:nth-child(2)'), await api.center('#swatch button:nth-child(3)'), await api.center('#swatch button:nth-child(4)')];
      const thumb = (v) => [age.left + 8 + (v - 1) / 98 * (age.width - 16), age.top + age.height / 2];
      const [a0x, a0y] = thumb(30), [a1x, a1y] = thumb(72);
      await api.ev(set('#name', ''));                      // the field starts empty: the first name is typed
      return {
        cursor: [{ t: 0, x: 1300, y: 700 }, { t: 0.7, x: name[0], y: name[1] }, { t: 2.2, x: name[0] + 40, y: name[1] }, { t: 3.0, x: a0x, y: a0y }, { t: 4.1, x: a1x, y: a1y },
          { t: 4.9, x: sw[0][0], y: sw[0][1] }, { t: 5.9, x: sw[1][0], y: sw[1][1] }, { t: 6.9, x: 1100, y: 600 }],
        clicks: [{ t: 0.75, x: name[0], y: name[1] }, { t: 4.95, x: sw[0][0], y: sw[0][1] }, { t: 5.95, x: sw[1][0], y: sw[1][1] }],
        acts: [
          { t: 0.8, d: 0.7, run: typeInto('#name', 'Ben') },
          { t: 2.0, d: 0.6, run: async (api, k) => { await api.ev(set('#name', k < 0.4 ? 'Ben'.slice(0, 3 - Math.round(k / 0.4 * 3)) : 'Zoë'.slice(0, Math.round((k - 0.4) / 0.6 * 3)))); } },
          { t: 3.0, d: 1.1, run: async (api, k) => { await api.ev(set('#age', String(Math.round(lerp(30, 72, k))))); } },
          { t: 4.95, run: click('#swatch button:nth-child(2)') }, { t: 5.95, run: click('#swatch button:nth-child(3)') },
        ],
        inner: (i) => Math.min(55 + i, 190),
      };
    },
  },

  // 2. scrolling: the page's scroll is the variable
  city: {
    page: 'scroll-city', seconds: 6,
    async plan(api) {
      const max = await api.ev('document.getElementById("track").offsetHeight - innerHeight');
      const e = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
      return {
        cursor: [{ t: 0, x: 1000, y: 520 }, { t: 1.0, x: 1060, y: 470 }, { t: 5.5, x: 1020, y: 500 }],
        clicks: [],
        acts: [{ t: 0.7, d: 4.6, run: async (api, k) => { await api.ev(`window.scrollTo(0, ${Math.round(max * e(k))})`); await api.ev('__settle()'); } }],
        inner: (i) => i % 360,
      };
    },
  },

  // 3. seek back before SHOOT! and it throws again; seek anywhere after it and the ending is the same
  janken: {
    page: 'janken', query: '?you=1&cpu=2', seconds: 12.6,
    async plan(api) {
      await api.ev(`(() => { const seq = [0.1, 0.5, 0.9, 0.3, 0.7]; Math.random = () => seq.shift() ?? 0.5; })()`);          // the rolls to come: rock, paper, scissors …
      const bar = await api.rect('.mc-progress'), total = await api.ev('movie.totalFrames');
      const x = (f) => bar.left + (f / total) * bar.width, y = bar.top + bar.height / 2;
      // [start s, end s, from frame, to frame]: the playhead's path
      const path = [[0, 2.8, 0, 84], [2.8, 3.4, 84, 84], [3.4, 4.1, 84, 20], [4.1, 6.3, 20, 84], [6.3, 6.9, 84, 84], [6.9, 7.6, 84, 24], [7.6, 9.8, 24, 84], [9.8, 10.2, 84, 84], [10.2, 11.0, 84, 140], [11.0, 11.8, 140, 70], [11.8, 12.6, 70, 110]];
      const inner = (i, t) => { for (const [a, b, f0, f1] of path) if (t >= a && t < b) return lerp(f0, f1, (t - a) / (b - a)); return 110; };
      const park = [1100, 440];
      return {
        cursor: [{ t: 0, x: park[0], y: park[1] }, { t: 2.9, x: park[0], y: park[1] }, { t: 3.35, x: x(84), y }, { t: 4.1, x: x(20), y }, { t: 4.5, x: park[0], y: park[1] }, { t: 6.3, x: park[0], y: park[1] }, { t: 6.85, x: x(84), y },
          { t: 7.6, x: x(24), y }, { t: 8.0, x: park[0], y: park[1] }, { t: 9.9, x: park[0], y: park[1] }, { t: 10.2, x: x(84), y }, { t: 11.0, x: x(140), y }, { t: 11.8, x: x(70), y }, { t: 12.6, x: x(110), y }],
        clicks: [{ t: 3.4, x: x(84), y }, { t: 6.9, x: x(84), y }, { t: 10.2, x: x(84), y }],
        acts: [],
        inner,
        meta: { bar, total, ponFrame: 48 },
      };
    },
  },

  // 4. the music is text: pick chords
  chords: {
    page: 'chords', seconds: 6,
    async plan(api) {
      const b = [await api.center('#presets button:nth-child(2)'), await api.center('#presets button:nth-child(3)'), await api.center('#presets button:nth-child(4)')];
      return {
        cursor: [{ t: 0, x: 1200, y: 640 }, { t: 0.9, x: b[0][0], y: b[0][1] }, { t: 2.4, x: b[1][0], y: b[1][1] }, { t: 3.9, x: b[2][0], y: b[2][1] }, { t: 5.2, x: 1100, y: 600 }],
        clicks: [{ t: 0.95, x: b[0][0], y: b[0][1] }, { t: 2.45, x: b[1][0], y: b[1][1] }, { t: 3.95, x: b[2][0], y: b[2][1] }],
        acts: [{ t: 0.95, run: click('#presets button:nth-child(2)') }, { t: 2.45, run: click('#presets button:nth-child(3)') }, { t: 3.95, run: click('#presets button:nth-child(4)') }],
        inner: (i) => (20 + i) % 300,
      };
    },
  },
};
