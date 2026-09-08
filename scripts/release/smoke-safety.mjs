import assert from "node:assert/strict";

export function loopbackRequest(base, path, options = {}) {
  const origin = new URL(base);
  assert.ok(
    origin.protocol === "http:" &&
      origin.hostname === "127.0.0.1" &&
      origin.port,
  );
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  const url = new URL(path, origin);
  assert.equal(url.origin, origin.origin);
  return fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

export function assertRejectedInstall(status, schemaBefore, schemaAfter) {
  assert.equal(status, 403);
  assert.equal(schemaBefore, false);
  assert.equal(schemaAfter, false);
}

export function assertEmptyWorkerBatch(status, payload) {
  assert.equal(status, 200);
  assert.equal(payload.code, 0);
  assert.equal(payload.data.claimed, 0);
}

export function cleanupResources(docker, containers, owner, networkCreated) {
  const errors = [];
  for (const id of [...containers].reverse()) {
    try {
      const state = JSON.parse(docker(["inspect", id]))[0];
      assert.equal(state.Config.Labels["vozeb.release-test"], owner);
      docker(["rm", "--force", "--volumes", id]);
    } catch (error) {
      errors.push(error);
    }
  }
  if (networkCreated) {
    try {
      const network = JSON.parse(docker(["network", "inspect", owner]))[0];
      assert.equal(network.Labels["vozeb.release-test"], owner);
      docker(["network", "rm", owner]);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      "Disposable resource cleanup did not complete",
    );
}
