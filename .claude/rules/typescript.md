# TypeScript rules

- Every function has an explicit return type.
- No `any`; use `unknown` and narrow, or define a proper type.
- Prefer `type` imports (`import type`) for type-only imports.
- Handle errors explicitly; do not swallow exceptions.
