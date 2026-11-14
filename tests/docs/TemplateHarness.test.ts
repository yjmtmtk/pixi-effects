import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

// The two templates collect every console warning into window.__logs (what `check` and the chat's red box show). PixiJS prints a deprecation as a
// collapsed group whose TITLE is the message ("%cPixiJS Deprecation Warning: %c%s", two styles, the text) and whose only warn is the stack, so the
// collected line was a bare stack (a trial agent had to guess the warning from it). The title of an open group now leads the warns inside it.
const root = resolve(__dirname, '../..');
const harness = (file: string) => {
  const html = readFileSync(resolve(root, file), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((s) => s.includes('window.__logs'));
  if (!script) throw new Error(`no harness script in ${file}`);
  return script;
};
function run(file: string, calls: (c: any) => void): string[] {
  const noop = () => {};
  const el = { style: {}, textContent: '', onclick: null };
  const window: any = { addEventListener: noop };
  const console = { warn: noop, error: noop, log: noop, groupCollapsed: noop, groupEnd: noop };
  const context: any = { window, console, document: { getElementById: () => el, createRange: () => ({}) }, navigator: {}, getSelection: () => ({}) };
  runInNewContext(harness(file), context);
  calls(context.console);
  return context.window.__logs;
}
const pixiDeprecation = (c: any) => {
  c.groupCollapsed('%cPixiJS Deprecation Warning: %c%s', 'color:#614108;background:#fffbe6', 'font-weight:normal;color:#614108', 'addChild: Only Containers will be allowed to add children in v8.0.0\nDeprecated since v8.0.0');
  c.warn('Error\n    at addChild (pixi.mjs:1:1)');
  c.groupEnd();
  c.warn('pixi-effects: a plain warning');
};

describe('the templates collect a PixiJS deprecation with its message', () => {
  for (const file of ['skills/pixi-effects/template.html', 'ai/chat-template.html']) {
    it(file, () => {
      const logs = run(file, pixiDeprecation);
      expect(logs[0]).toMatch(/^warn: PixiJS Deprecation Warning: addChild: Only Containers will be allowed/);
      expect(logs[0]).not.toMatch(/%c|color:/);
      expect(logs[1]).toBe('warn: pixi-effects: a plain warning');
    });
  }
});
