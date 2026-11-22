#!/usr/bin/env node
// Blocks Claude attribution in commit messages, PR descriptions and PR/issue comments (PreToolUse on Bash).
// Settings (attribution = "") are not always honored by the model, so this checks the command itself.
// Also reads message files passed with -F / --file / --body-file. Off: KIT_ATTRIBUTION=allow.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PATTERNS = [
  /co-authored-by:\s*claude/i,
  /noreply@anthropic\.com/i,
  /generated\s+with\s+\[?\s*claude/i,
  /claude\.(ai|com)\/(code|claude-code)/i,
  /claude-session:/i,
];
const TARGET = /\bgit\b[^|;&]*\bcommit\b|\bgh\s+(pr|issue)\s+(create|edit|comment|review)\b|\bgh\s+api\b/;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    if (process.env.KIT_ATTRIBUTION === 'allow') process.exit(0);
    const input = JSON.parse(raw || '{}');
    const command = input.tool_input?.command;
    if (input.tool_name !== 'Bash' || !command || !TARGET.test(command)) process.exit(0);

    let text = command;
    for (const m of command.matchAll(/(?:\s-F|\s--file|\s--body-file|\s-b?F)[\s=]+("[^"]+"|'[^']+'|\S+)/g)) {
      try { text += '\n' + readFileSync(resolve(input.cwd || process.cwd(), m[1].replace(/^["']|["']$/g, '')), 'utf8'); } catch { /* file not readable */ }
    }
    if (PATTERNS.some((p) => p.test(text))) {
      console.error(
        'my-kit: remove the Claude attribution from this commit message / PR text / comment (Co-Authored-By: Claude, "Generated with Claude Code", claude.ai links, Claude-Session lines). Then run the command again.',
      );
      process.exit(2);
    }
  } catch {
    process.exit(0);
  }
  process.exit(0);
});
