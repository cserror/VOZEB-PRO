import assert from "node:assert/strict";
import { test } from "node:test";
import { createReleaseManifest } from "./manifest.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const registryDigest = `sha256:${"c".repeat(64)}`;
const jobNames = [
  "validate",
  "quality / web",
  "quality / docs",
  "quality / security",
  "publish",
];
function fixture() {
  return {
    repository: "cserror/VOZEB-PRO",
    sourceSha: sha,
    workflowSha: sha,
    runId: 123,
    runAttempt: 1,
    builtAt: "2026-09-08T12:00:00Z",
    localImage: {
      Id: digest,
      Os: "linux",
      Architecture: "amd64",
      Size: 1234,
      Config: { Labels: { "org.opencontainers.image.revision": sha } },
    },
    registryDescriptor: { digest: registryDigest },
    registryManifest: { config: { digest }, layers: [{ size: 456 }] },
    verification: {
      image_id: digest,
      status: "success",
      checks: [
        "fresh-install",
        "admin-auth",
        "static-assets",
        "sharp",
        "ffmpeg",
        "worker-heartbeat",
        "worker-empty-batches",
        "restart-persistence",
      ],
    },
    materials: [
      {
        repository: "cserror/VOZEB-PRO",
        source_sha: sha,
        path: "Dockerfile",
        sha256: "d".repeat(64),
        purpose: "recipe",
      },
    ],
    baseImages: { node: `node@${digest}`, postgres: `postgres@${digest}` },
    jobs: jobNames.map((name, id) => ({
      id: id + 1,
      name,
      conclusion: "success",
      run_id: 123,
      run_attempt: 1,
      head_sha: sha,
    })),
  };
}

test("binds source, successful jobs, tested image and registry identity", () => {
  const manifest = createReleaseManifest(fixture());
  assert.equal(manifest.source.source_sha, sha);
  assert.equal(manifest.images.length, 2);
  assert.equal(manifest.images[0].registry_digest, registryDigest);
  assert.equal(manifest.verification.registry_digest, registryDigest);
  assert.equal(manifest.build.required_jobs.length, jobNames.length);
});

for (const [name, mutate] of [
  [
    "short source SHA",
    (x) => {
      x.sourceSha = "aaaaaaa";
    },
  ],
  [
    "wrong repository",
    (x) => {
      x.repository = "csyqlz/VOZEB-PRO";
    },
  ],
  [
    "wrong platform",
    (x) => {
      x.localImage.Architecture = "arm64";
    },
  ],
  [
    "wrong revision",
    (x) => {
      x.localImage.Config.Labels["org.opencontainers.image.revision"] =
        "e".repeat(40);
    },
  ],
  [
    "different registry config",
    (x) => {
      x.registryManifest.config.digest = `sha256:${"e".repeat(64)}`;
    },
  ],
  [
    "untested image",
    (x) => {
      x.verification.image_id = `sha256:${"e".repeat(64)}`;
    },
  ],
  [
    "missing Worker check",
    (x) => {
      x.verification.checks = x.verification.checks.filter(
        (v) => v !== "worker-heartbeat",
      );
    },
  ],
  [
    "failed job",
    (x) => {
      x.jobs[1].conclusion = "failure";
    },
  ],
  [
    "skipped security job",
    (x) => {
      x.jobs[3].conclusion = "skipped";
    },
  ],
  [
    "missing job",
    (x) => {
      x.jobs.pop();
    },
  ],
  [
    "duplicate job",
    (x) => {
      x.jobs.push(x.jobs[0]);
    },
  ],
  [
    "invalid attempt",
    (x) => {
      x.runAttempt = 0;
    },
  ],
  [
    "old attempt jobs",
    (x) => {
      x.jobs[0].run_attempt = 2;
    },
  ],
  [
    "another run jobs",
    (x) => {
      x.jobs[0].run_id = 456;
    },
  ],
  [
    "another workflow revision jobs",
    (x) => {
      x.jobs[0].head_sha = "f".repeat(40);
    },
  ],
  [
    "unversioned material",
    (x) => {
      x.materials[0].source_sha = "main";
    },
  ],
  [
    "foreign material",
    (x) => {
      x.materials[0].repository = "other/repo";
    },
  ],
  [
    "unexpected image index",
    (x) => {
      x.registryManifest.manifests = [];
    },
  ],
  [
    "mutable base image",
    (x) => {
      x.baseImages.node = "node:22";
    },
  ],
]) {
  test(`rejects ${name}`, () => {
    const input = fixture();
    mutate(input);
    assert.throws(() => createReleaseManifest(input));
  });
}

test("accepts a rebuild only with matching new image evidence", () => {
  const x = fixture();
  const replacement = `sha256:${"f".repeat(64)}`;
  x.runAttempt = 2;
  x.jobs.forEach((job) => {
    job.run_attempt = 2;
  });
  x.localImage.Id =
    x.registryManifest.config.digest =
    x.verification.image_id =
      replacement;
  x.registryDescriptor.digest = `sha256:${"e".repeat(64)}`;
  assert.equal(createReleaseManifest(x).images[0].image_id, replacement);
});
