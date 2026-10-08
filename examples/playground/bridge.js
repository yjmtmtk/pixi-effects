// examples/playground/bridge.js — the only way the Playground page talks to the sandboxed movie. Parent side: validate. Iframe side: BRIDGE_SOURCE.
const int = (v) => Number.isInteger(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const range = (v) => typeof v === 'string' || (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] >= 0 && v[0] < v[1]);

/** command name → a check of its arguments (returns an error text, or null when fine). */
export const COMMANDS = {
  status: () => null,
  play: () => null,
  pause: () => null,
  seek: (a) => (int(a.frame) && a.frame >= 0 ? null : 'seek: frame must be a whole number, 0 or more'),
  review: (a) => (a.at !== undefined && typeof a.at !== 'string' ? 'review: at must be a string' : null),
  look: (a) => {
    if (a.at !== undefined && typeof a.at !== 'string') return 'look: at must be a string';
    if (a.count !== undefined && !(int(a.count) && a.count >= 1 && a.count <= 24)) return 'look: count must be 1 to 24';
    return null;
  },
  onion: (a) => {
    for (const k of ['from', 'to']) if (a[k] !== undefined && !(num(a[k]) && a[k] >= 0)) return `onion: ${k} must be a number of seconds, 0 or more`;
    if (a.count !== undefined && !(int(a.count) && a.count >= 1 && a.count <= 64)) return 'onion: count must be 1 to 64';
    return null;
  },
  render: (a) => {
    if (a.range !== undefined && !range(a.range)) return 'render: range must be [from, to] seconds (from < to) or a layer name';
    if (a.draft !== undefined && typeof a.draft !== 'boolean') return 'render: draft must be true or false';
    return null;
  },
};

export function validateCommand(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { ok: false, error: 'a command message must be an object' };
  if (!int(msg.id)) return { ok: false, error: 'a command needs a whole-number id' };
  const check = Object.prototype.hasOwnProperty.call(COMMANDS, msg.cmd) ? COMMANDS[msg.cmd] : null;
  if (!check) return { ok: false, error: `unknown command "${msg.cmd}"` };
  const args = msg.args ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'args must be an object' };
  const error = check(args);
  return error ? { ok: false, error } : { ok: true };
}

/** The script that runs inside the sandboxed iframe, after the movie page. A plain script, no imports. */
export const BRIDGE_SOURCE = `
(function () {
  if (window.__pixiEffectsBridge) return;
  window.__pixiEffectsBridge = true;
  var post = function (m) { parent.postMessage(m, '*'); };
  var ready = function () { return window.__ready === true && window.movie; };
  var status = function () {
    var m = window.movie;
    return { ready: !!ready(), logs: (window.__logs || []).slice(), duration: m && m.duration, width: m && m.width, height: m && m.height, frameRate: m && m.frameRate, totalFrames: m && m.totalFrames, frame: m && m.currentFrame };
  };
  var need = function () { if (!ready()) throw new Error('the movie is not ready yet' + ((window.__logs || []).length ? ': ' + window.__logs[0] : '')); return window.movie; };
  var handlers = {
    status: function () { return status(); },
    play: function () { need().play(); return status(); },
    pause: function () { need().pause(); return status(); },
    seek: function (a) { return need().gotoFrame(a.frame, true).then(status); },
    review: function (a) { return need().review({ at: a.at, strict: !!a.strict }).then(function (r) { r.logs = (window.__logs || []).slice(); return r; }); },
    look: function (a) {
      var m = need();
      if (a.at) { var at = m.resolveAt(a.at); return m.contactSheet({ frames: at.map(function (x) { return x.frame; }), as: 'dataURL' }).then(function (url) { return { image: url, at: at }; }); }
      return m.contactSheet({ count: a.count || 6, as: 'dataURL' }).then(function (url) { return { image: url }; });
    },
    onion: function (a) { return need().onionSkin({ from: a.from, to: a.to, count: a.count, as: 'dataURL' }).then(function (url) { return { image: url }; }); },
    render: function (a) {
      var m = need(), t0 = performance.now();
      var opts = { format: 'mp4' }; if (a.range !== undefined) opts.range = a.range; if (a.draft) opts.draft = true;
      return m.render(opts).then(function (blob) { return { bytes: blob.size, type: blob.type, seconds: Math.round((performance.now() - t0) / 100) / 10 }; });
    }
  };
  window.addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var msg = event.data;
    if (!msg || typeof msg.id !== 'number' || !Object.prototype.hasOwnProperty.call(handlers, msg.cmd)) return;
    Promise.resolve().then(function () { return handlers[msg.cmd](msg.args || {}); })
      .then(function (result) { post({ id: msg.id, ok: true, result: result }); }, function (e) { post({ id: msg.id, ok: false, error: String((e && e.message) || e) }); });
  });
  // tell the page when the movie is ready or has failed, so it does not poll
  var tries = 0;
  (function wait() {
    if (ready()) return post({ event: 'ready', status: status() });
    var failed = (window.__logs || []).find(function (l) { return /^(init failed|uncaught|unhandled)/.test(l); });
    if (failed || ++tries > 600) return post({ event: 'failed', status: status(), error: failed || 'the movie did not become ready in 60 s' });
    setTimeout(wait, 100);
  })();
})();
`;
