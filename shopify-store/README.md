# First Item Free — Shopify app

A Shopify app for a store where **every order gets one item free, and any
additional items are charged at full price.**

| Cart | Customer pays |
| --- | --- |
| 1 × T-shirt ($25) | **$0** |
| 3 × T-shirt ($25) | **$50** — one free, two paid |
| Hoodie ($60) + Sticker ($5) | **$60** — the sticker is free |

The free unit is always the **cheapest** one in the cart, so nobody can pair a
$1 item with a $500 item to get the $500 one free. Gift cards are never free.

## How it works

The rule runs as a [Shopify Function](https://shopify.dev/docs/apps/build/functions)
(a discount function). Shopify executes it every time the cart changes, so the
discount shows in the cart and at checkout and can't be bypassed in the
browser.

```
shopify-store/
├── shopify.app.toml                      app config (scope: write_discounts)
├── extensions/first-item-free/
│   ├── shopify.extension.toml            registers the discount function
│   ├── src/cart_lines_discounts_generate_run.graphql   cart data the function reads
│   ├── src/cart_lines_discounts_generate_run.js        the "1 free" rule
│   └── src/cart_lines_discounts_generate_run.test.js   tests
└── theme/snippets/first-item-free-banner.liquid        optional storefront banner
```

To change the offer, edit the constants at the top of
`cart_lines_discounts_generate_run.js`, e.g. `FREE_UNITS_PER_ORDER = 2`.

## Setup

You need a free [Shopify Partner account](https://www.shopify.com/partners) and
a development store (or your live store), plus Node 20+.

### 1. Install and connect the app

```bash
cd shopify-store
npm install
npx shopify app config link     # pick "Create a new app"; fills in client_id
```

### 2. Run it on your dev store

```bash
npm run dev
```

Pick your store and open the install link the CLI prints, then approve the app.

### 3. Turn the discount on

The function does nothing until a discount uses it. While `npm run dev` is
running, press **g** to open GraphiQL and run:

```graphql
mutation {
  discountAutomaticAppCreate(
    automaticAppDiscount: {
      title: "First item free"
      functionHandle: "first-item-free"
      discountClasses: [PRODUCT]
      startsAt: "2026-01-01T00:00:00Z"
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
    }
  ) {
    automaticAppDiscount { discountId title status }
    userErrors { field message }
  }
}
```

It appears under **Discounts** in the Shopify admin, where you can pause or
end it any time. Add an item to the cart on your storefront — it should show
"First item free" and a $0 line.

### 4. (Optional) Show the offer on the storefront

In the admin go to **Online Store → Themes → ⋯ → Edit code**, create the snippet
`first-item-free-banner` with the contents of
`theme/snippets/first-item-free-banner.liquid`, and add this line near the top
of your cart template (in Dawn: `sections/main-cart-items.liquid`):

```liquid
{% render 'first-item-free-banner' %}
```

### 5. Go live

```bash
npm run deploy
```

Then install the app on your live store and repeat step 3 there.

## Tests

```bash
npm test
```

To build the WebAssembly locally: `cd extensions/first-item-free && npm run build`.

## Limits to know about

- **One free item per order, not per customer.** Someone can place several
  one-item orders and get each free. To limit it to a customer's first order,
  require customer accounts and add `buyerIdentity { customer { numberOfOrders } }`
  to the input query, then return no discount when it is above 0.
- Shipping is still charged on the free item unless you set up a separate
  shipping discount.
- With `combinesWith` set as above, other product and order discounts won't
  stack on top of the free item.
