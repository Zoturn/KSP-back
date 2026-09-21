/**
 * A stand-in for TypeORM's `DataSource`, installed with
 * `.overrideProvider(getDataSourceToken()).useValue(...)` in a `Test.createTestingModule`.
 *
 * WHY A SPEC WOULD WANT THIS
 * ---------------------------
 * Overriding the token means `TypeOrmModule` never opens a real connection, so the spec boots
 * the entire application graph without Postgres running at all. Two distinct uses:
 *
 * - A spec that isn't *about* the database (routing, for one) shouldn't fail because Docker
 *   happens to be stopped. The default stub simply never gets queried.
 * - A spec that needs the database to look unreachable passes a rejecting `query`. That keeps
 *   the real `TypeOrmHealthIndicator`, the real `SELECT 1` dispatch and Terminus's real error
 *   mapping in play — only the socket is replaced, which is exactly what "unreachable" means.
 */
export interface StubDataSourceOptions {
  /** Replaces the query implementation — reject to simulate an unreachable server. */
  query?: jest.Mock;
}

export function createStubDataSource({ query }: StubDataSourceOptions = {}) {
  return {
    // Drives the `switch` in TypeOrmHealthIndicator.pingDb — 'postgres' takes the default
    // branch and calls `query('SELECT 1')`, the same path the real app uses.
    options: { type: 'postgres' },
    isInitialized: true,
    query: query ?? jest.fn().mockResolvedValue([{ '1': 1 }]),
    // TypeOrmCoreModule calls destroy() on shutdown; without it app.close() throws and masks
    // whatever the spec was actually asserting.
    destroy: jest.fn().mockResolvedValue(undefined),
  };
}
