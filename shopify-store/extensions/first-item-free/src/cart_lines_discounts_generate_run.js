// @ts-check

/**
 * "First item free" discount.
 *
 * Exactly one unit per cart is free — the cheapest one, so a customer can't
 * pair a cheap item with an expensive one to get the expensive one free.
 * Every other unit, including extra units of the same product, is charged at
 * full price. Gift cards are never discounted.
 */

const FREE_UNITS_PER_ORDER = 1;
const DISCOUNT_MESSAGE = 'First item free';

/**
 * @typedef {{ id: string, quantity: number, cost: { amountPerQuantity: { amount: string } }, merchandise: { __typename: string, product?: { isGiftCard: boolean } } }} CartLine
 * @typedef {{ cart: { lines: CartLine[] }, discount: { discountClasses: string[] } }} CartInput
 */

/**
 * @param {CartInput} input
 */
export function cartLinesDiscountsGenerateRun(input) {
  // Shopify only lets this function apply product-level discounts when the
  // merchant created the discount with the PRODUCT class.
  if (!input.discount.discountClasses.includes('PRODUCT')) {
    return { operations: [] };
  }

  const eligible = input.cart.lines.filter(
    (line) =>
      line.quantity > 0 &&
      line.merchandise.__typename === 'ProductVariant' &&
      !line.merchandise.product?.isGiftCard &&
      unitPrice(line) > 0,
  );
  if (eligible.length === 0) {
    return { operations: [] };
  }

  const cheapest = eligible.reduce((best, line) =>
    unitPrice(line) < unitPrice(best) ? line : best,
  );

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: DISCOUNT_MESSAGE,
              targets: [
                {
                  cartLine: {
                    id: cheapest.id,
                    quantity: Math.min(FREE_UNITS_PER_ORDER, cheapest.quantity),
                  },
                },
              ],
              value: { percentage: { value: 100 } },
            },
          ],
          selectionStrategy: 'FIRST',
        },
      },
    ],
  };
}

/** @param {CartLine} line */
function unitPrice(line) {
  return Number(line.cost.amountPerQuantity.amount);
}
