---
name: test-coverage-check
description: Audit changed files in the working tree for unit-test coverage gaps. For each modified source file, determine whether a corresponding test file exists; if it does, decide whether the diff introduces behavior that needs new test cases; if it doesn't, decide whether the file warrants tests at all. Use this skill whenever the user asks "check tests for my changes", "do my changes need tests", "audit test coverage on this branch", "which files need tests", or anything similar — and proactively after finishing a feature or bug fix, before committing.
---

# Test Coverage Check

Audit the current branch's changed files for unit-test coverage gaps and report which files need new tests, which need test updates, which are already covered, and which can be safely skipped.

## When to use

- User asks to verify, audit, or check test coverage of recent or pending changes.
- User asks "do these changes need tests?" or "what's missing tests?".
- After completing a feature or bug fix, before the user commits.
- Before opening a PR that touches source files.

Do **not** use this skill for full-suite coverage analysis (`npm run test:coverage`). It is scoped to the diff, not the entire codebase.

## Workflow

### 1. Collect the change set

Run these in parallel:

```bash
git status --short
git diff --name-only
git diff --staged --name-only
```

Combine, dedupe, and drop deleted files (`D` status). Note renames (`R`) — treat the new path as the source.

### 2. Filter to source files

Exclude from the audit:
- Test files themselves (`*.test.*`, `*.spec.*`, anything under `__tests__/`)
- Lockfiles, build artifacts, `dist/`, `build/`, `coverage/`
- Static assets (images, audio, video, fonts, `*.svg`, `*.wav`, `*.mp3`, etc.)
- Config files (`*.config.{js,ts,mjs}`, `tsconfig*.json`, `.env*`, `.eslintrc*`, `.prettierrc*`)
- Documentation (`*.md`, `*.mdx`)
- Type-only files (`*.d.ts`)
- Pure barrel files (`index.ts` that only re-exports)

These appear under "Skipped" in the final report with a one-word reason.

### 3. Detect testing conventions

Read `CLAUDE.md`, `package.json`, and any `jest.config.*` / `vitest.config.*` to learn:
- Test framework (Jest / Vitest / Mocha / etc.)
- Test file naming (`*.test.tsx`, `*.spec.ts`)
- Test directory layout (sibling vs `__tests__/` vs mirrored `tests/`)
- Coverage target (e.g., 80%) and any project-specific rules

Align all suggestions with what the project actually uses. Do not invent a convention.

### 4. Locate the test for each source file

Use Glob with patterns like:
- `**/<basename>.{test,spec}.{ts,tsx,js,jsx}`
- `**/__tests__/<basename>.{test,spec}.{ts,tsx,js,jsx}`

Check sibling first, then nearest `__tests__/`, then a mirrored `tests/` tree.

### 5. Classify each file

For each source file, read it and read its diff (`git diff -- <file>`). Then assign one outcome:

**A. Has tests, diff needs new test cases**
The change introduces behavior the existing tests don't cover: a new branch, a new prop, a new error path, a renamed export, a new hook dependency, etc.
→ Report the file, the test path, and the specific cases to add.

**B. Has tests, diff already covered**
Refactor, rename, formatting, or behavior already exercised by current tests.
→ Note briefly. No action needed.

**C. No tests, file warrants them**
The file contains logic worth verifying: branching, state, effects, transforms, reducers, hooks, validators, API wrappers, components with conditionals or event handlers.
→ Report file, suggested test path (matching project convention), and key behaviors to cover.

**D. No tests, file does not warrant them**
Pure layout, trivial wiring, constants, theme tokens, type re-exports, glue.
→ Report briefly with the reason.

### 6. Output the report

Use this structure (omit empty sections):

```
NEEDS TEST UPDATES
  src/path/Foo.tsx → src/path/Foo.test.tsx
    Add: <one bullet per case>

NEEDS NEW TESTS
  src/path/Bar.tsx
    Suggested: src/path/Bar.test.tsx
    Cover:
      - <behavior>
      - <behavior>

COVERED (no action)
  src/path/Baz.tsx — refactor only, existing tests apply

SKIPPED
  public/*.wav — static assets
  src/types/*.ts — type-only
  src/theme.ts — style tokens (no logic)

Summary: <X> need new tests, <Y> need updates, <Z> covered, <W> skipped.
```

End with one explicit recommendation line: either "Ready to commit" (everything is covered or correctly skipped) or "Write tests for: <files>" (concrete next step).

## Heuristics

**Almost always warrants tests:**
- Reducers, action creators, context providers
- Custom hooks with state, effects, or derived values
- Pure helpers with branching, parsing, formatting, validation
- Components with conditionals, event handlers, derived state, async data
- API client wrappers, interceptors, transformers

**Usually does not warrant tests:**
- Pure presentational components (no logic, no conditional rendering)
- Layout wrappers, container components that only compose children
- Index/barrel re-exports
- Constants, enums, type definitions
- Theme/style/token objects
- Asset path constants
- Static config

When uncertain, recommend a test and let the user veto.

## Important guardrails

- **Do not write tests in this skill.** This is an audit. The user runs `/tdd` (or equivalent) to actually implement them.
- **Do not run `npm test` or coverage tooling.** This skill works from the diff, not from a full test run.
- **Stay scoped to the diff.** Don't lecture the user about untested files they didn't touch.
- **Match the project's framework.** If the repo uses Vitest, don't suggest Jest patterns, and vice versa.