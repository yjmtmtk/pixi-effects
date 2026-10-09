// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const mcp: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/mcp.js')).href);

function fakeApi() {
  const calls: string[] = []; let code = 'const sequences = [];';
  return { calls, api: {
    getCode: () => code, setCode: (c: string) => { calls.push('setCode'); code = c; },
    run: async () => { calls.push('run'); return { ready: true, logs: [], duration: 6, width: 1280, height: 720, frameRate: 30, totalFrames: 180 }; },
    call: async (cmd: string, args: any) => { calls.push(`call:${cmd}`); if (cmd === 'review') return { frames: 30, problems: [], review: [], fonts: { missing: [], failed: [], failedUnused: [] }, audio: null, at: [], logs: [] }; if (cmd === 'look') return { image: 'data:image/png;base64,AAAA' }; if (cmd === 'render') return { bytes: 5000, type: 'video/mp4', seconds: 1.2 }; return {}; },
    examples: () => [{ id: '01-hello', label: '01 · hello' }], loadExample: async (id: string) => { calls.push('load:' + id); return { id }; },
    docsUrl: (part: string) => `https://x.example/skills/pixi-effects/reference/${part}.md`, fetchText: async (u: string) => `DOC ${u}`,
  } };
}

describe('WebMCP tools', () => {
  it('there are ten, each with a name, a description and an object schema', () => {
    const tools = mcp.defineTools(fakeApi().api);
    expect(tools.map((t: any) => t.name).sort()).toEqual(['check', 'get_code', 'get_docs', 'list_examples', 'load_example', 'look', 'onion', 'render_draft', 'run', 'set_code'].sort());
    for (const t of tools) { expect(t.description.length).toBeGreaterThan(20); expect(t.inputSchema.type).toBe('object'); }
  });
  it('read-only tools say so', () => {
    const tools = mcp.defineTools(fakeApi().api);
    for (const n of ['get_code', 'check', 'look', 'onion', 'get_docs', 'list_examples']) expect(tools.find((t: any) => t.name === n).annotations?.readOnlyHint, n).toBe(true);
    for (const n of ['set_code', 'run', 'load_example']) expect(tools.find((t: any) => t.name === n).annotations?.readOnlyHint, n).not.toBe(true);
  });
  it('what the page\'s own code can write (warnings, the review) reaches the agent marked as untrusted: tools that return it say so', () => {
    const tools = mcp.defineTools(fakeApi().api);
    for (const n of ['get_code', 'set_code', 'run', 'check', 'load_example']) expect(tools.find((t: any) => t.name === n).annotations?.untrustedContentHint, n).toBe(true);
    expect(tools.find((t: any) => t.name === 'check').description).toMatch(/warnings? (and|come|are)[^.]*(page|code)/i);
  });
  it('set_code replaces the code and runs it (run: true by default), and returns a short summary', async () => {
    const { api, calls } = fakeApi();
    const t = mcp.defineTools(api).find((x: any) => x.name === 'set_code');
    const r = await t.execute({ code: 'const sequences = [1];' });
    expect(calls).toEqual(['setCode', 'run']);
    expect(JSON.parse(r.content[0].text)).toMatchObject({ ready: true, duration: 6 });
    calls.length = 0;
    await t.execute({ code: 'x', run: false });
    expect(calls).toEqual(['setCode']);
  });
  it('a failed run is reported in the result (not thrown): the agent reads what to fix', async () => {
    const { api } = fakeApi();
    api.run = async () => ({ ready: false, logs: ['warn: unknown option "styel"'], failed: 'init failed: x' });
    const r = await mcp.defineTools(api).find((x: any) => x.name === 'run').execute({});
    const body = JSON.parse(r.content[0].text);
    expect(body.ready).toBe(false);
    expect(body.failed).toMatch(/init failed/);
    expect(body.logs[0]).toMatch(/styel/);
  });
  it('bad arguments are an error result that says what is wrong, never an exception', async () => {
    const tools = mcp.defineTools(fakeApi().api);
    const r = await tools.find((x: any) => x.name === 'set_code').execute({ code: 42 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/code must be a string/);
    const r2 = await tools.find((x: any) => x.name === 'get_docs').execute({ part: 'secrets' });
    expect(r2.isError).toBe(true);
    expect(r2.content[0].text).toMatch(/part must be one of: cheatsheet, recipes, pitfalls/);
  });
  it('get_docs returns the reference text of the same site', async () => {
    const r = await mcp.defineTools(fakeApi().api).find((x: any) => x.name === 'get_docs').execute({ part: 'cheatsheet' });
    expect(r.content[0].text).toContain('DOC https://x.example/skills/pixi-effects/reference/cheatsheet.md');
  });
  it('tools run one at a time: a second call waits for the first (a run in progress is not replaced under an agent)', async () => {
    const { api } = fakeApi();
    const order: string[] = [];
    api.run = async () => { order.push('run start'); await new Promise((r) => setTimeout(r, 30)); order.push('run end'); return { ready: true, logs: [] } as any; };
    api.call = async () => { order.push('call'); return { frames: 1, problems: [], review: [], fonts: {}, audio: null, at: [], logs: [] } as any; };
    const fake = { defs: [] as any[], registerTool: async (def: any) => { fake.defs.push(def); } };
    const r = await mcp.registerTools(api, fake);
    expect(r.count).toBe(10);
    const run = fake.defs.find((d: any) => d.name === 'run'), check = fake.defs.find((d: any) => d.name === 'check');
    await Promise.all([run.execute({}), check.execute({})]);
    expect(order).toEqual(['run start', 'run end', 'call']);
  });
  it('look and onion return the picture as image content (base64 only) plus the moments as text', async () => {
    const { api } = fakeApi();
    api.call = async (cmd: string) => (cmd === 'look' ? { image: 'data:image/png;base64,QUJD', at: [{ label: '3.00s', frame: 90 }] } : { image: 'data:image/png;base64,REVG' }) as any;
    const tools = mcp.defineTools(api);
    const look = await tools.find((x: any) => x.name === 'look').execute({ at: '3' });
    expect(look.content.find((c: any) => c.type === 'image')).toEqual({ type: 'image', data: 'QUJD', mimeType: 'image/png' });
    expect(JSON.parse(look.content.find((c: any) => c.type === 'text').text).at[0].frame).toBe(90);
    const onion = await tools.find((x: any) => x.name === 'onion').execute({ from: 0, to: 2 });
    expect(onion.content.find((c: any) => c.type === 'image').data).toBe('REVG');
  });
  it('check returns the review without the sound curve (windows, cues stay out of an agent\'s context)', async () => {
    const { api } = fakeApi();
    api.call = async () => ({ frames: 30, problems: [], review: [], fonts: { missing: [], failed: [], failedUnused: [] }, at: [], logs: ['warn: x'], audio: { peakDb: -3, issues: ['limited'], notes: [], loudness: { integratedLufs: -16 }, scenes: [], sources: [], windows: new Array(500).fill({ t: 0 }), cues: [{ t: 1, name: 'a' }], duration: 6, sampleRate: 44100, peakAt: 1 } }) as any;
    const r = await mcp.defineTools(api).find((x: any) => x.name === 'check').execute({});
    const body = JSON.parse(r.content[0].text);
    expect(body.logs).toEqual(['warn: x']);
    expect(body.audio.issues).toEqual(['limited']);
    expect(body.audio.windows).toBeUndefined();
    expect(body.audio.cues).toBeUndefined();
  });
  it('a command the page refuses (nothing running, unknown moment) comes back as an error result with its words', async () => {
    const { api } = fakeApi();
    api.call = async () => { throw new Error('nothing is running: press Run'); };
    const r = await mcp.defineTools(api).find((x: any) => x.name === 'check').execute({});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/check: .*nothing is running/);
  });
  it('arguments must be an object with known fields of the right type', async () => {
    const tools = mcp.defineTools(fakeApi().api);
    const run = (n: string, a: any) => tools.find((x: any) => x.name === n).execute(a);
    expect((await run('check', [1])).isError).toBe(true);
    expect((await run('check', { at: 3 })).content[0].text).toMatch(/at must be a string/);
    expect((await run('check', { nope: 1 })).content[0].text).toMatch(/unknown argument "nope"/);
    expect((await run('look', { count: 'many' })).content[0].text).toMatch(/count must be a number/);
    expect((await run('set_code', {})).content[0].text).toMatch(/code is required/);
    expect((await run('load_example', { id: 'zzz' })).content[0].text).toMatch(/no example "zzz"/);
  });
  it('registerTools: a modelContext that is missing registers nothing; a failure to register reaches the caller', async () => {
    const { api } = fakeApi();
    expect((await mcp.registerTools(api, undefined)).count).toBe(0);
    expect((await mcp.registerTools(api, {})).count).toBe(0);
    await expect(mcp.registerTools(api, { registerTool: async () => { throw new Error('Duplicate tool name'); } })).rejects.toThrow(/Duplicate tool name/);
  });
  it('registerTools passes an abort signal that removes the tools again', async () => {
    const { api } = fakeApi();
    let signal: AbortSignal | undefined;
    const r = await mcp.registerTools(api, { registerTool: async (_d: any, o: any) => { signal = o.signal; } });
    expect(signal!.aborted).toBe(false);
    r.abort();
    expect(signal!.aborted).toBe(true);
  });
});
