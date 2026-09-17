import { Query, Resolver } from '@nestjs/graphql';

/**
 * The application's smoke-test resolver — deliberately trivial, with no dependencies.
 *
 * Its job is to answer one question: "is the GraphQL layer itself up?", independently of any
 * business capability, database, or auth (see `specs/graphql-api/spec.md`, "A minimal query
 * proves the schema is live"). It is NOT a health check — that's `/api/health`, which is
 * deliberately REST because probes read HTTP status codes and GraphQL always returns 200.
 *
 * It also serves a structural purpose worth knowing about: **a GraphQL schema is invalid
 * without at least one root query.** With zero resolvers, code-first generation fails at boot
 * with `Query root type must be provided.` and never writes `schema.gql`. So until real
 * feature resolvers exist (Phase 4 onward), this one query is what makes the schema
 * generatable at all.
 */
@Resolver()
export class AppResolver {
  /**
   * `@Query(() => String)` — the explicit type thunk is mandatory in code-first, not
   * decoration. TypeScript's types are erased at runtime, so the decorator can't infer
   * whether `string` means GraphQL's `String`, an ID, or something else; the thunk is how
   * the schema builder is told. See `graphql.md`.
   *
   * Non-nullable (`String!`) in the emitted SDL because a static string genuinely cannot be
   * absent — unlike relation fields resolved by field resolvers, which `graphql.md` requires
   * to be nullable so one failure can't null an entire response.
   */
  @Query(() => String, {
    description:
      'Static smoke-test field confirming the GraphQL layer is operational.',
  })
  apiStatus(): string {
    return 'ok';
  }
}
