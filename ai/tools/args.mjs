/**
 * How every `pixi-effects` command reads its command line (check, render, view, the media commands, new / recipe / help / quickstart): one reader, one help format.
 *
 *   --flag value  and  --flag=value      a value
 *   --flag                               a switch (true)
 *   -o                                   a short name, where the command has one
 *   -h, --help                           the usage with every option, one a line (exit 0)
 *   --                                   the end of the options: what follows is words (`pixi-effects help -- --range`)
 *   -1.5, -                              a negative number and a lone dash are words, not options
 *
 * A mistake is a UsageError (exit code 2): an unknown option with the nearest name, a value that is missing, an old name with its new one.
 * Zero dependencies.
 */

export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; this.exitCode = 2; }
}

/** The exit codes of every command (the contract, also in skills/pixi-effects/SKILL.md). */
export const EXIT_CODES = 'exit code: 0 OK · 1 the work has problems or the job failed (no Chrome, a page that never gets ready, a timeout, a file that cannot be read) · 2 the command line is wrong (an unknown option, a bad value, a missing argument)';

export function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep; }
  }
  return row[b.length];
}

/** The name in `list` nearest to `word` (edit distance at most 2, or a third of the name), or null. */
export function nearest(word, list) {
  let best = null;
  for (const c of list) {
    const d = distance(String(word).toLowerCase(), c.toLowerCase());
    if (d <= Math.max(2, Math.floor(c.length / 3)) && (!best || d < best.d)) best = { c, d };
  }
  return best?.c ?? null;
}

const isWord = (a) => !a.startsWith('-') || a === '-' || /^-\d/.test(a);

/**
 * `argv` read against `spec` = { name, usage, about, options: [{ flag: '--out', short?: '-o', value?: 'DIR', help }], renamed?: { '--old': '--new (why)' } }.
 * Returns { help, positional: [words], options: [{ flag (the long name), value (a string, or true for a switch) }] } in the order given.
 */
export function readArgs(argv, spec) {
  const list = spec.options ?? [];
  const byName = new Map();
  for (const o of list) { byName.set(o.flag, o); if (o.short) byName.set(o.short, o); }
  const end = argv.indexOf('--');
  const head = end < 0 ? argv : argv.slice(0, end);
  if (head.includes('-h') || head.includes('--help')) return { help: true, positional: [], options: [] };
  const positional = [], options = [];
  const fail = (m) => { throw new UsageError(`${spec.name}: ${m}`); };
  for (let i = 0; i < head.length; i++) {
    const a = head[i];
    if (isWord(a)) { positional.push(a); continue; }
    const eq = a.startsWith('--') ? a.indexOf('=') : (a.length > 2 && a[2] === '=' ? 2 : -1);
    const name = eq < 0 ? a : a.slice(0, eq);
    if (spec.renamed?.[name]) fail(`${name} is now ${spec.renamed[name]}`);
    const opt = byName.get(name);
    if (!opt) {
      const guess = nearest(name, [...byName.keys()].filter(k => k.startsWith('--')));
      const names = list.map(o => o.flag);
      fail(`unknown option ${name}${guess ? `; did you mean ${guess}?` : ''} (${names.length && names.length <= 8 ? `options: ${names.join(', ')}; ` : ''}pixi-effects ${spec.name} --help lists every option)`);
    }
    if (!opt.value) {
      if (eq >= 0) fail(`${opt.flag} takes no value (got "${a}")`);
      options.push({ flag: opt.flag, value: true });
      continue;
    }
    let value;
    if (eq >= 0) value = a.slice(eq + 1);
    else {
      value = head[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`${name} needs a value (${opt.value})`);
      i++;
    }
    options.push({ flag: opt.flag, value });
  }
  if (end >= 0) positional.push(...argv.slice(end + 1));
  return { help: false, positional, options };
}

/** The --help text: the usage line, what the command does, every option on one line, the exit codes. */
export function helpText(spec) {
  const rows = [...(spec.options ?? []), { flag: '--help', short: '-h', help: 'this list' }].map(o => [`${o.short ? `${o.short}, ` : '    '}${o.flag}${o.value ? ` ${o.value}` : ''}`, o.help]);
  const width = Math.min(30, Math.max(...rows.map(r => r[0].length)) + 2);
  const L = [`usage: pixi-effects ${spec.name} ${spec.usage}`];
  if (spec.about) L.push(spec.about);
  L.push('', 'options:');
  for (const [left, help] of rows) L.push(`  ${left.padEnd(width)}${left.length >= width ? ' ' : ''}${help}`);
  for (const note of spec.notes ?? []) L.push(note);
  L.push(EXIT_CODES);
  return L.join('\n');
}

/** A command line with no page / file: a usage mistake that says what to write. */
export function missing(spec, what) {
  return new UsageError(`${spec.name}: needs ${what} (pixi-effects ${spec.name} --help lists every option)`);
}

/** The end of a command that failed: one sentence on stderr, and the exit code (2 for a usage mistake, 1 for anything else: no Chrome, a timeout, a page that is missing). */
export function exitWith(e, name) {
  const text = String(e?.message ?? e).replace(new RegExp(`^${name}: `), '');
  if (e instanceof UsageError) { console.error(`pixi-effects ${name}: ${text}`); process.exit(2); }
  console.error(`pixi-effects ${name} failed: ${text}`);
  process.exit(1);
}
