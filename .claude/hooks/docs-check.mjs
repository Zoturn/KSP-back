#!/usr/bin/env node
// Docs gate for commits made by Claude (Bash tool).   Usage: docs-check.mjs pre | post   (hook input on stdin)
//  pre : blocks `git commit` when code is being committed and nobody has checked specs, docs, CLAUDE.md, AGENTS.md
//        and code comments since the last attempt. Claude must review them and run docs-ack.mjs with a one-line note.
//  post: after the commit, attaches that note to the commit as a local git note (refs/notes/kit-docs, never pushed by default).
// Disable with KIT_DOCS_CHECK=0. The hook never blocks because of its own errors.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC, EMPTY_TREE, git, lines, parseCommit } from './_git.mjs';
// Shared with review-gate.mjs and review-override.mjs. These were duplicated here
// verbatim and had already drifted — the local `git` copy lacked _git.mjs's 64MB
// maxBuffer, so a large diff would have truncated differently in the two gates.

const mode = process.argv[2];
const TTL_MS = 15 * 60 * 1000;
const ackScript = join(dirname(fileURLToPath(import.meta.url)), 'docs-ack.mjs');


let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    if (process.env.KIT_DOCS_CHECK === '0') process.exit(0);
    run(JSON.parse(raw || '{}'));
  } catch {
    process.exit(0);
  }
});

function run(input) {
  const command = input.tool_input?.command;
  if (input.tool_name !== 'Bash' || !command) process.exit(0);
  const info = parseCommit(command, input.cwd || process.cwd());
  if (!info) process.exit(0);

  const top = git(info.dir, ['rev-parse', '--show-toplevel']).stdout.trim();
  const gitDir = git(info.dir, ['rev-parse', '--absolute-git-dir']).stdout.trim();
  if (!top || !gitDir) process.exit(0);
  const ackFile = join(gitDir, 'my-kit', 'docs-ack.json');
  const ack = existsSync(ackFile) ? JSON.parse(readFileSync(ackFile, 'utf8')) : null;

  if (mode === 'post') return post(top, ackFile, ack);

  // pre
  if (ack && Date.now() - ack.ts < TTL_MS) process.exit(0);

  const hasHead = git(top, ['rev-parse', '--verify', 'HEAD']).status === 0;
  let files = lines(git(top, ['diff', '--cached', '--name-only']).stdout);
  if (info.all || info.adds) files.push(...lines(git(top, ['diff', hasHead ? 'HEAD' : EMPTY_TREE, '--name-only']).stdout));
  if (info.adds) files.push(...lines(git(top, ['ls-files', '-o', '--exclude-standard']).stdout));
  files = [...new Set(files)];
  if (!files.length || files.every((f) => DOC.test(f.replace(/\\/g, '/')))) process.exit(0);

  const project = resolve(input.cwd || info.dir);
  const found = new Set();
  for (const base of new Set([top, project, info.dir])) {
    for (const n of ['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs', 'openspec']) {
      if (existsSync(join(base, n))) found.add(relative(top, join(base, n)).replace(/\\/g, '/') || n);
    }
  }
  const changesDir = join(top, 'openspec', 'changes');
  const active = existsSync(changesDir) ? readdirSync(changesDir).filter((n) => n !== 'archive' && !n.startsWith('.')) : [];

  console.error(
    [
      'my-kit docs check: this commit changes code. Before committing, check whether it needs updates in:',
      ...[...found].map((f) => `  - ${f}`),
      active.length ? `Active OpenSpec changes: ${active.join(', ')}` : null,
      '',
      'Go through: specs (do they match the new behavior? update the change or archive it), docs and README (setup, API, behavior),',
      'CLAUDE.md and AGENTS.md (commands, structure, conventions), and code comments that are now wrong.',
      'Update what is needed and `git add` it. Then run:',
      `  node "${ackScript}" "<one line: what you checked and updated, or why nothing needed it>"`,
      'and run the commit again. The note is attached to the commit as a local git note.',
    ].filter((l) => l !== null).join('\n'),
  );
  process.exit(2);
}

function post(top, ackFile, ack) {
  if (!ack) process.exit(0);
  const head = git(top, ['rev-parse', '--verify', 'HEAD']).stdout.trim();
  if (!head || head === ack.head) process.exit(0); // no new commit yet: the commit did not happen, keep the ack
  git(top, ['notes', '--ref=kit-docs', 'add', '-f', '-m', `Docs check: ${ack.note}`, 'HEAD']);
  rmSync(ackFile, { force: true });
  process.exit(0);
}
