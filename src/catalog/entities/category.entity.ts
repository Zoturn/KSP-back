import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A node in the catalogue's category tree.
 *
 * MODELLED AS AN ADJACENCY LIST, NOT A CLOSURE TABLE — see design.md Decision #1. `CLAUDE.md`
 * still says closure-table; this entity is deliberately the exception, and the reasoning is
 * recorded rather than implied. In short: nothing in the spec needs O(1) descendant queries,
 * TypeORM's `@Tree` goes through `TreeRepository` and does not compose with the DataLoader
 * batching our rules require, and a closure table would be the one part of the schema the ORM
 * maintains at runtime — invisible to a migrations-only review.
 *
 * **This is not a GraphQL type.** No `@ObjectType()` here or in any sibling entity: the schema
 * is a published cross-repo contract and must not move when the database refactors
 * (`graphql.md`). `catalog.mapper.ts` converts this to `CategoryModel`.
 */
@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  /**
   * The URL-facing identifier. `citext` rather than `text` so uniqueness is case-insensitive
   * without lower-casing at every call site — `/c/Audio` and `/c/audio` must not be two
   * different categories. The extension is installed by the `AddExtensions` migration.
   */
  @Column({ type: 'citext', unique: true })
  slug: string;

  /**
   * `RESTRICT`, not `CASCADE`: deleting a category that still has children would silently
   * delete an entire subtree. Ownership cascades are reserved for cases where the child has no
   * meaning without its parent (`database.md`), and a sub-category is not that.
   */
  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  /**
   * The foreign key as a real column, alongside the relation above.
   *
   * Two reasons it is declared explicitly rather than left implicit: the mapper copies it onto
   * the model so field resolvers can key a loader off it, and `WHERE parent_id IN (...)` is
   * the children loader's batch query — which needs the column, not the relation.
   */
  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
