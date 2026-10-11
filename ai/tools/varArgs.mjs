/**
 * `--var name=value` and `--size WxH` for `pixi-effects check` and `render`: read here, matched against what the page declares
 * (`movie.vars`), then the tool calls `movie.rebuild({ vars, width, height })` once the page is ready. The page needs nothing for this.
 */

/** 'lang=en' → ['lang', 'en'] (the value is the rest of the text; the page decides whether it is a number). */
export function parseVar(text) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`--var must look like name=value (lang=en, shift=40, accent=#e5399a), got "${text}"`);
  return [m[1], m[2]];
}

/** '1920x1080,1080x1920' → [{ width, height }, …]. */
export function parseSizes(text) {
  const bad = () => new Error(`--size must look like 1920x1080 (whole pixels; several with a comma: 1920x1080,1080x1920), got "${text}"`);
  const out = String(text).split(',').map(part => {
    const m = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/.exec(part);
    if (!m || Number(m[1]) < 1 || Number(m[2]) < 1) throw bad();
    return { width: Number(m[1]), height: Number(m[2]) };
  });
  if (!out.length) throw bad();
  return out;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep; }
  }
  return row[b.length];
}
const nearestOf = (word, list) => {
  let best = null;
  for (const c of list) { const d = distance(word.toLowerCase(), c.toLowerCase()); if (d <= Math.max(2, Math.floor(c.length / 3)) && (!best || d < best.d)) best = { c, d }; }
  return best?.c ?? null;
};

/** The pairs from `--var`, as the values the page's variables take: a number variable gets a number, a string variable the text. `declared` is `movie.vars`. */
export function coerceVars(pairs, declared) {
  const names = Object.keys(declared);
  const out = {};
  for (const [name, raw] of pairs) {
    if (!names.length) throw new Error(`--var ${name}: the page declares no variables (declare them in movie.init({ vars: { ${name}: … }, … }))`);
    if (!Object.prototype.hasOwnProperty.call(declared, name)) {
      const guess = nearestOf(name, names);
      throw new Error(`--var ${name}: the page declares no variable "${name}"${guess ? ` — did you mean "${guess}"?` : ''} (declared: ${names.join(', ')})`);
    }
    if (typeof declared[name] === 'number') {
      const n = raw.trim() === '' ? NaN : Number(raw);
      if (!Number.isFinite(n)) throw new Error(`--var ${name}=${raw}: "${name}" is a number in the page (it declares ${declared[name]}), got "${raw}"`);
      out[name] = n;
    } else out[name] = raw;
  }
  return out;
}

/**
 * Once the page is ready: set the variables and the size the command line gave, with one `movie.rebuild`. Returns the rebuild report, or null when
 * nothing was asked. `cdp.eval` is the command's page connection. A refusal (an unknown name, a rebuild that failed) is thrown as a usage error.
 */
export async function applyToPage(cdp, pairs, size) {
  if (!pairs.length && !size) return null;
  const declared = await cdp.eval('JSON.parse(JSON.stringify((window.movie && window.movie.vars) || {}))');
  const given = coerceVars(pairs, declared);
  const change = { ...(Object.keys(given).length ? { vars: given } : {}), ...(size ?? {}) };
  const answer = JSON.parse(await cdp.eval(`(async () => {
    try {
      if (typeof movie.rebuild !== 'function') return JSON.stringify({ error: "this page's pixi-effects is older than --var / --size: use 0.31 or newer (the version in the page's import map)" });
      return JSON.stringify({ report: await movie.rebuild(${JSON.stringify(change)}) });
    } catch (e) { return JSON.stringify({ error: String((e && e.message) || e) }); }
  })()`));
  if (answer.error) throw new Error(`${answer.error.replace(/^pixi-effects: /, '')} (while applying ${[...pairs.map(([n, v]) => `--var ${n}=${v}`), size ? `--size ${size.width}x${size.height}` : ''].filter(Boolean).join(' ')})`);
  return answer.report;
}
