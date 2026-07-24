/**
 * Turns a failed order placement into something the shopper can act on.
 *
 * place_order() raises specific, user-fixable errors ("insufficient stock for
 * X", "all items in an order must belong to the same shop"), and the Edge
 * Function forwards them verbatim. Flattening all of it to "check your
 * connection" — as the pages used to — tells someone whose item just sold out
 * to retry something that will never work.
 */
export function orderErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  if (!raw || /failed to fetch|network ?error|load failed/i.test(raw)) {
    return "Couldn't reach the server — check your connection and try again.";
  }
  if (msg.includes("captcha")) {
    // The widget reissues a challenge on failure, so a retry is genuinely worth it.
    return "Couldn't verify you're human — please try again.";
  }
  if (msg.includes("insufficient stock")) {
    // Keep the product name the server named.
    const item = raw.split(/insufficient stock for /i)[1]?.trim();
    return item
      ? `Sorry — "${item}" just went out of stock. Adjust your cart and try again.`
      : "One of your items just went out of stock. Adjust your cart and try again.";
  }
  if (msg.includes("same shop")) {
    return "Your cart has items from more than one shop — check out one shop at a time.";
  }
  if (msg.includes("quantity too large") || msg.includes("too many items")) {
    return "That's more than we can process in one order — please reduce the quantity.";
  }
  if (msg.includes("product not found")) {
    return "One of your items is no longer available. Remove it and try again.";
  }
  if (msg.includes("name and phone")) {
    return "Please enter your name and phone number.";
  }
  if (msg.includes("discount code")) {
    // Deliberately doesn't say why (expired vs. cap reached vs. already used)
    // — see place_order's comment on discount codes (migration 0035).
    return "Your discount code is no longer valid for this order. Remove it to check out at full price, or try again.";
  }
  if (msg.includes("shop is not accepting orders")) {
    return "This shop isn't accepting orders right now.";
  }
  return "Couldn't place your order. Please try again.";
}
