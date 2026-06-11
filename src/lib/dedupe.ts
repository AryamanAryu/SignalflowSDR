/**
 * Normalizes a domain or URL into a clean, comparable key used to prevent
 * duplicate companies. Examples:
 *   "https://www.Stripe.com/about" -> "stripe.com"
 *   "Stripe.com"                   -> "stripe.com"
 *   ""                             -> null
 */
export function normalizeDomain(input?: string | null): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^https?:\/\//, ""); // drop protocol
  s = s.split(/[/?#]/)[0]; // drop path/query/hash
  s = s.replace(/^www\./, ""); // drop leading www.
  s = s.replace(/\.+$/, ""); // drop trailing dots

  return s || null;
}
