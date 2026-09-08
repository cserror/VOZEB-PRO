import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("last image override removes build and retains runtime configuration", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const image = `ghcr.io/cserror/vozeb-pro@sha256:${"a".repeat(64)}`;
  const fixture = `services:
  app:
    image: previous:fixture
    build: {context: .}
    environment: {REFERENCE_ONLY: fixture}
    mem_limit: 1073741824
    cpus: 1.25
    ports: ["127.0.0.1:13010:3000"]
    volumes: ["data:/app/web/.data"]
    networks: [internal]
  generation-worker:
    image: previous:fixture
    build: {context: .}
    mem_limit: 268435456
    cpus: 0.5
    environment: {VOZEB_PRO_WORKER_API_ORIGIN: "http://app:3000"}
    networks: [internal]
volumes: {data: {}}
networks: {internal: {internal: true}}
`;
  const raw = execFileSync(
    "docker",
    [
      "compose",
      "--project-name",
      "vozeb-release-config-test",
      "--project-directory",
      root,
      "--env-file",
      "/dev/null",
      "-f",
      "-",
      "-f",
      "deploy/docker-compose.image.yml",
      "config",
      "--format",
      "json",
    ],
    {
      cwd: root,
      input: fixture,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        VOZEB_PRO_IMAGE: image,
      },
    },
  );
  const merged = JSON.parse(raw);
  const { app, "generation-worker": worker } = merged.services;
  for (const service of [app, worker]) {
    assert.equal(service.image, image);
    assert.equal(service.build, undefined);
    assert.ok(Object.hasOwn(service.networks, "internal"));
  }
  assert.equal(Number(app.mem_limit), 1073741824);
  assert.equal(Number(app.cpus), 1.25);
  assert.equal(Number(worker.mem_limit), 268435456);
  assert.equal(Number(worker.cpus), 0.5);
  assert.equal(app.ports[0].host_ip, "127.0.0.1");
  assert.equal(app.ports[0].published, "13010");
  assert.equal(app.volumes[0].source, "data");
  assert.equal(app.environment.REFERENCE_ONLY, "fixture");
  assert.equal(
    worker.environment.VOZEB_PRO_WORKER_API_ORIGIN,
    "http://app:3000",
  );
});
