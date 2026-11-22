#!/usr/bin/env node
// Accepts the current changes despite the review gate's findings. Requires a reason; it is logged and shown in the daily summary.
// Usage: node review-override.mjs "<why the finding is wrong or acceptable>"
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { changeSet } from './_git.mjs';

const reason = process.argv.slice(2).join(' ').trim();
if (reason.length < 8) {
  console.error('Give a reason: why is the finding wrong or acceptable?');
  process.exit(1);
}
const cached = changeSet(process.cwd(), 'cached');
const all = changeSet(process.cwd(), 'all');
if (!cached || !all) {
  console.error('Not inside a git repository.');
  process.exit(1);
}
mkdirSync(join(all.gitDir, 'my-kit'), { recursive: true });
writeFileSync(join(all.gitDir, 'my-kit', 'review-override.json'), JSON.stringify({ hashes: [cached.hash, all.hash], reason, ts: Date.now() }));
try {
  const dir = join(process.env.KIT_LOG_DIR || join(homedir(), '.my-kit', 'logs'), basename(all.top));
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'review-gate.jsonl'), JSON.stringify({ ts: new Date().toISOString(), repo: all.top, verdict: 'override', note: reason }) + '\n');
} catch { /* best effort */ }
console.log('Override recorded for the current changes. Run the commit again.');
