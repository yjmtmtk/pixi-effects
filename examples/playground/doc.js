// examples/playground/doc.js — the Playground's document is the edit block of ai/chat-template.html (the page the AI-in-a-chat entry hands out).
import { BRIDGE_SOURCE } from './bridge.js';

export const EDIT_FROM = '// ===================== EDIT FROM HERE =====================';
export const EDIT_UNTIL = '// ===================== EDIT UNTIL HERE =====================';
const INDENT = '    ';

function bounds(html) {
  const a = html.indexOf(EDIT_FROM), b = html.indexOf(EDIT_UNTIL);
  if (a < 0 || b < 0 || b < a) throw new Error(`the template has no "EDIT FROM HERE" … "EDIT UNTIL HERE" block (ai/chat-template.html changed?)`);
  const start = html.indexOf('\n', a) + 1;
  return { start, end: html.lastIndexOf('\n', b) };             // the block is the lines between the two mark lines
}

/** The code of the edit block, without the 4-space indent the page gives it. */
export function editRegion(html) {
  const { start, end } = bounds(html);
  return html.slice(start, end).split('\n').map((l) => (l.startsWith(INDENT) ? l.slice(INDENT.length) : l)).join('\n');
}

/** The page with `code` as its edit block (indented back). */
export function withRegion(html, code) {
  const { start, end } = bounds(html);
  const body = String(code).split('\n').map((l) => (l ? INDENT + l : l)).join('\n');
  return html.slice(0, start) + body + html.slice(end);       // slices, not String.replace: `code` may contain $& and friends
}

const baseTag = (assetBase) => `<head>\n  <base href="${assetBase}">`;
const addImports = (html, extraImports) => {
  const extra = Object.entries(extraImports).map(([k, v]) => `      "${k}": "${v}",\n`).join('');
  return extra ? html.replace('"imports": {\n', () => `"imports": {\n${extra}`) : html;
};

/** For saving: the template with the block replaced, still on the released library from the CDN. `assetBase`: where `_assets/…` files load from. */
export function standalone(html, code, { extraImports = {}, assetBase } = {}) {
  let out = withRegion(html, code);
  if (assetBase) out = out.replace('<head>', () => baseTag(assetBase));
  return addImports(out, extraImports);
}

const PINS = /https:\/\/cdn\.jsdelivr\.net\/npm\/pixi-effects@[\d.]+\/dist\//g;

/** For the sandboxed iframe: this site's library, assets resolved from `assetBase`, the bridge, and extra import-map entries. */
export function compose(html, code, { distBase, assetBase, extraImports = {} }) {
  const out = standalone(html, code, { extraImports, assetBase }).replace(PINS, () => distBase);
  const at = out.lastIndexOf('</body>');
  return out.slice(0, at) + `<script>${BRIDGE_SOURCE}</script>\n` + out.slice(at);
}
