export function isAbsentSession(error: { name?: string; code?: string }) {
  return (
    error.name === "AuthSessionMissingError" ||
    [
      "session_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
    ].includes(error.code || "")
  );
}
