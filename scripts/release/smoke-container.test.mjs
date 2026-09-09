import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { containerRequest, cleanupResources } from "./smoke-safety.mjs";

test(
  "HTTP verification works on an internal Docker network without host ports",
  {
    skip: !process.env.VOZEB_SMOKE_TEST_IMAGE,
  },
  async () => {
    const context = process.env.VOZEB_SMOKE_TEST_CONTEXT || "default";
    const docker = (args, variables = {}) =>
      execFileSync("docker", ["--context", context, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 25_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ...variables },
      }).trim();
    const endpoint = JSON.parse(docker(["context", "inspect", context]))[0]
      .Endpoints.docker.Host;
    assert.ok(endpoint.startsWith("unix://") && !process.env.DOCKER_HOST);
    // Inspect first: this test never pulls an image or mounts existing data.
    const image = JSON.parse(
      docker(["image", "inspect", process.env.VOZEB_SMOKE_TEST_IMAGE]),
    )[0].Id;
    const owner = `vozeb-http-test-${randomUUID()}`;
    const containers = [];
    let networkCreated = false;
    try {
      docker([
        "network",
        "create",
        "--internal",
        "--label",
        `vozeb.release-test=${owner}`,
        owner,
      ]);
      networkCreated = true;
      const server = `
      let escaped = 0;
      require("node:http").createServer(async (req, res) => {
        if (req.url === "/redirect") { res.writeHead(302, { location: "/outside" }); return res.end(); }
        if (req.url === "/outside") { escaped++; return res.end("outside"); }
        if (req.url === "/counts") return res.end(String(escaped));
        if (req.url === "/empty") { res.writeHead(204); return res.end(); }
        if (req.url === "/binary") return res.end(Buffer.from([0, 127, 128, 255]));
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        res.setHeader("set-cookie", ["session=fixture; HttpOnly", "csrf=fixture"]);
        res.end(JSON.stringify({ method: req.method, body: Buffer.concat(chunks).toString(), authorization: req.headers.authorization, cookie: req.headers.cookie }));
      }).listen(3000, "0.0.0.0");
    `;
      const container = docker([
        "create",
        "--name",
        owner,
        "--label",
        `vozeb.release-test=${owner}`,
        "--network",
        owner,
        "--memory",
        "64m",
        "--cpus",
        "0.25",
        "--entrypoint",
        "node",
        image,
        "-e",
        server,
      ]);
      containers.push(container);
      docker(["start", container]);
      const state = JSON.parse(docker(["inspect", container]))[0];
      assert.equal(state.State.Running, true);
      assert.ok(
        !Object.values(state.NetworkSettings.Ports).some(
          (ports) => ports?.length,
        ),
      );
      const request = (path, options) =>
        containerRequest(docker, container, path, options);
      const response = await request("/", {
        method: "POST",
        headers: {
          authorization: "Bearer fixture",
          cookie: "session=fixture",
          "content-type": "application/json",
        },
        body: JSON.stringify({ test: true }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.headers.getSetCookie(), [
        "session=fixture; HttpOnly",
        "csrf=fixture",
      ]);
      assert.deepEqual(await response.json(), {
        method: "POST",
        body: '{"test":true}',
        authorization: "Bearer fixture",
        cookie: "session=fixture",
      });
      assert.deepEqual(
        Buffer.from(await (await request("/binary")).arrayBuffer()),
        Buffer.from([0, 127, 128, 255]),
      );
      assert.equal((await request("/empty")).status, 204);
      await assert.rejects(request("/redirect"));
      await assert.rejects(request("//external.invalid"));
      assert.equal(await (await request("/counts")).text(), "0");
    } finally {
      cleanupResources(docker, containers, owner, networkCreated);
    }
  },
);
