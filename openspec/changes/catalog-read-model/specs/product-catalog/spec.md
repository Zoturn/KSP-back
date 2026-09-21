# Spec Delta

## Purpose

Lets a storefront visitor browse the shop's catalogue: page through products, open a single
product with its images and category, and navigate the category tree — without an account, and
without seeing anything the shop has not published.

## ADDED Requirements

### Requirement: Products are listed in pages

The system SHALL return products as a page of results together with the total number of matching
products and whether further pages exist, so a client can render paging controls without fetching
everything.

#### Scenario: A page of products is requested

- **WHEN** a client requests the product list without specifying paging
- **THEN** the system returns the first page using a default page size
- **AND** the response reports the total count of matching products and whether a next page exists

#### Scenario: Page size is bounded

- **WHEN** a client requests a page size larger than the maximum the system allows
- **THEN** the request is rejected as invalid input
- **AND** no results are returned

#### Scenario: Ordering is stable across pages

- **WHEN** a client requests two consecutive pages with no data changing in between
- **THEN** no product appears on both pages
- **AND** no matching product is skipped between them

#### Scenario: A page beyond the end of the results

- **WHEN** a client requests a page number past the last page of results
- **THEN** the system returns an empty list rather than an error
- **AND** the reported total count still reflects all matching products

### Requirement: Only published products are visible

The system SHALL expose exactly those products the shop has published. Unpublished products MUST
NOT be reachable by any catalogue read, including retrieval by a known identifier, so that a
draft product cannot be discovered by guessing or by holding a previously valid link.

#### Scenario: Unpublished products are absent from the list

- **WHEN** a client requests the product list and some products are unpublished
- **THEN** the returned products are only the published ones
- **AND** the reported total count excludes the unpublished ones

#### Scenario: An unpublished product cannot be fetched directly

- **WHEN** a client requests a single unpublished product by its identifier
- **THEN** the system responds as it does for a product that does not exist, without revealing
  that the product exists

### Requirement: A single product can be retrieved by identifier

The system SHALL allow retrieval of one published product by its identifier, returning an absent
result rather than an error when there is no such product, because a missing product is an
ordinary outcome of following a stale link.

#### Scenario: The product exists

- **WHEN** a client requests a published product by its identifier
- **THEN** the system returns that product

#### Scenario: The product does not exist

- **WHEN** a client requests a product by an identifier that matches nothing
- **THEN** the system returns an absent result and reports no error

### Requirement: Monetary amounts are exposed without loss of precision

The system SHALL express every price as a whole number of the currency's minor unit together with
the currency it is denominated in. Prices MUST NOT be exposed as fractional numbers, because
binary floating point cannot represent common decimal amounts exactly and the error compounds
once totals are derived.

#### Scenario: A product's price is read

- **WHEN** a client reads a product's price
- **THEN** the amount is a whole number in the currency's minor unit
- **AND** the currency is identified alongside it

### Requirement: A product exposes its images in a defined order

The system SHALL return a product's images in an order the shop controls, so the intended primary
image is predictable rather than incidental.

#### Scenario: A product with several images

- **WHEN** a client reads the images of a product that has more than one
- **THEN** the images are returned in the shop's defined order
- **AND** that order is the same on every request while the data is unchanged

#### Scenario: A product with no images

- **WHEN** a client reads the images of a product that has none
- **THEN** the system returns an empty collection rather than an absent value or an error

### Requirement: Categories form a navigable tree

The system SHALL expose categories as a hierarchy, allowing a client to render navigation from
the top level downward and to identify where any single category sits within it.

#### Scenario: The category tree is requested

- **WHEN** a client requests the categories
- **THEN** the system returns the top-level categories
- **AND** each category's child categories are reachable from it

#### Scenario: A category is requested by its human-readable identifier

- **WHEN** a client requests a category by the stable readable identifier used in its URL
- **THEN** the system returns that category

#### Scenario: An unknown category

- **WHEN** a client requests a category by a readable identifier that matches nothing
- **THEN** the system returns an absent result and reports no error

### Requirement: A product's category is reachable from the product

The system SHALL allow a client reading a product to reach the category it belongs to in the same
request, so a product page can show its placement without a second round trip.

#### Scenario: Reading a product's category

- **WHEN** a client reads a product together with its category
- **THEN** the category is returned within the same response

#### Scenario: A failure fetching one category does not empty the response

- **WHEN** a client reads a list of products and the category of one product cannot be resolved
- **THEN** the remaining products are still returned
- **AND** the failure is reported against that product's category alone

### Requirement: Read cost does not grow with the number of results

The number of database queries the system issues to satisfy a catalogue read SHALL NOT grow in
proportion to the number of items returned. A list of products with their images and categories
MUST cost a bounded number of queries regardless of page size, because per-item querying degrades
without any visible change in the response and is therefore invisible until it is a production
incident.

#### Scenario: Listing many products with their relations

- **WHEN** a client requests a full page of products including each product's images and category
- **THEN** the number of database queries issued is bounded and independent of the number of
  products on the page
