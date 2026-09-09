import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const requiredJobs = ["validate", "quality / security", "publish"];
const requiredChecks = [
  "fresh-install",
  "admin-auth",
  "static-assets",
  "sharp",
  "ffmpeg",
  "worker-heartbeat",
  "worker-empty-batches",
  "restart-persistence",
];

export function createReleaseManifest(input) {
  const {
    repository,
    sourceSha,
    workflowSha,
    localImage,
    registryDescriptor,
    registryManifest,
    verification,
  } = input;
  assert.equal(repository, "cserror/VOZEB-PRO", "Unexpected source repository");
  assert.match(sourceSha, sha);
  assert.match(workflowSha, sha);
  for (const key of ["runId", "runAttempt"])
    assert.ok(Number.isSafeInteger(input[key]) && input[key] > 0, key);
  assert.ok(Number.isFinite(Date.parse(input.builtAt)), "Invalid build time");
  assert.equal(`${localImage.Os}/${localImage.Architecture}`, "linux/amd64");
  assert.equal(
    localImage.Config.Labels["org.opencontainers.image.revision"],
    sourceSha,
  );
  assert.match(localImage.Id, digest);
  assert.match(registryDescriptor.digest, digest);
  assert.ok(
    !Object.hasOwn(registryManifest, "manifests"),
    "Expected a single-platform image manifest",
  );
  assert.equal(
    registryManifest.config.digest,
    localImage.Id,
    "Published image differs from tested image",
  );
  assert.equal(verification.image_id, localImage.Id);
  assert.equal(verification.status, "success");
  for (const check of requiredChecks)
    assert.ok(verification.checks.includes(check), `Missing ${check}`);
  assert.ok(Number.isSafeInteger(localImage.Size) && localImage.Size > 0);
  for (const name of requiredJobs) {
    const matches = input.jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate job ${name}`);
    assert.equal(
      matches[0].conclusion,
      "success",
      `Job ${name} did not succeed`,
    );
    assert.equal(matches[0].run_id, input.runId, `Wrong run for ${name}`);
    assert.equal(
      matches[0].run_attempt,
      input.runAttempt,
      `Wrong attempt for ${name}`,
    );
    assert.equal(
      matches[0].head_sha,
      workflowSha,
      `Wrong workflow revision for ${name}`,
    );
  }
  assert.ok(input.materials.length > 0);
  for (const material of input.materials) {
    assert.equal(material.repository, repository);
    assert.ok([sourceSha, workflowSha].includes(material.source_sha));
    assert.match(material.sha256, /^[a-f0-9]{64}$/);
    assert.ok(
      material.path &&
        !material.path.startsWith("/") &&
        !material.path.split("/").includes(".."),
    );
    assert.ok(material.purpose);
  }
  for (const key of ["node", "postgres"])
    assert.match(input.baseImages[key], /^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/);
  return {
    schema_version: 1,
    project: "vozeb-pro",
    source: { repository, source_sha: sourceSha, branch: "main" },
    build: {
      validation_profile: "closed-test-build",
      workflow_path: ".github/workflows/docker-image.yml",
      workflow_sha: workflowSha,
      run_id: input.runId,
      run_attempt: input.runAttempt,
      built_at: input.builtAt,
      required_jobs: requiredJobs.map((name) => {
        const job = input.jobs.find((item) => item.name === name);
        return { job: job.id, name, conclusion: job.conclusion };
      }),
      base_images: input.baseImages,
    },
    images: ["app", "generation-worker"].map((service) => ({
      service,
      repository: "ghcr.io/cserror/vozeb-pro",
      registry_digest: registryDescriptor.digest,
      platform: "linux/amd64",
      config_digest: localImage.Id,
      image_id: localImage.Id,
      size_bytes: localImage.Size,
      size_basis: "docker image inspect Size (uncompressed image)",
    })),
    materials: input.materials,
    verification: {
      ...verification,
      registry_digest: registryDescriptor.digest,
      evidence:
        "publish-evidence.json; GitHub run/attempt jobs; successful overall run required",
      not_covered: [
        "full source quality suite (including mobile E2E and dependency audit)",
        "production data upgrade/rollback",
        "paid generation and billing",
        "production browser acceptance",
      ],
    },
    impact: {
      migration_required: null,
      assessment_status: "pending_ops_review",
      configuration_names: ["VOZEB_PRO_IMAGE"],
      services: ["app", "generation-worker"],
      data: "Not assessed by CI. Handoff must document migration, configuration and data changes against the deployed version; ops review must confirm them before deployment. Listed services and configuration names describe the image switch only, not all possible business changes.",
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [evidenceFile, jobsFile, outputFile] = process.argv.slice(2);
  assert.ok(
    evidenceFile && jobsFile && outputFile,
    "Usage: manifest.mjs evidence.json jobs.json output.json",
  );
  const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
  assert.equal(
    evidence.runId,
    Number(process.env.GITHUB_RUN_ID),
    "Evidence belongs to a different run",
  );
  assert.equal(
    evidence.runAttempt,
    Number(process.env.GITHUB_RUN_ATTEMPT),
    "Evidence belongs to a different attempt",
  );
  assert.equal(evidence.workflowSha, process.env.GITHUB_WORKFLOW_SHA);
  assert.equal(evidence.sourceSha, process.env.SOURCE_SHA);
  const jobResponse = JSON.parse(readFileSync(jobsFile, "utf8"));
  writeFileSync(
    outputFile,
    `${JSON.stringify(createReleaseManifest({ ...evidence, jobs: jobResponse.jobs }), null, 2)}\n`,
  );
}
