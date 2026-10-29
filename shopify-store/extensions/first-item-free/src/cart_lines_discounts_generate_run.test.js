import { describe, expect, it } from 'vitest';
import { cartLinesDiscountsGenerateRun } from './cart_lines_discounts_generate_run';

function line(id, price, quantity = 1, { giftCard = false, type = 'ProductVariant' } = {}) {
  return {
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    cost: { amountPerQuantity: { amount: String(price) } },
    merchandise: { __typename: type, product: { isGiftCard: giftCard } },
  };
}

function run(lines, discountClasses = ['PRODUCT']) {
  return cartLinesDiscountsGenerateRun({ cart: { lines }, discount: { discountClasses } });
}

function freeTarget(result) {
  return result.operations[0].productDiscountsAdd.candidates[0].targets[0].cartLine;
}

describe('first item free', () => {
  it('makes a single item free', () => {
    const result = run([line(1, '25.00')]);
    expect(freeTarget(result)).toEqual({ id: 'gid://shopify/CartLine/1', quantity: 1 });
    expect(result.operations[0].productDiscountsAdd.candidates[0].value).toEqual({
      percentage: { value: 100 },
    });
  });

  it('only frees one unit when the customer buys several of the same item', () => {
    const result = run([line(1, '25.00', 3)]);
    expect(freeTarget(result)).toEqual({ id: 'gid://shopify/CartLine/1', quantity: 1 });
  });

  it('frees the cheapest item when the cart has different products', () => {
    const result = run([line(1, '40.00'), line(2, '9.99', 2), line(3, '15.00')]);
    expect(freeTarget(result)).toEqual({ id: 'gid://shopify/CartLine/2', quantity: 1 });
  });

  it('never discounts gift cards', () => {
    const result = run([line(1, '10.00', 1, { giftCard: true }), line(2, '30.00')]);
    expect(freeTarget(result).id).toBe('gid://shopify/CartLine/2');
  });

  it('returns no discount for an empty cart or one with only gift cards', () => {
    expect(run([])).toEqual({ operations: [] });
    expect(run([line(1, '50.00', 1, { giftCard: true })])).toEqual({ operations: [] });
  });

  it('skips items that are already free', () => {
    const result = run([line(1, '0.00'), line(2, '12.00')]);
    expect(freeTarget(result).id).toBe('gid://shopify/CartLine/2');
  });

  it('does nothing when the discount was not created with the PRODUCT class', () => {
    expect(run([line(1, '25.00')], ['ORDER'])).toEqual({ operations: [] });
  });
});
