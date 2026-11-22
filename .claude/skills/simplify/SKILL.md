---
name: simplify
description: Review the code you just changed for reuse, quality and efficiency, then fix what you find without changing behavior. Use after finishing a task and before committing, or when asked to simplify, clean up or tidy changes.
---

Improve the changed code. Do not hunt for correctness bugs (the commit review does that) and do not change behavior.

## 1. Scope
Take the changes of this task: `git diff HEAD` (plus new untracked files). If the user named files or a focus, limit to that.
Do not touch code the task did not change, except to reuse it.

## 2. Look for
- **Reuse:** an existing helper, component, hook, type or constant that does the same thing; the same logic written twice in the change.
- **Quality:** needless complexity, deep nesting, dead code, unclear names, comments that restate the code or are now wrong, missing explicit return types (project rule), `any`.
- **Efficiency:** repeated work in loops, N+1 queries, sequential awaits that can run together, unneeded re-renders, oversized dependencies.
Search the codebase before declaring something new: `Grep` for similar names and patterns.

## 3. Fix
Apply only changes that keep behavior identical and that you are confident about. One concern per edit. Leave judgment calls (API changes, bigger refactors) as a short list for the user.

## 4. Verify
Run the project's type-check, lint and the related tests. If anything fails because of your cleanup, undo that cleanup.

## 5. Report
Two to five lines: what you fixed, what you left and why, and the test result. If the code was already clean, say so.
