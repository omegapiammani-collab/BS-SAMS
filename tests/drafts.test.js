import test from "node:test";
import assert from "node:assert/strict";
import { validateDraftData, DRAFT_TTL } from "../server/drafts.js";
test("drafts accept incomplete form data but reject malformed structures", () => {
  const p = { first: "", last: "", village: 1, disabilities: [], requests: [] };
  assert.equal(validateDraftData(p), true);
  assert.equal(DRAFT_TTL, 7 * 86400000);
  for (const bad of [
    null,
    [],
    { ...p, village: "1" },
    { ...p, requests: [null] },
    { ...p, disabilities: {} },
    { ...p, __dateDrafts: { birth: {} } },
  ])
    assert.equal(validateDraftData(bad), false);
  assert.equal(
    validateDraftData({ ...p, __dateDrafts: { birth: "31/02/2569" } }),
    true,
  );
});
