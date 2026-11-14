/**
 * Which failed test files the release check runs once more, alone (scripts/release-check.mjs).
 *
 * The full run starts every test at once and loads the machine (load average 150-230 measured): a real-browser test that takes 4 s alone has taken
 * 60 s there and timed out, a different file each run. A file that fails again alone is a real failure; one that passes alone is named in the
 * output and in the stamp. Many failed files are a real break (no retry); so is a failed run that names no failed file (a crash before the tests).
 */
import { relative } from 'node:path';

/** report: vitest's JSON report (or null). Returns { files } to run again, or { reason } not to. */
export function retryPlan(report, root, { max = 8 } = {}) {
  if (!report || !Array.isArray(report.testResults)) return { reason: 'no test report was written' };
  const files = report.testResults.filter((r) => r.status === 'failed').map((r) => relative(root, r.name));
  if (!files.length) return { reason: 'the run failed but no failed file is in the report' };
  if (files.length > max) return { reason: `${files.length} files failed, more than ${max}: that is a real break, not the load of the full run` };
  return { files };
}
