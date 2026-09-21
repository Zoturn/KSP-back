import { Injectable, Scope } from '@nestjs/common';

/**
 * Holds one DataLoader per relation, for the lifetime of a single request.
 *
 * Loaders themselves arrive in task 5.1, once the catalogue entities exist. What this file
 * establishes now is the part that is a **correctness requirement rather than a performance
 * choice**, and which is far more disruptive to retrofit than to start with.
 *
 * WHY `Scope.REQUEST`
 * --------------------
 * A DataLoader is two things at once: a batcher and a **cache**. The cache is what makes
 * `product.category` cheap when forty products share a category — and it is also what makes a
 * singleton loader a security bug. A singleton lives as long as the process, so its cache
 * spans users and requests. The moment visibility depends on who is asking (Phase 5, when an
 * admin can see unpublished products), one caller's cached row is served to the next. That is
 * a data leak, and it is invisible: every test passes, the response looks right, and it is
 * simply the wrong person's data.
 *
 * Request scope means the loaders — and their caches — are created and discarded per request,
 * which is exactly the lifetime the cache should have.
 *
 * THE CONSEQUENCE TO EXPECT: SCOPE BUBBLES
 * ------------------------------------------
 * Nest propagates request scope upward. Anything injecting this service becomes request-scoped
 * too, and so does anything injecting *that*. From Phase 4 onward most resolvers inject it, so
 * most resolvers are request-scoped.
 *
 * The visible symptom is in tests: `module.get(X)` throws *"X is marked as a scoped provider"*,
 * because there is no single instance to return. Use `await module.resolve(X)`, which creates
 * one. `dataloader.service.spec.ts` pins that asymmetry deliberately, so the first person to
 * meet it elsewhere recognises it instead of debugging it.
 */
@Injectable({ scope: Scope.REQUEST })
export class DataLoaderService {}
