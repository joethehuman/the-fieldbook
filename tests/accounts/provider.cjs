// Synthetic provider transport for browser tests only; never loaded by the application.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const raw =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  if (raw.startsWith("https://test.supabase.co/")) {
    const local = raw.replace(
      "https://test.supabase.co",
      "http://127.0.0.1:3130",
    );
    return original(
      input instanceof Request ? new Request(local, input) : local,
      init,
    );
  }
  if (raw.startsWith("https://ai-gateway.vercel.sh/")) {
    const local = raw.replace(
      "https://ai-gateway.vercel.sh",
      "http://127.0.0.1:3130/gateway",
    );
    return original(
      input instanceof Request ? new Request(local, input) : local,
      init,
    );
  }
  return original(input, init);
};
