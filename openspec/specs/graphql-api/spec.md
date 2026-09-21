# graphql-api Specification

## Purpose
Provides the single query surface for the whole application and publishes a machine-readable
contract that downstream clients — starting with `ksp-frontend` — generate typed code from.

## Requirements

### Requirement: Single GraphQL endpoint

The system SHALL expose exactly one endpoint that accepts GraphQL operations (queries and
mutations) over HTTP POST. No REST endpoints SHALL exist for application data; the only
non-GraphQL routes are infrastructure concerns (health, file upload) defined in other
capabilities.

#### Scenario: A query is accepted

- **WHEN** a client sends a well-formed GraphQL query to the endpoint
- **THEN** the system executes it and returns a response containing a `data` field

#### Scenario: Application-level failures are transport-successful

- **WHEN** a client sends a request whose document is valid against the schema, and the
  requested operation then fails at the application level (a resolver throws, a guard rejects)
- **THEN** the system responds with a successful HTTP status
- **AND** the failure is reported inside an `errors` field in the response body, not via the
  HTTP status code

#### Scenario: A document that fails parse or validation is rejected by the transport

- **WHEN** a client sends a document that is malformed, or that does not match the schema
  (an unknown field, a wrong argument type)
- **THEN** the system responds with an HTTP client-error status
- **AND** the reason is reported in an `errors` field with a machine-readable
  `extensions.code`

> **Corrected during task 6.3, against the running server rather than from memory.** This
> requirement originally read "Response is _always_ transport-successful" for any
> "syntactically valid" request. That is wrong: `{ fieldThatDoesNotExist }` is syntactically
> valid, fails _validation_, and returns **400** — not 200. The 200-with-`errors` rule holds
> only for the execution phase, which is where everything auth-related lands, so no test that
> depends on it changes. The same error was found and fixed in `graphql.md`, `testing.md` and
> `README.md`; this spec was the last copy still asserting it.

### Requirement: Schema is introspectable in development

The system SHALL allow a developer to explore the full GraphQL schema interactively while
running in a non-production environment.

#### Scenario: Developer opens the interactive explorer

- **WHEN** a developer navigates to the GraphQL endpoint in a browser while the service is
  running outside production
- **THEN** the system serves an interactive schema explorer

### Requirement: Schema is published as a versioned contract artifact

The system SHALL make its complete GraphQL schema available as a static, machine-readable file
that does not require the service to be running to obtain, so that other systems (including a
CI pipeline with no database access) can generate code against it.

#### Scenario: Schema file can be produced without a database

- **WHEN** the schema-generation process is run without a running PostgreSQL connection
- **THEN** it successfully produces a complete schema file

#### Scenario: Schema file reflects the actual running schema

- **WHEN** the schema file that ships with a given version of the service is compared against
  the schema the running service actually serves
- **THEN** the two are identical

### Requirement: A minimal query proves the schema is live

The system SHALL expose at least one trivial root query so a consumer can confirm the GraphQL
layer itself is operational, independent of any business capability.

#### Scenario: Smoke-test query succeeds

- **WHEN** a client queries the minimal smoke-test field
- **THEN** the system returns a successful, well-formed response
