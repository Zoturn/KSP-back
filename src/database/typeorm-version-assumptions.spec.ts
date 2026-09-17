/**
 * Guards the assumption `test/mocks/typeorm-compat.stub.js` depends on.
 *
 * That stub hardcodes `{ Connection: undefined, AbstractRepository: undefined }` as a
 * faithful stand-in for `@nestjs/typeorm`'s real (genuinely ESM-native, unrunnable-under-
 * Jest — see nestjs.md's "Failure mode B") `typeorm-compat.js`. It's faithful only because
 * both symbols are confirmed removed in TypeORM 1.x. But `package.json` caret-ranges both
 * `typeorm` and `@nestjs/typeorm` — not an exact pin — so a routine `npm install` can move
 * them forward without anyone touching the stub.
 *
 * This test doesn't (can't) re-execute the real ESM file to check its actual behavior. What
 * it CAN do is pin down the specific assumption the mock relies on: that the installed
 * majors haven't moved past what was verified when the stub was written. If this ever fails,
 * that's not a bug in this test — it's a signal to re-check TypeORM's changelog for whether
 * `Connection`/`AbstractRepository` came back, and update (or delete) the stub accordingly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads an installed package's version directly off disk rather than via
 * `require('<pkg>/package.json')`. Both `typeorm` and `@nestjs/typeorm` declare a strict
 * `exports` map (checked directly: `typeorm`'s only lists `"."` and `"./browser"`), which
 * makes Node refuse to resolve a bare `require()` of their `package.json` — a real,
 * increasingly common gotcha for any package using `exports`. A raw filesystem read has no
 * such restriction; `exports` maps only govern `require`/`import` specifier resolution.
 */
function installedVersion(packageName: string): string {
  const packageJsonPath = join(
    __dirname,
    '..',
    '..',
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

describe('typeorm-compat stub assumptions', () => {
  it('typeorm is still on the 1.x line where Connection/AbstractRepository are removed', () => {
    expect(installedVersion('typeorm').startsWith('1.')).toBe(true);
  });

  it('@nestjs/typeorm is still on the 12.x line verified against typeorm 1.x', () => {
    expect(installedVersion('@nestjs/typeorm').startsWith('12.')).toBe(true);
  });
});
