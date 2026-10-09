// node summary.mjs results/q1-default.json ...  (prints worst, failing rows and distinct warnings)
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  console.log(f, JSON.stringify(j.backends), 'worst', j.worst, 'failing', JSON.stringify(j.failing), 'warned', JSON.stringify([...new Set((j.warned ?? []).flatMap(w => w.logs))]));
}
