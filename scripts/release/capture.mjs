import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
const sourceSha = process.env.SOURCE_SHA;
const workflowSha = process.env.WORKFLOW_SHA;
assert.match(sourceSha, /^[a-f0-9]{40}$/);
assert.match(workflowSha, /^[a-f0-9]{40}$/);
assert.equal(process.env.GITHUB_REPOSITORY, "cserror/VOZEB-PRO");
const reference = process.env.PUBLISHED_REFERENCE;
assert.match(
  reference,
  /^ghcr\.io\/cserror\/vozeb-pro:sha-[a-f0-9]{40}-run-[0-9]+-attempt-[0-9]+$/,
);
const registryDescriptor = JSON.parse(
  run("docker", [
    "buildx",
    "imagetools",
    "inspect",
    reference,
    "--format",
    "{{json .Manifest}}",
  ]),
);
assert.match(registryDescriptor.digest, /^sha256:[a-f0-9]{64}$/);
const registryManifest = JSON.parse(
  run("docker", [
    "buildx",
    "imagetools",
    "inspect",
    `ghcr.io/cserror/vozeb-pro@${registryDescriptor.digest}`,
    "--raw",
  ]),
);
const inspected = JSON.parse(
  run("docker", ["image", "inspect", process.env.LOCAL_IMAGE]),
)[0];
const materials = [];
for (const [root, commit, purpose, paths] of [
  [
    "source",
    sourceSha,
    "source recipe and schema",
    [
      "Dockerfile",
      ".dockerignore",
      "VERSION",
      "web/package.json",
      "web/pnpm-lock.yaml",
      "web/pnpm-workspace.yaml",
      "web/src/lib/server/database/schema.ts",
      "web/src/lib/server/database/schema-commercial-features.ts",
      "web/src/lib/server/database/schema-triggers.ts",
    ],
  ],
  [
    "tooling",
    workflowSha,
    "trusted workflow and deployment tools",
    [
      ".github/workflows/quality.yml",
      ".github/workflows/docker-image.yml",
      "scripts/release/smoke.mjs",
      "scripts/release/smoke-safety.mjs",
      "scripts/release/capture.mjs",
      "scripts/release/manifest.mjs",
      "deploy/docker-compose.image.yml",
    ],
  ],
]) {
  for (const path of paths) {
    const contents = readFileSync(`${root}/${path}`);
    assert.equal(
      run("git", ["-C", root, "hash-object", path]),
      run("git", ["-C", root, "rev-parse", `${commit}:${path}`]),
      `Changed material ${path}`,
    );
    materials.push({
      repository: process.env.GITHUB_REPOSITORY,
      source_sha: commit,
      path,
      purpose,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
}
const evidence = {
  repository: process.env.GITHUB_REPOSITORY,
  sourceSha,
  workflowSha,
  runId: Number(process.env.GITHUB_RUN_ID),
  runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  builtAt: new Date().toISOString(),
  localImage: {
    Id: inspected.Id,
    Os: inspected.Os,
    Architecture: inspected.Architecture,
    Size: inspected.Size,
    Config: { Labels: inspected.Config.Labels },
  },
  registryDescriptor,
  registryManifest,
  materials,
  verification: JSON.parse(
    readFileSync("evidence/image-verification.json", "utf8"),
  ),
  baseImages: {
    node: process.env.NODE_BASE,
    postgres: process.env.POSTGRES_IMAGE,
  },
};
assert.equal(
  registryManifest.config.digest,
  inspected.Id,
  "Registry image does not match tested local image",
);
writeFileSync(
  "evidence/publish-evidence.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);
