// examples/playground/editor.js — the code editor: CodeMirror (loaded from esm.sh), or a plain textarea if it cannot be loaded.
const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Calls `fn` whenever the page switches between its dark and light look (the header button, or the system setting under "auto"). */
function onThemeChange(fn) {
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
}

function textareaEditor({ parent, doc, onRun }) {
  const ta = document.createElement('textarea');
  ta.value = doc; ta.spellcheck = false; ta.setAttribute('aria-label', 'Code');
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onRun(); } });
  parent.append(ta);
  return { kind: 'textarea', get: () => ta.value, set: (code) => { ta.value = code; }, focus: () => ta.focus() };
}

/** → { kind, get(), set(code), focus() }. `onRun` is called by ⌘↵ / Ctrl+↵. */
export async function createEditor({ parent, doc, onRun }) {
  let cm;
  try {
    const [base, state, view, lang, dark] = await Promise.all([
      import('codemirror'), import('@codemirror/state'), import('@codemirror/view'),
      import('@codemirror/lang-javascript'), import('@codemirror/theme-one-dark'),
    ]);
    cm = { ...base, ...state, ...view, ...lang, ...dark };
  } catch (e) {
    console.warn('The code editor could not be loaded (' + (e && e.message || e) + '): using a plain text box.');
    return textareaEditor({ parent, doc, onRun });
  }
  const theme = new cm.Compartment();
  const themeFor = () => (isDark() ? cm.oneDark : []);
  let view;
  try {
    view = new cm.EditorView({
      doc,
      parent,
      extensions: [
        cm.basicSetup,
        cm.javascript(),
        theme.of(themeFor()),
        cm.keymap.of([{ key: 'Mod-Enter', preventDefault: true, run: () => { onRun(); return true; } }]),
        cm.EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'var(--mono)' } }),
      ],
    });
  } catch (e) {
    console.warn('The code editor could not start (' + (e && e.message || e) + '): using a plain text box.');
    parent.replaceChildren();
    return textareaEditor({ parent, doc, onRun });
  }
  onThemeChange(() => view.dispatch({ effects: theme.reconfigure(themeFor()) }));
  return {
    kind: 'codemirror',
    get: () => view.state.doc.toString(),
    set: (code) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    focus: () => view.focus(),
  };
}
