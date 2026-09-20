/**
 * Order discount engine.
 *
 * Business rules:
 *   1. subtotal is the sum of line items (price * quantity)
 *   2. quantity must be positive
 *   3. price must be non-negative
 *   4. loyalty discount: STANDARD 0%, SILVER 5%, GOLD 10%
 *   5. the discount applies to the subtotal
 *   6. total must never be negative
 *   7. invalid input throws ValidationError
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export const LOYALTY_DISCOUNT_RATES = {
  STANDARD: 0,
  SILVER: 0.05,
  GOLD: 0.1,
};

function round2(amount) {
  return Math.round(amount * 100) / 100;
}

function validateOrder(order) {
  if (!order || !Array.isArray(order.lineItems) || order.lineItems.length === 0) {
    throw new ValidationError("order must contain at least one line item");
  }
  for (const item of order.lineItems) {
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new ValidationError(`line item quantity must be a positive number, got ${item.quantity}`);
    }
    if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0) {
      throw new ValidationError(`line item price must be a non-negative number, got ${item.price}`);
    }
  }
}

function validateCustomer(customer) {
  if (!customer || typeof customer.tier !== "string" || !(customer.tier in LOYALTY_DISCOUNT_RATES)) {
    throw new ValidationError(`unknown loyalty tier: ${customer ? customer.tier : customer}`);
  }
}

function lineSubtotal(item) {
  return item.price * item.quantity;
}

/**
 * Computes the final order total after applying the customer's loyalty
 * discount to the order subtotal.
 *
 * @param {{ lineItems: { price: number, quantity: number }[] }} order
 * @param {{ tier: "STANDARD" | "SILVER" | "GOLD" }} customer
 * @returns {number} the final total, rounded to 2 decimal places, never negative
 */
export function calculateOrderTotal(order, customer) {
  validateOrder(order);
  validateCustomer(customer);

  const discountRate = LOYALTY_DISCOUNT_RATES[customer.tier];

  if (customer.tier === "GOLD") {
    // GOLD fast path: discounts and rounds each line item individually,
    // then sums the rounded line totals.
    let total = 0;
    for (const item of order.lineItems) {
      const discountedLine = lineSubtotal(item) * (1 - discountRate);
      total += round2(discountedLine);
    }
    return Math.max(0, round2(total));
  }

  const subtotal = order.lineItems.reduce((sum, item) => sum + lineSubtotal(item), 0);
  const discounted = subtotal * (1 - discountRate);
  return Math.max(0, round2(discounted));
}
