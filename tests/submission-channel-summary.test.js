import test from "node:test";
import assert from "node:assert/strict";
import { summarize, submissionChannels } from "../src/domain.js";
const request = (date) => ({
  date,
  category: "0",
  status: "pending",
  payments: [],
});
const person = (channels, dates = ["2026-10-01"]) => ({
  submissionChannels: channels,
  requests: dates.map(request),
  village: 1,
});
test("channel donut counts each person once and both channels only in the combined group", () => {
  const result = summarize(
    [
      person([submissionChannels[0]], ["2026-10-01", "2026-10-10"]),
      person([submissionChannels[1]]),
      person(submissionChannels),
      person([]),
      person(undefined),
      person(submissionChannels, ["2026-09-30"]),
      person(submissionChannels, ["2026-11-01"]),
    ],
    "2026-10-01",
    "2026-10-31",
  );
  assert.deepEqual(result.submissionChannels, {
    care: 1,
    hotline: 1,
    both: 1,
    unspecified: 2,
  });
  assert.equal(result.people, 5);
  assert.equal(
    Object.values(result.submissionChannels).reduce((a, b) => a + b, 0),
    result.people,
  );
});
test("channel summary handles an empty period and includes its boundary dates", () => {
  assert.deepEqual(
    summarize([], "2026-10-01", "2026-10-31").submissionChannels,
    { care: 0, hotline: 0, both: 0, unspecified: 0 },
  );
  assert.deepEqual(
    summarize(
      [
        person(submissionChannels, ["2026-10-01"]),
        person(submissionChannels, ["2026-10-31"]),
      ],
      "2026-10-01",
      "2026-10-31",
    ).submissionChannels,
    { care: 0, hotline: 0, both: 2, unspecified: 0 },
  );
});
