/**
 * The boundary between the Storefront and Razorpay's managed Checkout.
 *
 * Razorpay collects every card, UPI, wallet, contact detail, and OTP inside its
 * own hosted interface. The Storefront hands it a verified Provider Order and
 * receives back only an outcome and the identifiers needed to verify that
 * outcome on the server, so payment instruments never reach the Conversation,
 * the Commerce Agent, or any Audit Event.
 *
 * The launcher is an injected capability rather than a direct script call, so
 * a Storefront behavior test can prove the Customer's journey with a
 * contract-faithful fake instead of a network and a credential.
 */

export type CheckoutLaunchRequest = {
  orderId: string;
  keyId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  brandName: string;
};

/**
 * What one Payment Attempt produced.
 *
 * A dismissal is its own outcome, never a failed charge: the Customer closed
 * the managed Checkout, and the timeline must say so. Every identifier in a
 * completed result is an untrusted browser claim until the server verifies it.
 */
export type CheckoutLaunchResult =
  | {
      outcome: "COMPLETED";
      paymentId: string;
      providerOrderId: string;
      signature: string;
    }
  | { outcome: "DISMISSED" }
  | { outcome: "FAILED"; description: string };

export type CheckoutLauncher = (
  request: CheckoutLaunchRequest,
) => Promise<CheckoutLaunchResult>;

const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayCheckout = {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
};

type RazorpayGlobal = {
  Razorpay: new (options: Record<string, unknown>) => RazorpayCheckout;
};

/**
 * Opens Razorpay's managed Test Checkout in the Customer's browser.
 *
 * Only the publishable Test key ID, the verified Provider Order, and the exact
 * amount cross into Razorpay's interface; the Test API secret and the webhook
 * secret stay on the server and are never referenced here. A closed modal
 * resolves as a dismissal rather than rejecting, so the Storefront can record
 * what actually happened.
 */
export const launchRazorpayCheckout: CheckoutLauncher = async (request) =>
  new Promise((resolve) => {
    void loadRazorpay()
      .then((razorpay) => {
        let settled = false;
        const settle = (result: CheckoutLaunchResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const checkout = new razorpay.Razorpay({
          key: request.keyId,
          order_id: request.providerOrderId,
          amount: request.amountMinor,
          currency: request.currency,
          name: request.brandName,
          description: "Razorpay Test Mode — no real charge is made.",
          retry: { enabled: false },
          modal: { ondismiss: () => settle({ outcome: "DISMISSED" }) },
          handler: (response: Record<string, string>) =>
            settle({
              outcome: "COMPLETED",
              paymentId: response.razorpay_payment_id,
              providerOrderId: response.razorpay_order_id,
              signature: response.razorpay_signature,
            }),
        });
        checkout.on("payment.failed", (payload) =>
          settle({
            outcome: "FAILED",
            description: failureDescription(payload),
          }),
        );
        checkout.open();
      })
      .catch(() =>
        resolve({
          outcome: "FAILED",
          description: "Razorpay Checkout could not be opened.",
        }),
      );
  });

/**
 * Reads a Customer-safe sentence out of Razorpay's failure payload.
 *
 * Only the provider's own description is kept. Nothing else from the payload
 * reaches the Storefront, so payment instrument data cannot leak into a
 * Conversation through a failure message.
 */
function failureDescription(payload: unknown): string {
  const description = (payload as { error?: { description?: unknown } })?.error
    ?.description;
  return typeof description === "string" && description.length > 0
    ? description
    : "Razorpay could not complete this test payment.";
}

let razorpayScript: Promise<RazorpayGlobal> | null = null;

function loadRazorpay(): Promise<RazorpayGlobal> {
  const existing = globalThis as unknown as Partial<RazorpayGlobal>;
  if (existing.Razorpay) {
    return Promise.resolve(globalThis as unknown as RazorpayGlobal);
  }
  razorpayScript ??= new Promise<RazorpayGlobal>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve(globalThis as unknown as RazorpayGlobal);
    script.onerror = () => {
      razorpayScript = null;
      reject(new Error("Razorpay Checkout script failed to load."));
    };
    document.head.append(script);
  });
  return razorpayScript;
}
