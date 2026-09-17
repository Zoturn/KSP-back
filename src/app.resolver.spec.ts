import { Test, TestingModule } from '@nestjs/testing';
import { AppResolver } from './app.resolver';

/**
 * `AppResolver` has no dependencies, so there is nothing to mock — the testing module just
 * instantiates it. (Contrast with feature resolvers from Phase 4 onward, which inject
 * services and a request-scoped `DataLoaderService`; those need `await module.resolve()`
 * rather than `module.get()`, per `testing.md`.)
 */
describe('AppResolver', () => {
  let resolver: AppResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppResolver],
    }).compile();

    resolver = module.get<AppResolver>(AppResolver);
  });

  describe('apiStatus', () => {
    it('reports that the GraphQL layer is operational', () => {
      expect(resolver.apiStatus()).toBe('ok');
    });
  });
});
