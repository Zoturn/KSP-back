# Brainstorming and specs

- For requests that are not fully specified (new features, behavior changes), use the `brainstorming` skill first, then `spec-gate`.
- Do not invoke `superpowers:writing-plans` (it is not used here). After the design doc is approved, `spec-gate` decides whether an
  OpenSpec proposal is needed, and the approved design is its input.
- Save design docs to `docs/brainstorm/YYYY-MM-DD-<topic>-design.md`. If `.claude/kit.json` has `"personal": true`,
  do not commit them: add the path to `.git/info/exclude`.
- Ask before starting the visual companion. Its telemetry is switched off here (`SUPERPOWERS_DISABLE_TELEMETRY=1`).
