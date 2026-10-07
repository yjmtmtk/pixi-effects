#!/usr/bin/env node
/**
 * The release gate, run once.
 *
 *   npm run release:check   build the docs, type-check, build, run EVERY test (browser tests too), and, only if all pass, write a
 *                           stamp for the exact committed tree (.git/release-verified: never committed).
 *   prepublishOnly (--gate) `npm publish` calls this. If the stamp matches the tree being published (clean working tree, same
 *                           HEAD tree), the tests are NOT run a second time: only the build, which is quick. Otherwise it runs
 *                           everything, like release:check.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const gate = process.argv.includes('--gate');
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const run = (cmd) => { console.log(`\n$ ${cmd}`); const r = spawnSync(cmd, { shell: true, stdio: 'inherit' }); if (r.status !== 0) { console.error(`\nrelease check failed at: ${cmd}`); process.exit(r.status || 1); } };

const stampFile = sh('git rev-parse --git-path release-verified');
const dirty = sh('git status --porcelain');                              // ignored files (dist/, node_modules/) are not listed
const tree = sh('git rev-parse HEAD^{tree}');

if (gate && !dirty && existsSync(stampFile)) {
  const stamp = JSON.parse(readFileSync(stampFile, 'utf8'));
  if (stamp.tree === tree) {
    console.log(`release gate: this exact tree (${tree.slice(0, 8)}) passed the full check at ${stamp.at}; the tests are not run again.`);
    run('npm run build');
    process.exit(0);
  }
}
if (gate) console.log(dirty ? 'release gate: uncommitted changes, running the full check.' : 'release gate: no passing check for this tree, running the full check.');

run('npm run build:ai');
run('npm run typecheck');
run('npm run build');
run('npx vitest run');
const after = sh('git status --porcelain');
if (after) { console.error(`\nrelease check: the check changed tracked or new files (generated docs?). Commit them and run it again:\n${after}`); process.exit(1); }
writeFileSync(stampFile, JSON.stringify({ tree, at: new Date().toISOString() }));
console.log(`\nrelease check passed for tree ${tree.slice(0, 8)}; \`npm publish\` will not repeat the tests.`);
