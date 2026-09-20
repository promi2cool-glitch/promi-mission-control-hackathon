# Known issue: GOLD-tier order total mismatch

## Observable failing behavior

For a GOLD-tier customer with **multiple line items**, `calculateOrderTotal`
sometimes returns a total that is a few cents higher than expected.

Concretely, for an order with two line items priced at `0.33` each (quantity
`1` each) for a GOLD customer, the function currently returns `0.6` instead
of the expected `0.59`.

## Expected behavior

The 10% GOLD loyalty discount should apply once to the order's combined
subtotal (the sum of all line items), consistent with how STANDARD and
SILVER orders are discounted. The final total should always be the
subtotal after the discount is applied, rounded to 2 decimal places.

## How to reproduce

```js
import { calculateOrderTotal } from "./src/discountEngine.js";

const order = {
  lineItems: [
    { price: 0.33, quantity: 1 },
    { price: 0.33, quantity: 1 },
  ],
};
const customer = { tier: "GOLD" };

console.log(calculateOrderTotal(order, customer)); // currently: 0.6, expected: 0.59
```

## Test command

From the repository root:

```
node --test "demo_project/test/**/*.test.js"
```

One test currently fails:
`GOLD customer: multiple low-priced line items must apply the discount once to the combined subtotal`

All other tests (STANDARD, SILVER, GOLD single-item, validation rejections,
zero-price handling, precision handling) pass.
