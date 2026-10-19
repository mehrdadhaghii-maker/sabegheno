/**
 * Ontime24 Payment API (کیف پول، وام، قلک) — NOT YET IMPLEMENTED.
 *
 * The docs you sent only list this microservice by name; they don't include
 * its endpoint paths or request/response schemas the way IdentityProvider's
 * SendCode/Login are documented. Once you send that (its own PDF, or a
 * Swagger export/link for "Payment.API - 1.0"), this is the one file that
 * needs filling in.
 *
 * Why this matters for scoring: wallet balance trends, loan (وام) history,
 * and piggy-bank (قلک) saving behavior from Ontime24 are exactly the kind
 * of alternative-credit signal the frontend already mocks as the
 * "آنتایم۲۴" provider in altCredit — so this is high-value once available.
 *
 * Expected eventual shape (adjust once real docs arrive):
 * {
 *   walletBalance: number,
 *   activeLoans: [{ amount: number, remaining: number, delayDays: number }],
 *   savingsBehavior: { regular: boolean, monthlyAverage: number },
 * }
 */
const { ontime24Request } = require("./ontime24Client");

async function fetchWalletSummary(_mobileOrToken) {
  throw new Error(
    "Payment API endpoints are not documented yet — send the Payment.API " +
      "Swagger/docs and this function gets implemented against it."
  );
}

module.exports = { fetchWalletSummary };
