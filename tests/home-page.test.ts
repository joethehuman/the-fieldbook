import test from "node:test";
import assert from "node:assert/strict";
import { homePath } from "../lib/navigation";
import { defaultSettings } from "../lib/settings";

test("home page selection defaults to Courses for existing installations", () => {
  assert.equal(homePath(), "/courses");
  assert.equal(homePath({}), "/courses");
  for (const homePage of ["updates", "courses", "docs"] as const)
    assert.equal(homePath({ ...defaultSettings, homePage }), `/${homePage}`);
});
