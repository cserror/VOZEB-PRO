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

export async function containerRequest(docker, container, path, options = {}) {
  // Reuse the restricted HTTP client inside the app's network namespace.
  const script = `
    import assert from "node:assert/strict";
    const request = ${loopbackRequest.toString()};
    const { path, options } = JSON.parse(process.env.VOZEB_RELEASE_REQUEST);
    const response = await request("http://127.0.0.1:3000", path, options);
    const headers = [...response.headers].filter(([name]) => name !== "set-cookie");
    for (const cookie of response.headers.getSetCookie()) headers.push(["set-cookie", cookie]);
    const body = response.body === null ? null : Buffer.from(await response.arrayBuffer()).toString("base64");
    console.log(JSON.stringify({ status: response.status, headers, body }));
  `;
  const raw = await docker(
    [
      "exec",
      "-e",
      "VOZEB_RELEASE_REQUEST",
      container,
      "node",
      "--input-type=module",
      "-e",
      script,
    ],
    { VOZEB_RELEASE_REQUEST: JSON.stringify({ path, options }) },
  );
  const response = JSON.parse(raw);
  return new Response(
    response.body === null ? null : Buffer.from(response.body, "base64"),
    {
      status: response.status,
      headers: response.headers,
    },
  );
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
