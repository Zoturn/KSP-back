#!/usr/bin/env node
/**
 * PostToolUse hook — Prettier check for ksp-backend.
 *
 * Self-contained on purpose: a subdirectory's .claude/settings.json is NOT layered on the
 * workspace-root one, so this repo must carry everything it needs. It also means this hook
 * fires when Claude is launched from ksp-backend/ — and it travels with the repo when cloned
 * on its own.
 *
 * Behaviour
 *   - Runs `prettier --check` on the file that was just written or edited.
 *   - Reports a failure back to Claude so it can fix the formatting.
 *   - Exits silently if Prettier is not installed yet (early phases) or the file type is
 *     not one Prettier handles.
 *
 * Contract: exit 0 and print JSON on stdout. We never exit 2 — formatting is reported,
 * never blocking.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Derive the repo root from THIS script's location (.claude/hooks/ -> repo root).
// More reliable than CLAUDE_PROJECT_DIR, which depends on where Claude was launched.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PRETTIER_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.css', '.scss', '.html', '.md', '.yml', '.yaml',
]);

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

const filePath = payload?.tool_input?.file_path;
if (!filePath) report(null);

const absolute = resolve(filePath);

// Only handle files belonging to THIS repo. Guards against acting on the sibling repo
// if both configs are ever active at once.
if (!absolute.startsWith(REPO_ROOT + sep)) report(null);

const ext = absolute.slice(absolute.lastIndexOf('.'));
if (!PRETTIER_EXTS.has(ext)) report(null);

// Not installed yet => no-op. Keeps early phases friction-free.
const bin = join(
  REPO_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
);
if (!existsSync(bin)) report(null);

const result = spawnSync(bin, ['--check', absolute], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (result.status === 0) report(null);

const detail = `${result.stdout || ''}${result.stderr || ''}`
  .trim()
  .split('\n')
  .slice(0, 5)
  .join('\n');

report(
  `Prettier check FAILED (ksp-backend) for ${absolute.split(sep).pop()}.\n${detail}\n` +
    `Fix with: npx prettier --write "${absolute}"`,
);
