export function isAbsentSession(error: { name?: string; code?: string }) {
  return (
    error.name === "AuthSessionMissingError" ||
    [
      "session_not_found",
      "user_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
    ].includes(error.code || "")
  );
}

/** A provider lock is an account denial, never an absent session or an outage. */
export function isInactiveIdentity(error: { code?: string }) {
  return error.code === "user_banned";
}
