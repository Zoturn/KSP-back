import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PageInput } from './page-input';

/**
 * Validates `PageInput` through `class-validator` directly, the same way the global
 * `ValidationPipe` will once Phase 5 registers it. Asserting the decorators are present would
 * prove nothing; running the validator proves the rules actually fire.
 */
function validate(input: Partial<PageInput>) {
  return validateSync(plainToInstance(PageInput, input));
}

describe('PageInput', () => {
  it('defaults to the first page at the default size', () => {
    const input = plainToInstance(PageInput, {});

    expect(input.page).toBe(1);
    expect(input.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('accepts a page size at the maximum', () => {
    expect(validate({ page: 1, limit: MAX_PAGE_SIZE })).toHaveLength(0);
  });

  it('rejects a page size above the maximum', () => {
    // The spec's "page size is bounded" scenario. This cap is a denial-of-service control:
    // GraphQL lets the caller choose how much work the server does, so without it a single
    // request can ask for every row in the table.
    const errors = validate({ page: 1, limit: MAX_PAGE_SIZE + 1 });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toHaveProperty('max');
  });

  it('rejects a non-positive page number', () => {
    // Page 0 would compute a negative SQL OFFSET.
    const errors = validate({ page: 0, limit: 10 });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
  });

  it('rejects a fractional page size', () => {
    const errors = validate({ page: 1, limit: 10.5 });

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });
});
