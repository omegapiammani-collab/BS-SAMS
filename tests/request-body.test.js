import test from "node:test";
import assert from "node:assert/strict";
import { readJsonObject, RequestBodyError } from "../server/request-body.js";
const request = (body) =>
  new Request("https://example.test/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
test("API JSON boundary accepts records and rejects malformed or non-object bodies", async () => {
  assert.deepEqual(
    await readJsonObject(request('{"name":"ทดสอบ","items":[]}')),
    { name: "ทดสอบ", items: [] },
  );
  for (const body of ["null", "[]", "1", '"text"', "{", ""])
    await assert.rejects(
      readJsonObject(request(body)),
      (error) => error instanceof RequestBodyError && error.status === 400,
    );
});
test("JSON body limit counts actual UTF-8 bytes without trusting Content-Length", async () => {
  await assert.rejects(
    readJsonObject(request(JSON.stringify({ text: "ก".repeat(340000) }))),
    (error) => error instanceof RequestBodyError && error.status === 413,
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xff]));
      controller.close();
    },
  });
  await assert.rejects(
    readJsonObject(
      new Request("https://example.test", {
        method: "POST",
        body: stream,
        duplex: "half",
      }),
    ),
    (error) => error.status === 400,
  );
});
