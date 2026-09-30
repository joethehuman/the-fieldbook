import test from "node:test";
import assert from "node:assert/strict";
import { bulkSchema } from "../../server/bulk-schema";
test("bulk API validates bounded, distinct revision-checked targets and entity actions", () => {
  const item = { id: "00000000-0000-4000-8000-000000000001", expected: 1 };
  const request = { entity: "content", operation: "delete", items: [item] };
  assert(bulkSchema.safeParse(request).success);
  assert(!bulkSchema.safeParse({ ...request, items: [item, item] }).success);
  assert(
    !bulkSchema.safeParse({ ...request, items: Array(101).fill(item) }).success,
  );
  assert(
    !bulkSchema.safeParse({ ...request, items: [{ ...item, expected: -1 }] })
      .success,
  );
  assert(
    !bulkSchema.safeParse({ ...request, entity: "user", operation: "publish" })
      .success,
  );
  assert(!bulkSchema.safeParse({ ...request, items: [] }).success);
});
