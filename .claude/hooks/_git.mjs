// Shared git helpers for the kit hooks (this file lives next to the hooks in each project).
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const DOC = /\.(md|mdx|txt|png|jpe?g|gif|svg)$|^(openspec|docs)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

export const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
export const lines = (s) => (s || '').split('\n').filter(Boolean);

// Detects a `git commit` in a Bash command. Returns { dir, all, adds } or null.
export function parseCommit(command, cwd) {
  if (!/(^|[;&|(\s])git\s+(-C\s+("[^"]+"|\S+)\s+)?commit\b/.test(command) || /--dry-run/.test(command)) return null;
  const c = /git\s+-C\s+("[^"]+"|\S+)\s+commit/.exec(command);
  return {
    dir: c ? resolve(cwd, c[1].replace(/^"|"$/g, '')) : cwd,
    all: /\bcommit\b[^;&|]*(\s-[a-z]*a[a-z]*(\s|$)|\s--all\b)/.test(command),
    adds: /\bgit\s+(-C\s+("[^"]+"|\S+)\s+)?add\b/.test(command),
  };
}

// What is about to be committed. mode 'cached' = the index; 'all' = working tree vs HEAD plus untracked files.
export function changeSet(dir, mode) {
  const top = git(dir, ['rev-parse', '--show-toplevel']).stdout.trim();
  const gitDir = git(dir, ['rev-parse', '--absolute-git-dir']).stdout.trim();
  if (!top || !gitDir) return null;
  const base = git(top, ['rev-parse', '--verify', 'HEAD']).status === 0 ? 'HEAD' : EMPTY_TREE;
  const diffArgs = mode === 'all' ? ['diff', base] : ['diff', '--cached'];
  const diff = git(top, diffArgs).stdout;
  const untracked = mode === 'all' ? lines(git(top, ['ls-files', '-o', '--exclude-standard']).stdout).sort() : [];
  const files = [...new Set([...lines(git(top, [...diffArgs, '--name-only']).stdout), ...untracked])];
  const h = createHash('sha1').update(diff);
  for (const f of untracked) h.update(f).update(git(top, ['hash-object', '--', f]).stdout);
  return { top, gitDir, diff, untracked, files, hash: h.digest('hex'), mode };
}
