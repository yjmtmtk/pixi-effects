// examples/playground/problems.js — draws what movie.review() found (and the page's warnings) under the editor.
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

const range = (g) => (g.firstFrame === g.lastFrame ? `frame ${g.firstFrame}` : `frames ${g.firstFrame}–${g.lastFrame}`);

function section(title, items) {
  return items.length ? [el('h3', {}, title), el('ul', {}, ...items)] : [];
}

/** A layout finding: the message, how often, and a button that jumps to the first frame it was seen on. */
function group(g, onSeek) {
  const where = g.count > 1 ? `${g.count}× · ${range(g)}` : range(g);
  return el('li', {},
    el('span', { class: 'msg' }, g.message),
    el('span', { class: 'where' }, where),
    onSeek ? el('button', { type: 'button', 'aria-label': `Show ${range(g)}`, onclick: () => onSeek(g.firstFrame) }, 'Show') : null);
}

const line = (text, cls = 'msg') => el('li', {}, el('span', { class: cls }, text));

/**
 * Fills `box` and returns how many things need fixing (warnings, layout problems, audio issues, fonts).
 * Things to look at (text overlaps) and advice (sound notes) are shown but not counted.
 * `state` is { running: true } while a movie is being built.
 */
export function renderProblems(box, { logs = [], review = null, failed = null, running = false, onSeek = null } = {}) {
  box.replaceChildren();
  if (running) { box.dataset.state = 'idle'; box.append(el('h2', {}, 'Problems'), el('p', { class: 'ok' }, 'Running…')); return 0; }
  if (!review && !logs.length && !failed) { box.dataset.state = 'idle'; box.append(el('h2', {}, 'Problems'), el('p', { class: 'ok' }, 'Press Run to see what the library finds.')); return 0; }

  const warnings = [...logs.map((l) => line(l))];
  if (failed && !logs.some((l) => l.includes(failed))) warnings.unshift(line(failed));
  const layout = (review?.problems ?? []).map((g) => group(g, onSeek));
  const audio = review?.audio;
  const sound = (audio?.issues ?? []).map((t) => line(t));
  const fonts = review?.fonts;
  const fontLines = [
    ...(fonts?.failed ?? []).map((f) => line(`web font "${f}" could not be loaded`)),
  ];
  const count = warnings.length + layout.length + sound.length + fontLines.length;

  const look = (review?.review ?? []).map((g) => group(g, onSeek));
  const notes = (audio?.notes ?? []).map((t) => line(t, 'msg note'));

  box.dataset.state = count ? 'problems' : 'ok';
  box.append(el('h2', {}, 'Problems', el('span', { class: 'count' }, count ? String(count) : '0')));
  if (!count) box.append(el('p', { class: 'ok' }, 'No problems.' + (review ? ` Checked ${review.frames} frames.` : '')));
  box.append(
    ...section('Warnings from the library', warnings),
    ...section('Layout', layout),
    ...section('Sound', sound),
    ...section('Fonts', fontLines),
    ...section('Look at these on the picture (often intentional)', look),
    ...section('Sound: advice', notes),
  );
  return count;
}
