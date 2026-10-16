/**
 * Server functions that answer without a signed-in user — on purpose, each
 * with its reason. Every other server function must carry the `requireUser`
 * or `allowReporter` middleware; `auth-by-construction.test.ts` fails the
 * build otherwise, and also when an entry here is stale.
 *
 * Adding a name here is a security decision: say in the reason why the
 * function must work before sign-in, and what it does to stay safe then.
 */
export const PUBLIC_SERVER_FNS: Record<string, string> = {
  registerUser:
    "Creates the first administrator of a fresh installation; refuses once any user exists.",
  loginUser: "Sign-in itself — there is no session yet. Rate-limited.",
  verifyLoginCode: "The second sign-in factor, before the session exists.",
  resendLoginCode: "Resends the second-factor code during sign-in. Rate-limited.",
  logoutUser: "Ends the caller's own session; harmless without one.",
  getCurrentUser: "Tells the app whether anyone is signed in; returns null otherwise.",
  askPasswordReset: "Starts a password reset; answers the same whether the address exists or not.",
  verifyResetToken: "Checks a reset link's token before the form is shown.",
  finishPasswordReset: "Sets a new password with a valid, single-use reset token.",
  setMyLocale:
    "Switches the interface language (a cookie) on the sign-in page; saved to the account only when signed in.",
};
