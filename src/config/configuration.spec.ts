import { appConfig, databaseConfig, jwtConfig } from './configuration';

/**
 * `registerAs(namespace, factory)` returns a `ConfigFactory` — calling it directly (e.g.
 * `appConfig()`) invokes the underlying factory function and returns its plain object,
 * exactly as `ConfigService.get('app')` would once wired into a running app. That's what
 * makes this testable with zero NestJS bootstrapping: no `Test.createTestingModule`, no
 * mocked providers — just a function call against a known `process.env`.
 */
describe('configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Fresh copy each test so mutations below never leak between tests.
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('appConfig', () => {
    it('returns the expected shape given a known process.env', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '4000';

      expect(appConfig()).toEqual({ nodeEnv: 'production', port: 4000 });
    });
  });

  describe('databaseConfig', () => {
    it('returns the expected shape given a known process.env', () => {
      process.env.POSTGRES_HOST = 'db.internal';
      process.env.POSTGRES_PORT = '5433';
      process.env.POSTGRES_USER = 'app_user';
      process.env.POSTGRES_PASSWORD = 'secret';
      process.env.POSTGRES_DB = 'app_db';

      expect(databaseConfig()).toEqual({
        host: 'db.internal',
        port: 5433,
        user: 'app_user',
        password: 'secret',
        name: 'app_db',
      });
    });
  });

  describe('jwtConfig', () => {
    it('returns the expected shape given a known process.env', () => {
      process.env.JWT_ACCESS_SECRET = 'access-secret';
      process.env.JWT_ACCESS_EXPIRES_IN = '15m';
      process.env.JWT_REFRESH_SECRET = 'refresh-secret';
      process.env.JWT_REFRESH_EXPIRES_IN = '7d';

      expect(jwtConfig()).toEqual({
        accessSecret: 'access-secret',
        accessExpiresIn: '15m',
        refreshSecret: 'refresh-secret',
        refreshExpiresIn: '7d',
      });
    });
  });
});
