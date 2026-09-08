import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  loopbackRequest,
  assertRejectedInstall,
  assertEmptyWorkerBatch,
  cleanupResources,
} from "./smoke-safety.mjs";

test("a redirect cannot leave the explicit test request path", async (t) => {
  let redirectedRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/outside" });
      res.end();
    } else {
      redirectedRequests++;
      res.end("outside");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(loopbackRequest(base, "/redirect"));
  assert.equal(redirectedRequests, 0);
  assert.throws(() => loopbackRequest(base, "//external.invalid"));
  assert.throws(() => loopbackRequest("https://external.invalid", "/"));
});

test("installation rejection requires 403 and an unchanged uninitialized schema", () => {
  assertRejectedInstall(403, false, false);
  for (const status of [200, 400, 500, 503])
    assert.throws(() => assertRejectedInstall(status, false, false));
  assert.throws(() => assertRejectedInstall(403, false, true));
});

test("worker execution cannot pass on an error or an unexpected task", () => {
  assertEmptyWorkerBatch(200, { code: 0, data: { claimed: 0 } });
  assert.throws(() => assertEmptyWorkerBatch(500, { code: 500 }));
  assert.throws(() =>
    assertEmptyWorkerBatch(200, { code: 0, data: { claimed: 1 } }),
  );
});

test("cleanup continues after an error and does not remove a foreign resource", () => {
  const calls = [];
  const docker = (args) => {
    calls.push(args);
    if (args[0] === "inspect") {
      if (args[1] === "broken") throw Error("inspect failed");
      return JSON.stringify([
        {
          Config: {
            Labels: {
              "vozeb.release-test": args[1] === "foreign" ? "other" : "owned",
            },
          },
        },
      ]);
    }
    if (args[0] === "network" && args[1] === "inspect")
      return JSON.stringify([{ Labels: { "vozeb.release-test": "owned" } }]);
    return "";
  };
  assert.throws(
    () =>
      cleanupResources(docker, ["good", "foreign", "broken"], "owned", true),
    AggregateError,
  );
  assert.deepEqual(
    calls.filter((args) => args[0] === "rm"),
    [["rm", "--force", "--volumes", "good"]],
  );
  assert.ok(calls.some((args) => args[0] === "network" && args[1] === "rm"));
});
