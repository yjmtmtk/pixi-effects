import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from './browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
export const chrome: string | null = check.findChrome();

const NAME = `(r, g, b) => (r > 200 && g < 60 && b < 60 ? 'red' : g > 200 && r < 60 && b < 60 ? 'green' : b > 200 && r < 60 && g < 60 ? 'blue' : r > 200 && g > 200 && b < 80 ? 'yellow' : r > 200 && b > 200 && g < 80 ? 'magenta' : g > 200 && b > 200 && r < 80 ? 'cyan' : 'other(' + [r, g, b] + ')')`;

/**
 * What a real browser's <video> shows at these times of a file made of flat colours (the colors.* fixtures and cuts of them): the colour's name at the centre of the frame.
 * It is the check that a file is good for players, which a decoder in a test cannot give.
 */
export async function colorsAt(file: string, times: number[]): Promise<{ duration: number; frames: number; first: number | null; at: Record<string, string> }> {
  const { server, port } = await check.serve(dirname(resolve(file)));
  const dir = mkdtempSync(join(tmpdir(), 'video-colors-'));
  const { proc, cdp } = await launchPage(chrome!, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    await check.sleep(200);
    return await cdp.eval(`(async () => {
      const name = ${NAME};
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = '/' + encodeURIComponent(${JSON.stringify(basename(file))});
      await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('the browser cannot play this file')); });
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d', { willReadFrequently: true });
      // PLAY it and read the colour of every frame the browser presents (a seek on a paused video can leave the old picture on screen): { mediaTime, colour } per frame
      const frames = [];
      const done = new Promise(ok => { v.onended = ok; setTimeout(ok, 15000); });
      const tick = (now, meta) => { g.drawImage(v, 0, 0); const d = g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data; frames.push({ t: meta.mediaTime, colour: name(d[0], d[1], d[2]) }); v.requestVideoFrameCallback(tick); };
      v.requestVideoFrameCallback(tick);
      await v.play();
      await done;
      const at = {};
      for (const t of ${JSON.stringify(times)}) { let pick = null; for (const f of frames) if (f.t <= t + 0.05) pick = f; at[t] = pick ? pick.colour : 'no frame'; }       // before the first presented frame there is NO frame (a file that starts late must not pass for one that starts at 0)
      return { duration: v.duration, frames: frames.length, first: frames.length ? frames[0].t : null, at };
    })()`);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(100); rmSync(dir, { recursive: true, force: true }); }
}
