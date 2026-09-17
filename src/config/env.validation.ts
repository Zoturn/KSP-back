import * as Joi from 'joi';

/**
 * Validates every environment variable this application actually reads, BEFORE the app
 * boots. Passed to `ConfigModule.forRoot({ validationSchema })` in `app.module.ts`.
 *
 * WHY THIS EXISTS (the concept, not just the code)
 * -------------------------------------------------
 * Without this, a missing or malformed `.env` value fails silently at first use — e.g.
 * `POSTGRES_PORT` becomes `undefined`, gets interpolated into a TypeORM connection string,
 * and you get a confusing connection error deep inside a resolver minutes later. With this
 * schema, the SAME mistake fails at boot, in one place, with a message naming exactly which
 * variable is wrong. That's the entire point of a config validation layer: turn "fails
 * eventually, badly" into "fails immediately, clearly".
 *
 * Only variables this NestJS process reads are listed here. `PGADMIN_DEFAULT_EMAIL`,
 * `PGADMIN_DEFAULT_PASSWORD`, `PGADMIN_PORT` also live in `.env`, but they're consumed
 * directly by docker-compose.yml's `${VAR}` interpolation for the pgAdmin *container* —
 * this process never reads them, so validating them here would be meaningless.
 *
 * JWT_* variables are required even though nothing uses them until Phase 5 (auth). This is
 * deliberate: it means the schema doesn't need revisiting when auth lands, and a missing
 * secret is caught now, at the cheapest possible point, rather than the first time someone
 * tries to log in.
 */
export const envValidationSchema = Joi.object({
  // ---- Application ---------------------------------------------------------------------
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  PORT: Joi.number().port().required(),

  // ---- PostgreSQL -------------------------------------------------------------------------
  // (Docker Compose publishes the container's port onto the host — see LEARNING/00-docker.md)
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().port().required(),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DB: Joi.string().required(),

  // ---- JWT (Phase 5) ------------------------------------------------------------------------
  // min(32) is a floor against an obviously-too-weak secret, not a cryptographic guarantee —
  // .env.example's generator produces a 96-character hex string, far above this.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().required(),
  // .invalid(Joi.ref(...)) enforces the rule .env.example only states as a comment: the two
  // secrets must differ. Reusing one secret for both tokens would mean a leaked access token
  // and a leaked refresh token are interchangeable — defeating the reason two tokens exist.
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .required()
    .messages({
      'any.invalid':
        'JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET',
    }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().required(),
})
  // Allows unrelated environment variables (PGADMIN_*, PATH, CI-injected vars, ...) to pass
  // through untouched. Without this, ANY variable not listed above would fail validation —
  // this schema whitelists what we check, not what may exist in the process environment.
  .unknown(true);
