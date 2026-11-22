#!/usr/bin/env node
// Records that specs, docs, CLAUDE.md, AGENTS.md and comments were checked for the next commit.
// Usage: node docs-ack.mjs "<one line: what you checked and updated, or why nothing needed it>"
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const note = process.argv.slice(2).join(' ').trim();
if (note.length < 8) {
  console.error('Give a one-line note: what you checked and updated, or why nothing needed it.');
  process.exit(1);
}
const git = (args) => spawnSync('git', args, { encoding: 'utf8' });
const top = git(['rev-parse', '--show-toplevel']).stdout.trim();
const gitDir = git(['rev-parse', '--absolute-git-dir']).stdout.trim();
if (!top || !gitDir) {
  console.error('Not inside a git repository.');
  process.exit(1);
}
mkdirSync(join(gitDir, 'my-kit'), { recursive: true });
const head = git(['rev-parse', '--verify', 'HEAD']).stdout.trim();
writeFileSync(join(gitDir, 'my-kit', 'docs-ack.json'), JSON.stringify({ ts: Date.now(), note, repo: top, head }));

try {
  const dir = join(process.env.KIT_LOG_DIR || join(homedir(), '.my-kit', 'logs'), basename(top));
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'docs-checks.jsonl'), JSON.stringify({ ts: new Date().toISOString(), repo: top, note }) + '\n');
} catch { /* logging is best effort */ }

console.log('Docs check recorded. Run the commit again.');
