/**
 * The deterministic fault that makes recovery from an Unknown Provider Outcome
 * demonstrable.
 *
 * Recovering from a lost provider response is the hardest promise this checkout
 * makes, so it must be provable on demand rather than only when a real network
 * happens to fail. The fault dispatches one Provider Order creation and discards
 * its response, exactly once, which is the shape of the failure that would
 * otherwise be untestable.
 *
 * It is gated on the environment alone and deliberately never on anything a
 * Customer can influence: no request header, no query parameter, no Cart value,
 * and no Conversation text reaches this decision. A production build cannot arm
 * it at all, whatever the environment says.
 *
 * The environment is a parameter rather than a global read, and this module
 * imports no database and no credential, so the gate itself can be judged by a
 * hermetic test. The composition root is the only place that hands it the real
 * `process.env`.
 */

const CHECKOUT_FAULT_LOSE_WRITE_RESPONSE = "LOSE_CREATE_ORDER_RESPONSE";

/**
 * Builds the fault the Razorpay adapter consults before returning a response.
 *
 * Each call returns a fresh injector with its own single loss, so one armed
 * deployment demonstrates recovery on every checkout rather than only on the
 * first one to reach the provider.
 *
 * @param environment - The process environment to judge.
 * @returns A one-shot injector, or `undefined` when the fault is disarmed.
 */
export function createCheckoutFaultInjector(
  environment: Record<string, string | undefined>,
): (() => boolean) | undefined {
  if (
    environment.NODE_ENV === "production" ||
    environment.CHECKOUT_FAULT !== CHECKOUT_FAULT_LOSE_WRITE_RESPONSE
  ) {
    return undefined;
  }
  let remaining = 1;
  return () => remaining-- > 0;
}
