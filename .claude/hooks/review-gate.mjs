#!/usr/bin/env node
// Review gate for commits made by Claude (PreToolUse on Bash).
// Before `git commit` it runs the project's code-reviewer (.claude/agents/code-reviewer.md) on the changes, headless and read-only,
// and BLOCKS the commit when it reports a high severity issue (medium too with KIT_REVIEW_BLOCK=medium).
// Claude then fixes the issues (the `simplify` skill helps with reuse/quality findings) and commits again: a changed tree is reviewed again.
// A wrong finding can be accepted with review-override.mjs and a reason. Code-free commits (docs, specs, images, lockfiles) are not reviewed.
// Off: KIT_REVIEW=off. If the reviewer fails or times out the commit is allowed (and logged): the hook never blocks on its own errors.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DOC, changeSet, parseCommit } from './_git.mjs';

const BLOCK_ON = (process.env.KIT_REVIEW_BLOCK || 'high').toLowerCase();
const claudeCmd = process.env.KIT_CLAUDE_CMD || 'claude';
const MAX_DIFF = 60000;
const here = dirname(fileURLToPath(import.meta.url));
const overrideScript = join(here, 'review-override.mjs');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    if (process.env.KIT_REVIEW === 'off' || process.env.KIT_IN_REVIEW) process.exit(0);
    run(JSON.parse(raw || '{}'));
  } catch {
    process.exit(0);
  }
});

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

function log(top, entry) {
  try {
    const dir = join(process.env.KIT_LOG_DIR || join(homedir(), '.my-kit', 'logs'), basename(top));
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'review-gate.jsonl'), JSON.stringify({ ts: new Date().toISOString(), repo: top, ...entry }) + '\n');
  } catch { /* best effort */ }
}

function block(text) {
  console.error(
    [
      'my-kit review gate: the code reviewer found problems in the changes you are about to commit. The commit is blocked.',
      '',
      text,
      '',
      'Fix the issues (the `simplify` skill helps with reuse and quality findings), stage the fixes and commit again: the new state is reviewed again.',
      `If a finding is wrong, record why and commit again: node "${overrideScript}" "<reason>"`,
    ].join('\n'),
  );
  process.exit(2);
}

// New untracked files are not in the diff: include their text (small text files only), name the rest.
function newFilesBlock(top, list) {
  const parts = [];
  const skipped = [];
  let budget = 30000;
  for (const f of list) {
    try {
      const text = readFileSync(join(top, f), 'utf8');
      if (text.includes('\0') || text.length > budget) { skipped.push(f); continue; }
      budget -= text.length;
      parts.push(`--- NEW FILE: ${f} ---\n${text}`);
    } catch { skipped.push(f); }
  }
  if (skipped.length) parts.push(`New files not shown (binary or large, read them if relevant): ${skipped.join(', ')}`);
  return parts.join('\n');
}

function agentInstructions(dirs) {
  for (const d of dirs) {
    const f = join(d, '.claude', 'agents', 'code-reviewer.md');
    if (existsSync(f)) return readFileSync(f, 'utf8').replace(/^---[\s\S]*?---\s*/, '').trim();
  }
  return 'You are a strict code reviewer. Check the changes against the project rules (CLAUDE.md, .claude/rules/): bugs, security, rule violations, invented APIs, weak tests, unrequested changes, duplicated components.';
}

function run(input) {
  const command = input.tool_input?.command;
  if (input.tool_name !== 'Bash' || !command) process.exit(0);
  const projectDir = input.cwd || process.cwd();
  const info = parseCommit(command, projectDir);
  if (!info) process.exit(0);

  const cs = changeSet(info.dir, info.all || info.adds ? 'all' : 'cached');
  if (!cs || !cs.files.length || cs.files.every((f) => DOC.test(f.replace(/\\/g, '/')))) process.exit(0);

  const myDir = join(cs.gitDir, 'my-kit');
  const override = readJson(join(myDir, 'review-override.json'));
  if (override?.hashes?.includes(cs.hash)) process.exit(0);
  const cache = readJson(join(myDir, 'review.json'));
  if (cache?.hash === cs.hash) {
    if (cache.verdict === 'fail') block(cache.text);
    process.exit(0);
  }

  const diff = cs.diff.length > MAX_DIFF ? cs.diff.slice(0, MAX_DIFF) + '\n[diff truncated]' : cs.diff;
  const prompt = `${agentInstructions([projectDir, cs.top])}

Review the changes below, which are about to be committed. Read CLAUDE.md and .claude/rules/ first.
Report only real problems, most severe first, each with file:line, what is wrong and a concrete fix. Do not invent issues. Be brief.
high = bugs, security issues, broken behavior, data loss, invented APIs. medium = rule violations, missing tests for changed behavior, notable duplication. low = style and minor points.
If nothing is wrong, say "No issues found."
Finish with exactly one last line: SEVERITY: high=<n> medium=<n> low=<n>

--- CHANGES ---
${diff}
${newFilesBlock(cs.top, cs.untracked)}`;

  const r = spawnSync(claudeCmd, ['-p', '--allowedTools', 'Read,Grep,Glob'], {
    cwd: projectDir,
    input: prompt,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 100000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, KIT_IN_REVIEW: '1' },
  });
  const out = (r.stdout || '').trim();
  const sev = /^SEVERITY:\s*high=(\d+)\s+medium=(\d+)\s+low=(\d+)\s*$/im.exec(out);
  if (r.status !== 0 || !sev) {
    log(cs.top, { verdict: 'error', note: r.error?.message || `exit ${r.status}, no severity line` });
    process.exit(0); // fail open
  }

  const counts = { high: +sev[1], medium: +sev[2], low: +sev[3] };
  const text = out.replace(/^SEVERITY:.*$/gim, '').trim();
  const fail = counts.high > 0 || (BLOCK_ON === 'medium' && counts.medium > 0);
  mkdirSync(myDir, { recursive: true });
  writeFileSync(join(myDir, 'review.json'), JSON.stringify({ hash: cs.hash, verdict: fail ? 'fail' : 'pass', text, counts, ts: Date.now() }));
  log(cs.top, { verdict: fail ? 'blocked' : 'pass', counts });
  if (fail) block(text);
  process.exit(0);
}
