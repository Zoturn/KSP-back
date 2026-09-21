import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CommonModule } from '../common.module';
import { DataLoaderService } from './dataloader.service';

/** A stand-in for a real consumer, e.g. the catalogue resolvers arriving in task 5.2. */
@Injectable()
class Consumer {
  constructor(public readonly loaders: DataLoaderService) {}
}

@Module({ imports: [CommonModule], providers: [Consumer] })
class ConsumerModule {}

/**
 * Pins the practical consequence of `Scope.REQUEST` before anything depends on it.
 *
 * This looks like a test of the framework rather than of our code, and in a sense it is — but
 * the behaviour it documents is the one that will produce the most confusing failure in this
 * project (`testing.md` says as much). Writing it here, against a provider with no logic yet,
 * means the asymmetry is recorded in a file whose whole subject is that asymmetry, rather than
 * discovered in a resolver spec where it looks like a bug in the resolver.
 *
 * It is also a genuine regression guard on OUR choice: delete `scope: Scope.REQUEST` and the
 * loaders silently become process-wide caches shared between users. Nothing else in the suite
 * would notice. This test fails immediately.
 */
describe('DataLoaderService', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
    }).compile();
  });

  it('cannot be retrieved with module.get() because it is request-scoped', () => {
    // Nest has no single instance to hand back — one exists per request, and outside a request
    // there is none. The thrown message is the one to recognise:
    // "DataLoaderService is marked as a scoped provider..."
    expect(() => moduleRef.get(DataLoaderService)).toThrow(/scoped provider/i);
  });

  it('is retrieved with await module.resolve()', async () => {
    const service = await moduleRef.resolve(DataLoaderService);

    expect(service).toBeInstanceOf(DataLoaderService);
  });

  it('gives a distinct instance per resolve, which is what isolates one request from another', async () => {
    const [first, second] = await Promise.all([
      moduleRef.resolve(DataLoaderService),
      moduleRef.resolve(DataLoaderService),
    ]);

    // Each resolve simulates a separate request context. Distinct instances mean distinct
    // loader caches — the property that stops one caller's rows reaching another.
    expect(first).not.toBe(second);
  });

  it('is exported, so a provider in another module can inject it', async () => {
    // Guards the `exports` line in CommonModule, and does so through a REAL consumer in a
    // separate module. The obvious version of this test — importing CommonModule into the
    // testing module and resolving the service directly — passes whether or not `exports` is
    // present, because `TestingModule.get`/`resolve` are non-strict and search the entire
    // container. Verified by deleting the `exports` line and watching that version stay green.
    //
    // Going through ConsumerModule exercises the path the application actually uses: if
    // CommonModule stops exporting, `compile()` fails with "Nest can't resolve dependencies of
    // the Consumer (?)" — which is precisely the boot failure this line prevents.
    const moduleWithConsumer = await Test.createTestingModule({
      imports: [ConsumerModule],
    }).compile();

    // `resolve`, not `get`: Consumer injects a request-scoped provider, so it becomes
    // request-scoped itself. This is scope bubbling in miniature.
    const consumer = await moduleWithConsumer.resolve(Consumer);

    expect(consumer.loaders).toBeInstanceOf(DataLoaderService);
  });
});
