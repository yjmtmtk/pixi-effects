// npm run site: build the site exactly as GitHub Pages serves it (scripts/stage-site.mjs) into _site/ and serve it on http://127.0.0.1:8080/
// (or the port in PORT). The repository root alone is not enough: the guide is built, so only the staged copy has /guide/.
import { join } from 'node:path';
import { serve } from '../ai/tools/check.mjs';
import { ROOT, stageSite } from './stage-site.mjs';

const out = join(ROOT, '_site');
await stageSite(out);
const { port } = await serve(out, null, Number(process.env.PORT ?? 8080));
console.log(`site staged in _site/ and served on http://127.0.0.1:${port}/  (Ctrl+C to stop; run again to pick up changes)`);
