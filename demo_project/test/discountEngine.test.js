import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateOrderTotal, ValidationError } from "../src/discountEngine.js";

test("STANDARD customer: single line item has 0% discount", () => {
  const total = calculateOrderTotal({ lineItems: [{ price: 10, quantity: 2 }] }, { tier: "STANDARD" });
  assert.equal(total, 20);
});

test("STANDARD customer: multiple line items sum to subtotal with no discount", () => {
  const total = calculateOrderTotal(
    { lineItems: [{ price: 10, quantity: 2 }, { price: 5, quantity: 3 }] },
    { tier: "STANDARD" },
  );
  assert.equal(total, 35);
});

test("SILVER customer: 5% discount applied to a single line item", () => {
  const total = calculateOrderTotal({ lineItems: [{ price: 20, quantity: 1 }] }, { tier: "SILVER" });
  assert.equal(total, 19);
});

test("SILVER customer: multiple line items get one 5% discount on the subtotal", () => {
  const total = calculateOrderTotal(
    { lineItems: [{ price: 10, quantity: 1 }, { price: 20, quantity: 1 }] },
    { tier: "SILVER" },
  );
  assert.equal(total, 28.5);
});

test("GOLD customer: normal single line item gets 10% discount", () => {
  const total = calculateOrderTotal({ lineItems: [{ price: 50, quantity: 1 }] }, { tier: "GOLD" });
  assert.equal(total, 45);
});

test("GOLD customer: multiple line items with round numbers happen to match either rounding order", () => {
  const total = calculateOrderTotal(
    { lineItems: [{ price: 10, quantity: 1 }, { price: 20, quantity: 1 }] },
    { tier: "GOLD" },
  );
  assert.equal(total, 27);
});

test("GOLD customer: multiple low-priced line items must apply the discount once to the combined subtotal", () => {
  // subtotal = 0.33 + 0.33 = 0.66; 10% off => 0.594 => rounds to 0.59.
  // A implementation that discounts+rounds each line separately before
  // summing will not reach 0.59 here.
  const total = calculateOrderTotal(
    { lineItems: [{ price: 0.33, quantity: 1 }, { price: 0.33, quantity: 1 }] },
    { tier: "GOLD" },
  );
  assert.equal(total, 0.59);
});

test("rejects a line item with negative price", () => {
  assert.throws(
    () => calculateOrderTotal({ lineItems: [{ price: -5, quantity: 1 }] }, { tier: "STANDARD" }),
    ValidationError,
  );
});

test("rejects a line item with zero quantity", () => {
  assert.throws(
    () => calculateOrderTotal({ lineItems: [{ price: 10, quantity: 0 }] }, { tier: "STANDARD" }),
    ValidationError,
  );
});

test("rejects a line item with negative quantity", () => {
  assert.throws(
    () => calculateOrderTotal({ lineItems: [{ price: 10, quantity: -1 }] }, { tier: "STANDARD" }),
    ValidationError,
  );
});

test("accepts a zero-price line item (free item)", () => {
  const total = calculateOrderTotal(
    { lineItems: [{ price: 0, quantity: 1 }, { price: 10, quantity: 1 }] },
    { tier: "STANDARD" },
  );
  assert.equal(total, 10);
});

test("rejects an unknown loyalty tier", () => {
  assert.throws(
    () => calculateOrderTotal({ lineItems: [{ price: 10, quantity: 1 }] }, { tier: "PLATINUM" }),
    ValidationError,
  );
});

test("rejects an order with no line items", () => {
  assert.throws(() => calculateOrderTotal({ lineItems: [] }, { tier: "STANDARD" }), ValidationError);
});

test("rejects an order missing lineItems entirely", () => {
  assert.throws(() => calculateOrderTotal({}, { tier: "STANDARD" }), ValidationError);
});

test("total is never negative, even for an all-zero-price GOLD order", () => {
  const total = calculateOrderTotal({ lineItems: [{ price: 0, quantity: 3 }] }, { tier: "GOLD" });
  assert.equal(total, 0);
  assert.ok(total >= 0);
});

test("precision: result is rounded to 2 decimal places for a fractional-cent case", () => {
  const total = calculateOrderTotal({ lineItems: [{ price: 19.99, quantity: 1 }] }, { tier: "SILVER" });
  assert.equal(total, 18.99);
});
