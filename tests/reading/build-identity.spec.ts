import { test, expect } from "@playwright/test";

test("each running application serves its own build marker and public favicon", async ({
  request,
}) => {
  for (const [origin, kind] of [
    ["http://localhost:3131", "installed"],
    ["http://127.0.0.1:3132", "demo"],
  ]) {
    const response = await request.get(`${origin}/fieldbook-build.json`);
    expect(response.status()).toBe(200);
    const marker = await response.json();
    expect(marker.kind).toBe(kind);
    expect(
      marker.revision === null || typeof marker.revision === "string",
    ).toBe(true);
    const asset = await request.get(`${origin}/favicon.svg`);
    expect(asset.status()).toBe(200);
    expect(await asset.text()).toContain("<svg");
  }
});
