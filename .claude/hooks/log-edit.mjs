#!/usr/bin/env node
// PostToolUse hook: logs which files the LLM edited, for the daily reviewer.
// Logs metadata only (no file contents) to stay NDA-safe.
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const project = basename(input.cwd || process.env.CLAUDE_PROJECT_DIR || 'unknown');
    const day = new Date().toISOString().slice(0, 10);
    const dir = join(process.env.KIT_LOG_DIR || join(homedir(), '.my-kit', 'logs'), project);
    mkdirSync(dir, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      session: input.session_id,
      cwd: input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? null,
      tool: input.tool_name,
      file: input.tool_input?.file_path ?? null,
    };
    appendFileSync(join(dir, `${day}.jsonl`), JSON.stringify(entry) + '\n');
  } catch {
    // never block the agent because of logging
  }
  process.exit(0);
});
