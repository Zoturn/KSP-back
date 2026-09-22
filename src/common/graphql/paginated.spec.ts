import { NestFactory } from '@nestjs/core';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
  Field,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { Paginated } from './paginated';

@ObjectType('Widget')
class WidgetModel {
  @Field()
  name: string;
}

@ObjectType()
class Gadget {
  @Field()
  name: string;
}

describe('Paginated', () => {
  it('returns the same class when called twice for the same item type', () => {
    // Each call builds a new class and registers it under one GraphQL type name, so an
    // unmemoised factory produces two classes claiming "WidgetPage" and schema generation
    // dies with a duplicate-type error — at boot, far from the second call. Identity, not
    // structural equality, is what proves the cache works: two separately built classes
    // would be structurally identical and pass a `toEqual`.
    expect(Paginated(WidgetModel)).toBe(Paginated(WidgetModel));
  });

  it('returns distinct classes for different item types', () => {
    expect(Paginated(WidgetModel)).not.toBe(Paginated(Gadget));
  });

  describe('the schema it actually emits', () => {
    /**
     * Builds real SDL rather than inspecting the class.
     *
     * This is the contract the factory exists to produce, and asserting on it is what makes
     * the implementation replaceable: the earlier version built an `isAbstract: true` base
     * plus a named subclass, and the only way to know that simplifying to a single class was
     * equivalent was to compare emitted SDL. A test that checks class identity alone cannot
     * tell those apart.
     *
     * `GraphQLSchemaBuilderModule` is the same minimal module `schema.generate.ts` uses — no
     * database, no config, just the schema factory.
     */
    let sdl: string;

    beforeAll(async () => {
      const WidgetPage = Paginated(WidgetModel);

      @Resolver()
      class WidgetResolver {
        @Query(() => WidgetPage)
        widgets(): InstanceType<typeof WidgetPage> {
          throw new Error(
            'not called — the schema is built from types, not executed',
          );
        }
      }

      const app = await NestFactory.create(GraphQLSchemaBuilderModule, {
        logger: false,
      });
      await app.init();
      const schema = await app
        .get(GraphQLSchemaFactory)
        .create([WidgetResolver]);
      sdl = printSchema(schema);
      await app.close();
    });

    it('names the type after the item type, with the Model suffix stripped', () => {
      // WidgetModel in code, Widget in the schema, WidgetPage for its page. The suffix strip
      // is why the factory takes no `name` override — the GraphQL name belongs to the model.
      expect(sdl).toContain('type WidgetPage {');
      expect(sdl).not.toContain('WidgetModelPage');
    });

    it('exposes items as a non-null list of the item type', () => {
      expect(sdl).toMatch(/items: \[Widget!\]!/);
    });

    it('exposes the paging fields with their intended types', () => {
      expect(sdl).toMatch(/totalCount: Int!/);
      expect(sdl).toMatch(/hasNextPage: Boolean!/);
      expect(sdl).toMatch(/page: Int!/);
      expect(sdl).toMatch(/limit: Int!/);
    });
  });
});
