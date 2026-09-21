import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Max, Min } from 'class-validator';

/** Page size used when a client does not ask for one. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Hard ceiling on page size.
 *
 * This is a security control, not a tuning constant. GraphQL lets the client choose how much
 * work the server does, so an unbounded `limit` is a denial-of-service vector — see
 * `graphql.md`. It is also what makes the spec's "page size is bounded" scenario an input
 * validation failure rather than a query that quietly tries to serve a million rows.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Offset/limit paging input, shared by every list query in the API.
 *
 * Relay cursor connections are deliberately not used (`graphql.md`): they teach Relay's
 * conventions rather than GraphQL, and this project is a learning vehicle. The trade-off is
 * that deep offsets degrade — Postgres still scans and discards the skipped rows — which
 * `MAX_PAGE_SIZE` plus a catalogue of realistic size keeps well inside acceptable.
 *
 * `page` is 1-based because it is a user-facing concept ("page 1" is the first page). The
 * conversion to a zero-based SQL `OFFSET` happens once, in the service.
 */
@InputType()
export class PageInput {
  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  page: number = 1;

  @Field(() => Int, { defaultValue: DEFAULT_PAGE_SIZE })
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}
