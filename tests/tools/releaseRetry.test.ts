// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The release check runs every test at once, which loads the machine (load average 150-230): a real-browser test that takes 4 s alone can take 60 s
// and time out, a different one each run. It now runs the files that failed once more, alone, and passes only if they all pass there; it says
// which files it ran again. A failure in many files, or a run that left no report, is not retried.
const root = resolve(__dirname, '../..');
const retry: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'scripts/release-retry.mjs')).href);

const file = (name: string, status: 'passed' | 'failed') => ({ name: join(root, name), status });
const report = (...files: ReturnType<typeof file>[]) => ({ testResults: files, numFailedTestSuites: files.filter((f) => f.status === 'failed').length });

describe('release check: which failed files are run again', () => {
  it('the files that failed, relative to the repository, in the order of the report', () => {
    const r = retry.retryPlan(report(file('tests/a.test.ts', 'passed'), file('tests/tools/grain.test.ts', 'failed'), file('tests/films/scene3d-pick.test.ts', 'failed')), root);
    expect(r).toEqual({ files: ['tests/tools/grain.test.ts', 'tests/films/scene3d-pick.test.ts'] });
  });

  it('more failed files than the limit is a real break, not load: no retry, and the reason says so', () => {
    const many = Array.from({ length: 9 }, (_, i) => file(`tests/f${i}.test.ts`, 'failed'));
    const r = retry.retryPlan(report(...many), root, { max: 8 });
    expect(r.files).toBeUndefined();
    expect(r.reason).toMatch(/9 files failed.*more than 8/);
  });

  it('no report, or a failed run with no failed file in it (a crash, a type error before the tests), is not retried', () => {
    expect(retry.retryPlan(null, root).reason).toMatch(/no test report/);
    expect(retry.retryPlan(report(file('tests/a.test.ts', 'passed')), root).reason).toMatch(/no failed file/);
  });
});
