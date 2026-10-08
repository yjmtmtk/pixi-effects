// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

describe('check.parseArgs: --query (a page that reads its address, as in the batch recipe)', () => {
  it('is added to the page address; a leading ? is allowed; none by default', () => {
    expect(check.parseArgs(['p.html']).query).toBeNull();
    expect(check.parseArgs(['p.html', '--query', 'name=Aiko&score=92']).query).toBe('name=Aiko&score=92');
    expect(check.parseArgs(['p.html', '--query', '?a=1']).query).toBe('a=1');
  });
});

describe('check.parseArgs: --at, --draft, --onion', () => {
  it('reads them, with the old defaults when absent', () => {
    expect(check.parseArgs(['p.html'])).toMatchObject({ at: null, draft: false, onion: null });
    expect(check.parseArgs(['p.html', '--at', '3,title@end', '--draft', '--onion', '1:3'])).toMatchObject({ at: '3,title@end', draft: true, onion: [1, 3] });
    expect(() => check.parseArgs(['p.html', '--onion', '3'])).toThrow(/--onion must look like 1:3/);
  });
});
