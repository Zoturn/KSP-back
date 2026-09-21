import type { INestApplication } from '@nestjs/common';

/**
 * Every piece of app-wide configuration applied to the Nest application instance after it is
 * created but before it listens.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT JUST INLINE IN `main.ts`
 * -------------------------------------------------------------
 * `testing.md` requires that e2e tests "apply the same global pipes/filters/interceptors as
 * `main.ts` — otherwise error codes differ and the tests lie." An e2e spec builds its own app
 * with `moduleFixture.createNestApplication()`, which runs the module graph but NOT
 * `bootstrap()`. So anything configured only inside `bootstrap()` silently does not exist in
 * tests.
 *
 * That is not a hypothetical. `setGlobalPrefix('api')` below is the live example: without this
 * shared function, `test/health.e2e-spec.ts` would have to hit `/health` to pass, while the
 * real server serves `/api/health` — a green test proving nothing about the deployed route.
 * A test that passes against a path production doesn't serve is worse than no test.
 *
 * So `main.ts` and every e2e spec both call this one function — in practice via
 * `test/create-test-app.ts`, which is the only supported way a spec builds an app, so the
 * call cannot be forgotten.
 *
 * WHAT DOES *NOT* BELONG HERE
 * -----------------------------
 * Phase 5's global `ValidationPipe` and GraphQL exception filter. `nestjs.md` is explicit
 * that app-wide providers are registered in `AppModule` through the `APP_PIPE`/`APP_FILTER`
 * DI tokens rather than `app.useGlobal*()` — and that is the stronger option here for the
 * very reason this file exists: providers are part of the module graph, so
 * `createNestApplication()` applies them with no call for anyone to remember. Deliberately
 * leaving this function holding only `setGlobalPrefix`, which genuinely cannot be a
 * provider, keeps the forgettable surface as small as it can be.
 *
 * Generic in `T` so callers keep their concrete application type (`INestApplication<App>`
 * in Supertest specs) instead of each one re-asserting it with `as`.
 */
export function configureApp<T extends INestApplication>(app: T): T {
  // Prefixes the REST routes (`/api/health`, and `/api/uploads/*` later) without touching
  // `/graphql`. @nestjs/graphql registers its route through the Apollo driver rather than
  // Nest's HTTP router, so `setGlobalPrefix` does not move it — it stays at `/graphql`,
  // which is what we want (GraphQL is never versioned or prefixed; see graphql.md).
  //
  // Verified empirically rather than assumed, which is why there is no `exclude` option
  // here despite tasks.md 5.1 originally calling for one: with this prefix active,
  // `POST /graphql` answers 200 while `POST /api/graphql` returns 404.
  app.setGlobalPrefix('api');

  return app;
}
