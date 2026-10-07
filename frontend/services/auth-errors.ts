import {
  ACKNOWLEDGEMENT_FAILED_CODE,
  AccountApiError,
  waitPhrase,
} from "./account-api";

export type SignInMode = "login" | "register";

const UNEXPECTED = "Something unexpected went wrong. Try again in a moment.";
const UNAVAILABLE =
  "The SewnCovers service may be waking up or temporarily unavailable. Wait a moment and try again.";

/**
 * User-facing wording for a failed sign-in or account creation. It maps the
 * status and stable error code, never the raw API message, so wording like
 * "Resource not found." cannot reach the screen.
 *
 * The API deliberately answers an existing email on registration with the
 * same 401 as a wrong passphrase, so those messages must not confirm that an
 * account exists.
 */
export function signInErrorMessage(error: unknown, mode: SignInMode): string {
  if (!(error instanceof AccountApiError)) return UNEXPECTED;

  if (error.code === ACKNOWLEDGEMENT_FAILED_CODE) {
    return "Your account was created, but the terms acknowledgement could not be saved. Sign in with the same email and passphrase to continue.";
  }
  if (error.code === "network_error" || error.code === "timeout") {
    return UNAVAILABLE;
  }

  switch (error.status) {
    case 401:
      return mode === "register"
        ? "We couldn't create an account with those details. If you already have one, sign in instead."
        : "That email and passphrase don't match an account. Check them and try again.";
    case 404:
      return "Accounts aren't available on the SewnCovers service right now. Your design is untouched, so you can keep going as a guest and try again later.";
    case 409:
      return "That email address is already in use. Sign in instead.";
    case 400:
    case 413:
    case 422:
      return "Check your email address and passphrase (12–128 characters), then try again.";
    case 429:
      return error.retryAfterSeconds === undefined
        ? "Too many attempts. Wait a few minutes before trying again."
        : `Too many attempts. Try again in ${waitPhrase(error.retryAfterSeconds)}.`;
    case 503:
      return error.code === "service_busy"
        ? "The SewnCovers service is busy right now. Wait a few seconds and try again."
        : UNAVAILABLE;
    case 408:
    case 502:
    case 504:
      return UNAVAILABLE;
    default:
      return UNEXPECTED;
  }
}
