import { Type } from '@nestjs/common';
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * The shape every paginated result has. Declared separately from the factory below so services
 * can be typed against it without touching GraphQL at all — a service returns data, and only
 * the resolver layer knows that data becomes a schema type.
 */
export interface Paginated<T> {
  items: T[];
  totalCount: number;
  hasNextPage: boolean;
  page: number;
  limit: number;
}

/**
 * Cache of already-built page types, keyed by the item class.
 *
 * MEMOISING IS REQUIRED, NOT AN OPTIMISATION
 * -------------------------------------------
 * Each call builds a NEW class and registers it with the schema builder under the name below.
 * Calling the factory twice for the same item type therefore registers two distinct classes
 * claiming one GraphQL type name, and schema generation fails with a duplicate-type error —
 * at boot, far from the second call site that caused it. The cache makes the factory
 * idempotent, so importing it from two modules is safe.
 */
const pageTypeCache = new Map<Type<unknown>, Type<unknown>>();

/**
 * Builds the `XPage` object type for a given item type.
 *
 * WHY A FACTORY AT ALL
 * ---------------------
 * GraphQL has no generics. `Paginated<Product>` cannot be expressed in the schema, so every
 * paginated list would otherwise need its own hand-written wrapper class — pure copy-paste
 * that drifts.
 *
 * The code-first escape hatch is `@ObjectType({ isAbstract: true })`, which means "reflect over
 * this class to collect its fields, but do not emit it as a schema type in its own right". The
 * subclass returned here is what gets emitted, under an explicit name. Without `isAbstract`,
 * the generic base itself would appear in the schema as a type nobody can use.
 *
 * @param classRef the item type, e.g. the `Product` model
 * @param name     the GraphQL type name; defaults to `<classRef.name>Page`. Pass it explicitly
 *                 when the class name differs from the schema name (our models are named
 *                 `ProductModel` in code but `Product` in the schema).
 */
export function Paginated<T>(
  classRef: Type<T>,
  name?: string,
): Type<Paginated<T>> {
  const cached = pageTypeCache.get(classRef);
  if (cached) {
    return cached as Type<Paginated<T>>;
  }

  @ObjectType({ isAbstract: true })
  abstract class PageBase implements Paginated<T> {
    // The explicit thunk is mandatory: TypeScript's emitted metadata for `T[]` is just
    // `Array`, which tells the schema builder nothing about the element type.
    @Field(() => [classRef], {
      description: 'The items on this page, in the query’s defined order.',
    })
    items: T[];

    @Field(() => Int, {
      description:
        'Total number of items matching the query, across all pages.',
    })
    totalCount: number;

    @Field({
      description: 'Whether a further page exists after this one.',
    })
    hasNextPage: boolean;

    @Field(() => Int, {
      description: 'The 1-based page number this result represents.',
    })
    page: number;

    @Field(() => Int, { description: 'The page size used for this result.' })
    limit: number;
  }

  @ObjectType(name ?? `${classRef.name}Page`)
  class PageType extends PageBase {}

  pageTypeCache.set(classRef, PageType);
  return PageType;
}
