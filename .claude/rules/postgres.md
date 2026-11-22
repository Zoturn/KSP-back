# PostgreSQL rules

- Schema changes go through migrations only; never edit the database by hand.
- Use parameterized queries; never build SQL with string concatenation.
- Add indexes for new foreign keys and frequently filtered columns.
- Migrations must be safe to run on a live database (no long locks).
