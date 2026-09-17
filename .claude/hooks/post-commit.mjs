#!/usr/bin/env node
/**
 * PostToolUse hook — fires after Claude runs `git commit` in ksp-backend.
 *
 * WHAT THIS DOES (and the important distinction)
 * ----------------------------------------------
 * Two different things happen here, by two different mechanisms:
 *
 *   1. TESTS ARE ACTUALLY RUN. This is a real Node process, so it can execute
 *      `npm test` directly and report the result.
 *
 *   2. SKILLS ARE REQUESTED, NOT RUN. `/simplify` and `/code-review` are Claude Code
 *      skills that exist only inside a Claude session — no shell script can invoke them.
 *      What this hook can do is return `additionalContext`, which Claude reads and acts
 *      on by invoking the Skill tool itself.
 *
 * Why matcher "Bash" and not an `if: "Bash(git commit:*)"` condition: the command match
 * is done here in the script instead, so the behaviour is explicit, testable in isolation,
 * and doesn't depend on permission-rule matching semantics.
 *
 * Contract: always exit 0. A failing test suite is REPORTED, never used to block — the
 * commit has already happened by the time this runs, so blocking would achieve nothing
 * except hiding the result.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_NAME = 'ksp-backend';

/** Emit context back to Claude and exit successfully. */
function report(message) {
  if (message) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: message,
        },
      }),
    );
  }
  process.exit(0);
}

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  report(null);
}

// ---- 1. Is this actually a git commit in this repo? ------------------------
const command = payload?.tool_input?.command ?? '';

// Match `git commit`, allowing for `git -C … commit`, chained `&&`, leading env vars, etc.
// Deliberately excludes --dry-run: nothing was committed, so there is nothing to review.
const isCommit = /\bgit\b[^\n&|;]*\bcommit\b/.test(command) && !/--dry-run/.test(command);
if (!isCommit) report(null);

// If the tool call itself failed (e.g. "nothing to commit"), there is no new commit.
const responseText = JSON.stringify(payload?.tool_response ?? '');
if (/nothing to commit|no changes added|Aborting commit/i.test(responseText)) report(null);

// ---- 2. What was actually committed? --------------------------------------
function git(args) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

const sha = git(['log', '-1', '--format=%h']);
const subject = git(['log', '-1', '--format=%s']);
if (!sha) report(null);

const changedFiles = (git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']) || '')
  .split('\n')
  .filter(Boolean);

// Only source changes warrant a review pass. A docs/spec/config-only commit doesn't.
const sourceFiles = changedFiles.filter((f) => /^src\/|^test\//.test(f));
const touchedSource = sourceFiles.length > 0;

// ---- 3. Run the tests (really run them) -----------------------------------
let testSummary = null;

if (touchedSource && existsSync(join(REPO_ROOT, 'package.json'))) {
  let hasTestScript = false;
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    hasTestScript = Boolean(pkg?.scripts?.test);
  } catch {
    hasTestScript = false;
  }

  if (hasTestScript) {
    const run = spawnSync('npm', ['test', '--silent'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 300_000, // 5 min ceiling so a hung watcher can never wedge the session
    });

    if (run.error?.code === 'ETIMEDOUT') {
      testSummary = 'TESTS TIMED OUT after 5 minutes — check for a watch-mode test script.';
    } else if (run.status === 0) {
      testSummary = 'Tests PASSED.';
    } else {
      // Jest writes its summary to stderr; keep the tail, which holds the failure counts.
      const output = `${run.stdout || ''}${run.stderr || ''}`.trim().split('\n');
      testSummary =
        `Tests FAILED (exit ${run.status}):\n` + output.slice(-25).join('\n');
    }
  }
}

// ---- 4. Ask Claude to run the review skills --------------------------------
if (!touchedSource) {
  // Docs/spec/config-only commit: nothing to simplify or review.
  report(null);
}

const lines = [
  `Commit ${sha} in ${REPO_NAME} touched ${sourceFiles.length} source file(s): ${subject}`,
];

if (testSummary) lines.push('', testSummary);

lines.push(
  '',
  'POST-COMMIT REVIEW — run all three now, in this order:',
  '  1. Skill: test-coverage-check       (are tests MISSING for what changed?)',
  '  2. Skill: simplify                  (reuse, simplification, efficiency cleanups)',
  '  3. Skill: code-review:code-review   (correctness bugs in the diff)',
  '',
  'Coverage goes first because this project\'s rule is that nothing is done without',
  'tests — a missing test is a bigger problem than an unsimplified line, and writing',
  'the test first means the other two passes review code that is actually covered.',
  '',
  'Then fix anything they surface and amend or follow up with a commit.',
  '',
  'SKIP ALL THREE if this commit was itself the result of applying /simplify output,',
  'review fixes, or added tests — otherwise this loops indefinitely. Also fix any',
  'failing tests above BEFORE running them, so they review working code.',
);

report(lines.join('\n'));
