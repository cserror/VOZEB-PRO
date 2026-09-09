import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  loopbackRequest,
  containerRequest,
  assertRejectedInstall,
  assertEmptyWorkerBatch,
  cleanupResources,
} from "./smoke-safety.mjs";

test("container requests preserve binary bodies and separate cookies without publishing a port", async () => {
  const calls = [];
  const bytes = Buffer.from([0, 127, 128, 255]);
  const docker = (args, variables) => {
    calls.push({ args, variables });
    return JSON.stringify({
      status: 200,
      headers: [
        ["set-cookie", "session=fixture; HttpOnly"],
        ["set-cookie", "csrf=fixture"],
        ["content-type", "application/octet-stream"],
      ],
      body: bytes.toString("base64"),
    });
  };
  const options = {
    method: "POST",
    headers: { authorization: "Bearer fixture" },
    body: JSON.stringify({ test: true }),
  };
  const response = await containerRequest(
    docker,
    "fixture-container",
    "/check",
    options,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers.getSetCookie(), [
    "session=fixture; HttpOnly",
    "csrf=fixture",
  ]);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.deepEqual(calls[0].args.slice(0, 6), [
    "exec",
    "-e",
    "VOZEB_RELEASE_REQUEST",
    "fixture-container",
    "node",
    "--input-type=module",
  ]);
  assert.deepEqual(JSON.parse(calls[0].variables.VOZEB_RELEASE_REQUEST), {
    path: "/check",
    options,
  });
  assert.ok(!calls[0].args.join(" ").includes("Bearer fixture"));
});

test("container requests preserve empty responses and propagate transport failures", async () => {
  const response = await containerRequest(
    () => JSON.stringify({ status: 204, headers: [], body: null }),
    "fixture",
    "/empty",
  );
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  await assert.rejects(
    containerRequest(
      () => {
        throw Error("transport failed");
      },
      "fixture",
      "/",
    ),
    /transport failed/,
  );
});

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
