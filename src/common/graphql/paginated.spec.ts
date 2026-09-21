import { Field, ObjectType } from '@nestjs/graphql';
import { Paginated } from './paginated';

@ObjectType()
class Widget {
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
    // This is the test that earns its keep. Each call builds a new class and registers it
    // under one GraphQL type name, so an unmemoised factory produces two classes claiming
    // "WidgetPage" and schema generation dies with a duplicate-type error — at boot, far from
    // the second call. Identity, not just structural equality, is what proves the cache works.
    expect(Paginated(Widget)).toBe(Paginated(Widget));
  });

  it('returns distinct classes for different item types', () => {
    expect(Paginated(Widget)).not.toBe(Paginated(Gadget));
  });

  it('produces an instantiable class carrying the page shape', () => {
    const WidgetPage = Paginated(Widget);
    const page = new WidgetPage();

    page.items = [{ name: 'a' }];
    page.totalCount = 1;
    page.hasNextPage = false;
    page.page = 1;
    page.limit = 20;

    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(1);
    expect(page.hasNextPage).toBe(false);
  });
});
