// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// A chat in a browser can run commands in a container the person does not own (no GPU, a closed network, root). An agent there stalled for minutes on `check` and on
// rewiring the page to local libraries, and was stopped by the person twice. The docs must say what to do there: hand over the page, let the person export.
describe('what an agent does in a browser chat\'s sandbox is written down (AGENTS.md and SKILL.md)', () => {
  for (const file of ['AGENTS.md', 'skills/pixi-effects/SKILL.md']) {
    describe(file, () => {
      const md = read(file);
      const section = md.slice(md.search(/^#{2,3} .*sandbox/im));
      it('has a section about a sandbox that is not the person\'s computer', () => {
        expect(md).toMatch(/^#{2,3} .*sandbox/im);
        expect(section).toMatch(/not the person's (computer|PC)|a container/i);
      });
      it('says the page goes to the person as it is (CDN imports) and the person exports with the download button of the player bar, not the sandbox', () => {
        expect(section).toMatch(/download button/i);
        expect(section).toMatch(/do not (start chrome or )?(render|export)/i);
        expect(section).toMatch(/weak/i);                                                   // the container is weak: Chrome and rendering are very slow there (not "no GPU": software rendering was not slower on a strong machine)
      });
      it('says to follow the chat way (the template from CHAT.md, edited and handed over, warnings come back from the red box) with no npx, no npm and no check / render / view', () => {
        expect(section).toMatch(/CHAT\.md/);
        expect(section).toMatch(/no `?npx`?|do not (run|use) `?npx/i);
        expect(section).toMatch(/npm/);
        expect(section).toMatch(/check|view/);
        expect(section).toMatch(/red box/i);
      });
      it('says to stop instead of working around a stall, and to say what was not checked', () => {
        expect(section).toMatch(/stop/i);
        expect(section).toMatch(/not (been )?verified|what you did not (check|verify)|did not check/i);
      });
    });
  }
});
