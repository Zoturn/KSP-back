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
 *
 * A plain `Map` rather than a `WeakMap` is deliberate: `@ObjectType()` already registers both
 * classes in `@nestjs/graphql`'s module-level metadata storage for the life of the process, so
 * a weak key would free nothing.
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
 * THE NAME IS DERIVED, NOT PASSED
 * ---------------------------------
 * Our models are named `ProductModel` in code (so `catalog.mapper.ts` can import the entity
 * and the model side by side without a collision) while the GraphQL type is `Product`. The
 * `Model` suffix is stripped here so the page type comes out as `ProductPage`.
 *
 * This deliberately takes no `name` override. An earlier version accepted one, and it was a
 * footgun twice over: the cache was keyed on `classRef` alone, so a second call with a
 * different name silently returned the first class and discarded the new name; and it let a
 * call site disagree with the `@ObjectType('Product')` on the model itself. The GraphQL name
 * is a property of the model, not of each pagination call.
 */
export function Paginated<T>(classRef: Type<T>): Type<Paginated<T>> {
  const cached = pageTypeCache.get(classRef);
  if (cached) {
    return cached as Type<Paginated<T>>;
  }

  // One decorated class, not an `isAbstract: true` base plus a named subclass. The two-class
  // form is what @nestjs/graphql documents for the pattern where the FACTORY returns a base
  // and each CALL SITE writes `@ObjectType() class ProductPage extends Paginated(Product) {}`.
  // This factory does both steps itself, so the base would have no second consumer and nothing
  // to be abstract for — verified to emit identical SDL either way.
  @ObjectType(`${classRef.name.replace(/Model$/, '')}Page`)
  class PageType implements Paginated<T> {
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

    @Field({ description: 'Whether a further page exists after this one.' })
    hasNextPage: boolean;

    @Field(() => Int, {
      description: 'The 1-based page number this result represents.',
    })
    page: number;

    @Field(() => Int, { description: 'The page size used for this result.' })
    limit: number;
  }

  pageTypeCache.set(classRef, PageType);
  return PageType;
}
