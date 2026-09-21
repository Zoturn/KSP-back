import { Module } from '@nestjs/common';
import { DataLoaderService } from './dataloader/dataloader.service';

/**
 * Cross-cutting building blocks shared by every feature module.
 *
 * `DataLoaderService` is **exported**, which is the whole point of this module existing: per
 * `nestjs.md`, a provider is injectable outside its own module only if that module exports it.
 * Listing it in `providers` alone would make `CatalogModule`'s resolvers fail to resolve it —
 * the single most common NestJS wiring error, and the message names the *importing* module,
 * which sends people looking in the wrong file.
 *
 * Deliberately **not** `@Global()`. Configuration and the TypeORM connection are global because
 * genuinely everything needs them and requiring the import would be noise. A loader service is
 * not in that category: making it global would hide which modules actually touch the database
 * through batching, and the dependency graph is what keeps the codebase navigable.
 */
@Module({
  providers: [DataLoaderService],
  exports: [DataLoaderService],
})
export class CommonModule {}
