import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { openStorefront, preparedEntry, readyCart, statusView } from "./_test/checkout";

/** The checkout a refreshed browser finds already finished on the server. */
const reloadedStatus = statusView({ status: "PAID" });

function browser() {
  return new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
}

test("a ready Cart produces a Checkout Proposal that accounts for every rupee", async (t) => {
  const { view, user, within, openCart, requests } = await openStorefront(
    t,
    browser(),
    { routes: { proposal: () => Response.json({ data: preparedEntry() }) } },
  );

  const drawer = await openCart();
  await user.click(within(drawer).getByRole("button", { name: "Check out" }));

  const card = await view.findByRole("region", { name: "Checkout proposal" });
  assert.ok(within(card).getByText("Quiet Buds"));
  assert.ok(within(card).getByText("2 × ₹3,499"));
  assert.equal(
    within(card).getByLabelText("Quiet Buds line total").textContent,
    "₹6,998",
  );
  assert.ok(within(card).getByText("Trail Runner"));
  assert.ok(within(card).getByText("1 × ₹8,999"));
  assert.equal(
    within(card).getByLabelText("Trail Runner line total").textContent,
    "₹8,999",
  );
  assert.equal(within(card).getByLabelText("Items subtotal").textContent, "₹15,997");
  assert.equal(within(card).getByLabelText("Discount").textContent, "₹0");
  assert.equal(within(card).getByLabelText("Shipping").textContent, "₹0");
  assert.equal(within(card).getByLabelText("Tax").textContent, "₹0");
  assert.equal(within(card).getByLabelText("Total to pay").textContent, "₹15,997");
  assert.deepEqual(requests, [
    "GET /api/agent/conversation",
    "GET /api/cart",
    "POST /api/checkout/proposal",
  ]);
});

test("the Checkout Proposal names the Cart version it describes and when it expires", async (t) => {
  const { view, user, within, openCart } = await openStorefront(t, browser(), {
    routes: { proposal: () => Response.json({ data: preparedEntry() }) },
  });

  const drawer = await openCart();
  await user.click(within(drawer).getByRole("button", { name: "Check out" }));

  const card = await view.findByRole("region", { name: "Checkout proposal" });
  assert.ok(within(card).getByText("Prepared from Cart version 4"));
  assert.equal(
    within(card).getByLabelText("Proposal expiry").textContent,
    "Expires in 10 minutes",
  );
});

test("the Approval control names the exact amount and its Razorpay Test consequence", async (t) => {
  const { view, user, within, openCart } = await openStorefront(t, browser(), {
    routes: { proposal: () => Response.json({ data: preparedEntry() }) },
  });

  const drawer = await openCart();
  await user.click(within(drawer).getByRole("button", { name: "Check out" }));

  const card = await view.findByRole("region", { name: "Checkout proposal" });
  assert.ok(
    within(card).getByRole("button", {
      name: "Approve and pay ₹15,997 with Razorpay Test Checkout",
    }),
  );
  assert.ok(
    within(card).getByText(
      "Payment always needs your explicit approval. Nothing is sent to Razorpay until you approve the exact amount below.",
    ),
  );
  assert.ok(within(card).getByText("Test Mode — no real charge is made."));
  assert.ok(
    within(card).getByText(
      "This checkout reserves no inventory and does not arrange fulfilment.",
    ),
  );
});

test("a Cart that is not ready explains the blocker instead of asking for Approval", async (t) => {
  const emptyCart = {
    ...readyCart,
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
  };
  const { view, user, within, openCart } = await openStorefront(t, browser(), {
    cart: emptyCart,
    routes: {
      proposal: () =>
        Response.json({
          data: {
            ...preparedEntry(),
            preparation: {
              status: "NOT_READY",
              readiness: {
                status: "NOT_READY",
                cart: emptyCart,
                blockers: [
                  {
                    code: "CART_EMPTY",
                    message:
                      "Add at least one Product to the Cart before checkout.",
                  },
                ],
              },
            },
          },
        }),
    },
  });

  const drawer = await openCart();
  await user.click(within(drawer).getByRole("button", { name: "Check out" }));

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(
    within(card).getByText("Add at least one Product to the Cart before checkout."),
  );
  assert.equal(view.queryByRole("region", { name: "Checkout proposal" }), null);
  assert.equal(
    view.queryByRole("button", { name: /^Approve and pay/ }),
    null,
  );
});

test("changing the Cart retires an unapproved Checkout Proposal", async (t) => {
  const changedCart = {
    ...readyCart,
    version: 5,
    items: [readyCart.items[1]],
    totalQuantity: 1,
    subtotalMinor: 899900,
  };
  const { view, user, within, openCart } = await openStorefront(t, browser(), {
    routes: {
      proposal: () => Response.json({ data: preparedEntry() }),
      cartCommand: () => Response.json({ data: changedCart }),
    },
  });

  const drawer = await openCart();
  await user.click(within(drawer).getByRole("button", { name: "Check out" }));
  const card = await view.findByRole("region", { name: "Checkout proposal" });
  assert.ok(
    within(card).getByRole("button", {
      name: "Approve and pay ₹15,997 with Razorpay Test Checkout",
    }),
  );

  // The Cart drawer reopens on a Cart whose version has moved past the one the
  // proposal describes, exactly as another tab's mutation would leave it.
  await user.click(view.getByRole("button", { name: "Cart · 3" }));
  await user.click(
    within(view.getByRole("dialog", { name: "Your Cart" })).getByRole("button", {
      name: "Remove Quiet Buds from Cart",
    }),
  );

  assert.ok(await within(card).findByText("Outdated"));
  assert.equal(
    within(card).queryByRole("button", { name: /^Approve and pay/ }),
    null,
  );
  assert.ok(
    within(card).getByText(
      "The Cart changed after this proposal. Check out again for a current amount.",
    ),
  );
});

test("a reloaded Transcript recovers a checkout already in flight", async (t) => {
  const entry = preparedEntry();
  const proposalId =
    entry.preparation.status === "PREPARED"
      ? entry.preparation.proposal.id
      : "";
  const dom = browser();
  const { installBrowser } = await import("./_test/browser");
  installBrowser(dom);

  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/agent/conversation") {
      return Response.json({
        data: {
          conversationId: "41000000-0000-4000-8000-000000000001",
          transcript: [entry],
          contextSummary: null,
          revision: 1,
        },
      });
    }
    if (url === "/api/cart") return Response.json({ data: readyCart });
    if (url === `/api/checkout/${proposalId}`) {
      return Response.json({ data: reloadedStatus });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const [testingLibrary, React, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("react"),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  const card = await view.findByRole("region", { name: "Checkout status" });
  assert.ok(testingLibrary.within(card).getByText("Paid in Razorpay Test Mode"));
  assert.equal(view.queryByRole("button", { name: /^Approve and pay/ }), null);
});
