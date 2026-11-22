---
name: spec-gate
description: Use at the start of ANY task that will change code in this project (feature, bug fix, refactor, change request), before writing code. Decides whether the task needs an OpenSpec spec/proposal or brings no logical change and can go straight to implementation.
---

Decide, before any code is written, whether this task needs a spec. "Logical change" means a change to WHAT the system does
(behavior, rules, contracts, data), not to HOW the code is written.

## 1. Look
- Read the task. If it is vague, ask one short question first.
- If the project has an `openspec/` folder (here or in the workspace root), run `openspec list` (and `openspec list --specs`) and read the specs and active changes related to the task.
- If there is no `openspec/` folder, still make the decision below. If a spec is needed, tell the user in one line and ask whether to run `openspec init`. Do not block small tasks.

## 2. Decide

**A spec IS needed** when the task:
- adds or removes a capability or user-visible behavior
- changes business rules, validation, permissions, roles or security behavior
- changes an API contract, event, message format or integration
- changes the data model, a migration or stored data meaning
- changes the architecture across modules, or is a breaking change
- sets a measurable non-functional target (performance, limits, SLA)
- fixes a bug where the correct behavior is unclear or not written down yet

**NO spec** when the task:
- fixes a typo, comment, docs, naming or formatting
- is a refactor with identical behavior (existing tests pass unchanged)
- bumps a dependency patch or minor version without behavior change
- adds tests only, or changes lint/build/dev config
- tweaks styling or copy with no logic change
- fixes a bug that restores behavior an existing spec or test already defines

When unsure, choose the spec. A wrong "no spec" costs more than a short proposal.

## 3. Act
State the verdict in two lines, for example:
`Spec needed: changes the permission rules for organisers.` or `No spec needed: renames a helper, behavior unchanged.`

- **No spec:** continue straight to implementation. Keep to the scope of the task.
- **Spec needed:** create the OpenSpec change proposal (proposal, tasks, spec deltas) following the OpenSpec instructions in this project,
  validate it, show a short summary, and WAIT for the user's approval before implementing. If a related active change exists, update it instead of opening a new one.

## 4. Re-check while working
If a "no spec" task turns out to change behavior, stop, say so, and switch to the spec path.
After implementing an approved change, follow the OpenSpec flow to archive or update the specs.
