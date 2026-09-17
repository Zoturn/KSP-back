import { envValidationSchema } from './env.validation';

/**
 * These tests validate the Joi SCHEMA directly — no NestJS module is booted. This is
 * deliberately the fastest possible unit test: a schema is a pure function of an object in,
 * a result out, so there's nothing to mock and nothing that touches a database or the
 * filesystem. See testing.md: "Test business logic and edge cases, not the framework."
 */
describe('envValidationSchema', () => {
  /** A complete, valid environment — every test mutates a copy of this. */
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5432',
    POSTGRES_USER: 'ksp_user',
    POSTGRES_PASSWORD: 'a-reasonably-long-password',
    POSTGRES_DB: 'ksp_ecommerce',
    JWT_ACCESS_SECRET: 'a'.repeat(64),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    JWT_REFRESH_EXPIRES_IN: '7d',
  };

  it('accepts a fully valid environment', () => {
    const { error } = envValidationSchema.validate(validEnv);
    expect(error).toBeUndefined();
  });

  it('throws when POSTGRES_PORT is missing', () => {
    const { POSTGRES_PORT: _omit, ...rest } = validEnv;
    const { error } = envValidationSchema.validate(rest);
    expect(error?.message).toContain('POSTGRES_PORT');
  });

  it('throws when POSTGRES_PORT is not numeric', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      POSTGRES_PORT: 'not-a-number',
    });
    expect(error?.message).toContain('POSTGRES_PORT');
  });

  it('throws when NODE_ENV is not one of the allowed values', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      NODE_ENV: 'staging', // not development | test | production
    });
    expect(error?.message).toContain('NODE_ENV');
  });

  it('throws when JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical', () => {
    const sameSecret = 'c'.repeat(64);
    const { error } = envValidationSchema.validate({
      ...validEnv,
      JWT_ACCESS_SECRET: sameSecret,
      JWT_REFRESH_SECRET: sameSecret,
    });
    expect(error?.message).toContain(
      'JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET',
    );
  });

  it('throws when a JWT secret is shorter than the minimum length', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      JWT_ACCESS_SECRET: 'too-short',
    });
    expect(error?.message).toContain('JWT_ACCESS_SECRET');
  });

  it('allows unrelated environment variables to pass through unvalidated', () => {
    // PGADMIN_* is real in .env but consumed only by docker-compose.yml, never by this
    // process — the schema must not reject it just because it's present in process.env.
    const { error } = envValidationSchema.validate({
      ...validEnv,
      PGADMIN_DEFAULT_EMAIL: 'admin@ksp.com',
      PATH: '/usr/bin',
    });
    expect(error).toBeUndefined();
  });
});
