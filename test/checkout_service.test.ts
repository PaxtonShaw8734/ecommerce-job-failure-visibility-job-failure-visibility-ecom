import assert from "node:assert/strict";
import { checkoutBody, decideOrderUpdate } from "../src/checkout_service.js";

const order = checkoutBody.parse({ orderId: "ord-7", customerEmail: "buyer@example.com", totalCents: 1200, items: ["preset"] });
assert.equal(decideOrderUpdate(order, true), "receipt");
assert.equal(decideOrderUpdate(order, false), "retry");
assert.throws(() => checkoutBody.parse({ orderId: "", customerEmail: "bad", totalCents: 0, items: [] }));
console.log("checkout decision test passed");
