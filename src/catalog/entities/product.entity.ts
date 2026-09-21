import {
  Check,
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
import { Category } from './category.entity';
import { ProductImage } from './product-image.entity';

/**
 * A sellable item in the catalogue. Not a GraphQL type — see `category.entity.ts`.
 *
 * The partial index below is the one every catalogue query relies on: each read filters on
 * `is_published` and sorts by `(created_at DESC, id DESC)` (design Decision #3), so the index
 * matches both halves and stays small by excluding drafts entirely.
 */
@Entity('products')
@Check('"price_cents" >= 0')
@Index('idx_products_published_created', ['createdAt', 'id'], {
  where: '"is_published"',
})
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'citext', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * MONEY IS AN INTEGER NUMBER OF MINOR UNITS. Never a float, never `numeric` mapped to a JS
   * number — binary floating point cannot represent 0.1 exactly, and the error compounds the
   * moment totals are derived from it. `database.md` makes this non-negotiable, and the
   * `CHECK` above stops a negative price reaching the table at all.
   */
  @Column({ name: 'price_cents', type: 'integer' })
  priceCents: number;

  /** ISO 4217, fixed width — `char(3)` rather than `text` because the length is a real rule. */
  @Column({ type: 'char', length: 3 })
  currency: string;

  /**
   * The visibility flag. Every catalogue read applies `is_published = true` through a single
   * query builder in `CatalogService` (design Decision #2) — the spec requires an unpublished
   * product to be unreachable even by direct id lookup, and not to reveal that it exists.
   */
  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  /**
   * `SET NULL`, not `CASCADE`: removing a category must not delete the products in it. That
   * choice is also why `Product.category` is nullable in the GraphQL schema — the database
   * permits absence, so the published contract has to admit it (design Decision #7).
   */
  @ManyToOne(() => Category, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Index()
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: ProductImage[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
