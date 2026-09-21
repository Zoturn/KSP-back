import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * An image belonging to a product. Not a GraphQL type — see `category.entity.ts`.
 *
 * The composite index on `(product_id, position)` does double duty: it is the batch predicate
 * for the images loader (`WHERE product_id IN (...)`) and it supplies the ordering the spec
 * requires, so the defined order costs no sort.
 */
@Entity('product_images')
@Index('idx_product_images_product_position', ['productId', 'position'])
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * `CASCADE` — the only cascade in this migration, and deliberately so. An image has no
   * meaning once its product is gone, which is the genuine ownership case `database.md`
   * reserves cascade for. Contrast `products.category_id`, which is `SET NULL`.
   */
  @ManyToOne(() => Product, (product) => product.images, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  /** Where the image actually lives. The `/api/uploads/*` phase may turn this into a key. */
  @Column({ type: 'text' })
  url: string;

  /** Alt text. Nullable because it is genuinely optional data, not a forgotten NOT NULL. */
  @Column({ type: 'text', nullable: true })
  alt: string | null;

  /**
   * Display order within a product, ascending. The shop controls which image is primary;
   * without this the "first" image would be whatever Postgres returned, which is not stable
   * and would make the spec's defined-order scenario untestable.
   */
  @Column({ type: 'smallint', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
