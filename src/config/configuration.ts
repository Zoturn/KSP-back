import { registerAs } from '@nestjs/config';

/**
 * `registerAs(namespace, factory)` is how `@nestjs/config` groups related environment
 * variables under one name instead of one flat bag of strings. Two things this buys:
 *
 * 1. **Namespacing.** Instead of `configService.get('POSTGRES_HOST')` scattered everywhere,
 *    a module asks for `configService.get('database.host')` — the shape it needs, grouped
 *    the way it will actually be consumed (`DatabaseModule` wants a `database` object, not
 *    five unrelated string lookups).
 * 2. **Type inference.** Each factory returns a plain object; TypeScript infers its shape,
 *    so `configService.get<DatabaseConfig>('database')` is checked at compile time instead
 *    of every caller re-typing (and risking a typo in) a raw env-var string key.
 *
 * `envValidationSchema` (env.validation.ts) has ALREADY run by the time any of these
 * factories execute — @nestjs/config validates first, then loads. So every `process.env`
 * read below is guaranteed present and well-formed; there is no need to re-check for
 * `undefined` or parse-failure here. That division of labour (validate once, up front;
 * shape freely, after) is the whole point of pairing the two files.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

export interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export const appConfig = registerAs('app', (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV as AppConfig['nodeEnv'],
  port: Number(process.env.PORT),
}));

export const databaseConfig = registerAs('database', (): DatabaseConfig => ({
  host: process.env.POSTGRES_HOST as string,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER as string,
  password: process.env.POSTGRES_PASSWORD as string,
  name: process.env.POSTGRES_DB as string,
}));

export const jwtConfig = registerAs('jwt', (): JwtConfig => ({
  accessSecret: process.env.JWT_ACCESS_SECRET as string,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN as string,
  refreshSecret: process.env.JWT_REFRESH_SECRET as string,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN as string,
}));
