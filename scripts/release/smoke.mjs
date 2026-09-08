import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  loopbackRequest,
  assertRejectedInstall,
  assertEmptyWorkerBatch,
  cleanupResources,
} from "./smoke-safety.mjs";

const [image, postgresImage, output] = process.argv.slice(2);
assert.ok(
  image && output && /^postgres@sha256:[a-f0-9]{64}$/.test(postgresImage || ""),
  "Provide tested image, immutable PostgreSQL image and output path",
);
const owner = `vozeb-ci-${randomUUID()}`;
const containers = [];
let networkCreated = false;
const checks = [];
function docker(args, variables = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...variables },
  });
  assert.equal(
    result.status,
    0,
    `Docker ${args[0]} failed: ${result.error?.message || result.stderr}`,
  );
  return result.stdout.trim();
}
function create(name, args, variables = {}) {
  const id = docker(
    [
      "create",
      "--name",
      name,
      "--label",
      `vozeb.release-test=${owner}`,
      "--network",
      owner,
      ...args,
    ],
    variables,
  );
  containers.push(id);
  docker(["start", id]);
  return id;
}
async function eventually(operation) {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
    await delay(1000);
  }
  throw lastError;
}

try {
  const endpoint = JSON.parse(docker(["context", "inspect"]))[0].Endpoints
    .docker.Host;
  assert.ok(
    endpoint.startsWith("unix://") && !process.env.DOCKER_HOST,
    "Smoke tests require a local Unix-socket Docker context",
  );
  const inspected = JSON.parse(docker(["image", "inspect", image]))[0];
  assert.equal(`${inspected.Os}/${inspected.Architecture}`, "linux/amd64");
  docker(["image", "inspect", postgresImage]);
  docker([
    "network",
    "create",
    "--internal",
    "--label",
    `vozeb.release-test=${owner}`,
    owner,
  ]);
  networkCreated = true;
  const databasePassword = randomBytes(24).toString("hex");
  const installToken = randomBytes(32).toString("hex");
  const workerToken = randomBytes(32).toString("hex");
  const database = create(
    `${owner}-db`,
    [
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--network-alias",
      "database",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-e",
      "POSTGRES_PASSWORD",
      "-e",
      "POSTGRES_USER",
      "-e",
      "POSTGRES_DB",
      postgresImage,
    ],
    {
      POSTGRES_PASSWORD: databasePassword,
      POSTGRES_USER: "fixture",
      POSTGRES_DB: "fixture",
    },
  );
  await eventually(() =>
    docker(["exec", database, "pg_isready", "-U", "fixture", "-d", "fixture"]),
  );
  const variables = {
    VOZEB_PRO_DATABASE_PROVIDER: "postgres",
    DATABASE_URL: `postgres://fixture:${databasePassword}@database:5432/fixture`,
    VOZEB_PRO_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    VOZEB_PRO_INSTALL_TOKEN: installToken,
    VOZEB_PRO_MAINTENANCE_TOKEN: randomBytes(32).toString("hex"),
    VOZEB_PRO_WORKER_TOKEN: workerToken,
  };
  const app = create(
    `${owner}-app`,
    [
      "--memory",
      "2g",
      "--cpus",
      "2",
      "--network-alias",
      "app",
      "-p",
      "127.0.0.1::3000",
      ...Object.keys(variables).flatMap((key) => ["-e", key]),
      image,
    ],
    variables,
  );
  const port = JSON.parse(docker(["inspect", app]))[0].NetworkSettings.Ports[
    "3000/tcp"
  ][0].HostPort;
  const base = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => loopbackRequest(base, path, options);
  const post = (path, body) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  await eventually(async () =>
    assert.equal((await request("/api/health/live")).status, 200),
  );
  const schemaBefore = (await (await request("/api/install/status")).json())
    .install.database.schemaReady;
  const rejected = await post("/api/install/initialize", {
    installToken: "invalid",
  });
  const schemaAfter = (await (await request("/api/install/status")).json())
    .install.database.schemaReady;
  assertRejectedInstall(rejected.status, schemaBefore, schemaAfter);
  assert.equal(
    (await post("/api/install/initialize", { installToken })).status,
    200,
  );
  const password = `Fixture-${randomBytes(20).toString("hex")}`;
  const registered = await post("/api/auth/register", {
    username: "release-fixture",
    displayName: "Release Fixture",
    password,
    installToken,
  });
  assert.equal(registered.status, 200);
  assert.equal((await registered.json()).user.role, "admin");
  const cookie = registered.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  checks.push("fresh-install");
  assert.ok([401, 403].includes((await request("/api/admin/settings")).status));
  assert.equal(
    (await request("/api/admin/settings", { headers: { cookie } })).status,
    200,
  );
  checks.push("admin-auth");
  const html = await (await request("/login")).text();
  const asset = html.match(
    /(?:src|href)="(\/_next\/static\/[^"?]+(?:\?[^" ]*)?)"/,
  );
  assert.ok(asset, "Missing standalone static asset");
  const assetResponse = await request(asset[1].replaceAll("&amp;", "&"));
  assert.equal(assetResponse.status, 200);
  assert.ok((await assetResponse.arrayBuffer()).byteLength > 0);
  checks.push("static-assets");
  docker([
    "exec",
    "-w",
    "/app/web",
    app,
    "node",
    "-e",
    "require('sharp')({create:{width:2,height:2,channels:3,background:'#ffffff'}}).webp().toBuffer().then(b=>{if(!b.length)process.exit(1)}).catch(()=>process.exit(1))",
  ]);
  checks.push("sharp");
  docker(["exec", app, "ffmpeg", "-version"]);
  checks.push("ffmpeg");
  const worker = create(
    `${owner}-worker`,
    [
      "--memory",
      "256m",
      "--cpus",
      "0.5",
      "-e",
      "VOZEB_PRO_WORKER_TOKEN",
      "-e",
      "VOZEB_PRO_WORKER_API_ORIGIN",
      image,
      "node",
      "/app/web/scripts/generation-worker.mjs",
    ],
    {
      VOZEB_PRO_WORKER_TOKEN: workerToken,
      VOZEB_PRO_WORKER_API_ORIGIN: "http://app:3000",
    },
  );
  const ready = async () => {
    const response = await request("/api/health/ready");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.generationWorker.healthy, true);
    assert.equal(body.data.database.schemaReady, true);
  };
  await eventually(ready);
  checks.push("worker-heartbeat");
  for (const path of [
    "/api/maintenance/generation-tasks/run",
    "/api/maintenance/billing-refunds/run",
  ]) {
    const response = await request(path, {
      method: "POST",
      headers: {
        authorization: `Bearer ${workerToken}`,
        "x-vozeb-pro-worker-id": `${owner}:verification`,
      },
    });
    assertEmptyWorkerBatch(response.status, await response.json());
  }
  checks.push("worker-empty-batches");
  docker(["restart", app]);
  await eventually(ready);
  assert.equal(
    (await request("/api/admin/settings", { headers: { cookie } })).status,
    200,
  );
  const userCount = docker([
    "exec",
    database,
    "psql",
    "-U",
    "fixture",
    "-d",
    "fixture",
    "-Atc",
    "SELECT count(*) FROM vozeb_pro_users",
  ]);
  assert.equal(userCount, "1");
  checks.push("restart-persistence");
  for (const id of [app, worker]) {
    const state = JSON.parse(docker(["inspect", id]))[0];
    assert.equal(state.Image, inspected.Id);
    assert.equal(state.State.Running, true);
    assert.equal(state.State.OOMKilled, false);
    assert.equal(state.RestartCount, 0);
  }
  writeFileSync(
    output,
    `${JSON.stringify({ image_id: inspected.Id, status: "success", checks }, null, 2)}\n`,
  );
} finally {
  // Only this invocation's labelled disposable resources may be removed.
  cleanupResources(docker, containers, owner, networkCreated);
}
