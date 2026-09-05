import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { installBrowser, scrollTranscriptTo } from "./_test/browser";
import {
  APPROVE_CONTROL,
  openStorefront,
  paymentAttemptTicket,
  preparedEntry,
  statusView,
  storefrontWindow,
} from "./_test/checkout";
import type { CurrentConversation } from "@/modules/agent/conversation-state";

/**
 * Proves the Conversation Transcript follows the Conversation.
 *
 * The Transcript is scrolled through the window and has no scroll container,
 * so what a test can honestly observe is the scroll the Storefront asked the
 * window for — and, just as often, the one it did not ask for. A Customer
 * re-reading an earlier Recommendation being pulled back down is the defect
 * these cases exist to keep out.
 */

/** A Transcript taller than the viewport, with the Customer at its bottom. */
const AT_THE_BOTTOM = { documentHeight: 6000, scrollY: 6000 - 768 };

/** The same Transcript, with the Customer scrolled back to an earlier Turn. */
const RE_READING_EARLIER = { documentHeight: 6000, scrollY: 0 };

function conversationWith(turns: number): CurrentConversation {
  return {
    conversationId: "41000000-0000-4000-8000-000000000001",
    transcript: Array.from({ length: turns }, (_, index) => ({
      id: `turn-${index}`,
      customerMessage: `Message ${index}`,
      result: {
        status: "COMPLETED",
        message: `Answer ${index}`,
        products: [],
      },
      error: null,
    })),
    contextSummary: null,
  } as unknown as CurrentConversation;
}

/**
 * Renders the Storefront with a stubbed Conversation and Cart read, and one
 * Conversation Turn the test resolves when it chooses.
 */
async function openTranscript(
  t: TestContext,
  dom: JSDOM,
  options: { resumed?: CurrentConversation } = {},
) {
  const scrolls = installBrowser(dom);
  let resolveTurn!: (response: Response) => void;
  const turnResponse = new Promise<Response>((resolve) => {
    resolveTurn = resolve;
  });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/agent/conversation") {
      return Response.json({ data: options.resumed ?? null });
    }
    if (url === "/api/cart" && !init?.method) {
      return Response.json({
        data: {
          id: null,
          version: 0,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
          currency: "INR",
        },
      });
    }
    if (url === "/api/agent/message") return turnResponse;
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  };

  const [testingLibrary, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      brandDescription: "Everyday footwear and accessories.",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  return {
    view,
    scrolls,
    async say(message: string) {
      await user.type(
        await view.findByRole("textbox", { name: /message/i }),
        message,
      );
      await user.click(await view.findByRole("button", { name: /send/i }));
    },
    answer(message: string) {
      resolveTurn(
        Response.json({
          data: {
            status: "COMPLETED",
            conversationId: "41000000-0000-4000-8000-000000000001",
            message,
            products: [],
          },
        }),
      );
    },
  };
}

test("sending a message scrolls the Transcript to what the Customer just sent", async (t) => {
  const dom = storefrontWindow();
  const transcript = await openTranscript(t, dom);
  scrollTranscriptTo(dom, RE_READING_EARLIER);
  const before = transcript.scrolls.length;

  await transcript.say("Show me running shoes");

  assert.ok(transcript.scrolls.length > before);
  assert.equal(
    transcript.scrolls.at(-1)?.top,
    dom.window.document.documentElement.scrollHeight,
  );
});

test("an answer arriving while the Customer re-reads an earlier Turn leaves them there", async (t) => {
  const dom = storefrontWindow();
  const transcript = await openTranscript(t, dom);
  await transcript.say("Show me running shoes");
  scrollTranscriptTo(dom, RE_READING_EARLIER);
  const before = transcript.scrolls.length;

  transcript.answer("Here is a shortlist.");
  await transcript.view.findByText("Here is a shortlist.");

  assert.equal(transcript.scrolls.length, before);
});

test("an answer arriving while the Customer waits at the bottom is scrolled into view", async (t) => {
  const dom = storefrontWindow();
  const transcript = await openTranscript(t, dom);
  await transcript.say("Show me running shoes");
  scrollTranscriptTo(dom, AT_THE_BOTTOM);
  const before = transcript.scrolls.length;

  transcript.answer("Here is a shortlist.");
  await transcript.view.findByText("Here is a shortlist.");

  assert.ok(transcript.scrolls.length > before);
});

test("a resumed Conversation lands at the most recent Turn without gliding through it", async (t) => {
  const dom = storefrontWindow();
  const transcript = await openTranscript(t, dom, {
    resumed: conversationWith(3),
  });

  await transcript.view.findByText("Answer 2");

  assert.equal(transcript.scrolls.length, 1);
  assert.equal(transcript.scrolls[0].behavior, "instant");
  assert.equal(
    transcript.scrolls[0].top,
    dom.window.document.documentElement.scrollHeight,
  );
});

test("the Check out control scrolls to its entry, and a status change on that card does not", async (t) => {
  const dom = storefrontWindow();
  const opened = await openStorefront(t, dom, {
    launch: () => ({ outcome: "DISMISSED" as const }),
    routes: {
      proposal: () => Response.json({ data: preparedEntry() }),
      approval: () => Response.json({ data: statusView() }),
      paymentAttempt: paymentAttemptTicket,
      callback: () =>
        Response.json({
          data: statusView({
            status: "PAYMENT_PENDING",
            launchesUsed: 1,
            launchesRemaining: 2,
          }),
        }),
    },
  });

  const drawer = await opened.openCart();
  scrollTranscriptTo(dom, RE_READING_EARLIER);
  const beforeCheckout = opened.scrolls.length;
  await opened.user.click(
    opened.within(drawer).getByRole("button", { name: "Check out" }),
  );
  await opened.view.findByRole("region", { name: "Checkout proposal" });

  assert.ok(opened.scrolls.length > beforeCheckout);

  // Approving replaces the proposal card with the status card in place. The
  // Customer is reading that card, so the page must stay where it is.
  scrollTranscriptTo(dom, RE_READING_EARLIER);
  const beforeApproval = opened.scrolls.length;
  await opened.user.click(
    opened.view.getByRole("button", { name: APPROVE_CONTROL }),
  );
  await opened.view.findByRole("region", { name: "Checkout status" });

  assert.equal(opened.scrolls.length, beforeApproval);
});
