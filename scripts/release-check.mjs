#!/usr/bin/env node
/**
 * The release gate, run once.
 *
 *   npm run release:check   build the docs, type-check, build, run EVERY test (browser tests too), and, only if all pass, write a
 *                           stamp for the exact committed tree (.git/release-verified: never committed).
 *                           A release that changes only documents and the version pins (scripts/release-scope.mjs decides, against the last v* tag; anything
 *                           else, or any doubt, is a full run) leaves out the real-browser tests, about 4 minutes of the 5, and says so.
 *   npm run release:check -- --scope   only say what it would run, and why
 *   npm run release:check -- --full    run everything whatever the change
 *   prepublishOnly (--gate) `npm publish` calls this. If the stamp matches the tree being published (clean working tree, same
 *                           HEAD tree), the tests are NOT run a second time: only the build, which is quick. Otherwise it runs
 *                           everything, like release:check.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { scopeSince } from './release-scope.mjs';

const gate = process.argv.includes('--gate');
const scope = process.argv.includes('--full') ? { mode: 'full', base: null, reasons: ['--full was given'] } : scopeSince(process.cwd());
const testCommand = () => (scope.mode === 'docs-only' ? 'npm run test:fast' : 'npx vitest run');
const saySope = () => console.log(scope.mode === 'docs-only'
  ? `release scope: docs-only since ${scope.base}: only documents and version pins changed, so the real-browser tests are left out (unit and document tests run: ${testCommand()}).`
  : `release scope: full${scope.base ? ` since ${scope.base}` : ''}: every test runs (${testCommand()}).${scope.reasons.length ? `\n  ${scope.reasons.join('\n  ')}` : ''}`);
if (process.argv.includes('--scope')) { saySope(); process.exit(0); }
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const run = (cmd) => { console.log(`\n$ ${cmd}`); const r = spawnSync(cmd, { shell: true, stdio: 'inherit' }); if (r.status !== 0) { console.error(`\nrelease check failed at: ${cmd}`); process.exit(r.status || 1); } };

const stampFile = sh('git rev-parse --git-path release-verified');
const dirty = sh('git status --porcelain');                              // ignored files (dist/, node_modules/) are not listed
const tree = sh('git rev-parse HEAD^{tree}');

if (gate && !dirty && existsSync(stampFile)) {
  const stamp = JSON.parse(readFileSync(stampFile, 'utf8'));
  if (stamp.tree === tree) {
    console.log(`release gate: this exact tree (${tree.slice(0, 8)}) passed the ${stamp.mode === 'docs-only' ? 'docs-only' : 'full'} check at ${stamp.at}; the tests are not run again.`);
    run('npm run build');
    process.exit(0);
  }
}
if (gate) console.log(dirty ? 'release gate: uncommitted changes, running the full check.' : 'release gate: no passing check for this tree, running the full check.');

run('npm run build:ai');
run('npm run typecheck');
run('npm run build');
saySope();
run(testCommand());
const after = sh('git status --porcelain');
if (after) { console.error(`\nrelease check: the check changed tracked or new files (generated docs?). Commit them and run it again:\n${after}`); process.exit(1); }
writeFileSync(stampFile, JSON.stringify({ tree, at: new Date().toISOString(), mode: scope.mode, base: scope.base }));
console.log(`\nrelease check passed (${scope.mode === 'docs-only' ? 'docs-only: the real-browser tests were left out' : 'full'}) for tree ${tree.slice(0, 8)}; \`npm publish\` will not repeat the tests.`);
