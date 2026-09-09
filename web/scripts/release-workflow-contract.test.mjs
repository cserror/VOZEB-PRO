import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("release workflow contract", () => {
    it("only publishes an explicitly selected source after quality and final-image verification", () => {
        const source = workflow("docker-image.yml");
        const parsed = parseDocument(source);
        expect(parsed.errors).toEqual([]);
        const document = parsed.toJS();
        const { jobs } = document;
        expect(Object.keys(document.on)).toEqual(["workflow_dispatch"]);
        expect(document.on.workflow_dispatch.inputs.source_sha.required).toBe(true);
        expect(jobs.validate.if).toContain("github.repository == 'cserror/VOZEB-PRO'");
        expect(jobs.validate.if).toContain("github.ref == 'refs/heads/main'");
        expect(jobs.validate.steps[1].run).toContain('git merge-base --is-ancestor "$SOURCE_SHA" "$WORKFLOW_SHA"');
        expect(jobs.quality.uses).toBe("./.github/workflows/quality.yml");
        expect(jobs.quality.with.full_checks).toBe(false);
        expect(jobs.validate.steps[1].run).toContain("BASELINE=2b671c325e46c5f71375207acb10638428325b62");
        expect(jobs.publish.needs).toEqual(["validate", "quality"]);
        expect(jobs.manifest.needs).toEqual(["validate", "quality", "publish"]);
        const steps = jobs.publish.steps;
        const build = steps.find((step) => step.uses?.startsWith("docker/build-push-action@"));
        expect(build.with).toMatchObject({ platforms: "linux/amd64", load: true, push: false });
        const smokeIndex = steps.findIndex((step) => step.name === "Verify isolated final image");
        const loginIndex = steps.findIndex((step) => step.uses?.startsWith("docker/login-action@"));
        const pushIndex = steps.findIndex((step) => step.name === "Publish the already tested image");
        expect(smokeIndex).toBeGreaterThan(-1);
        expect(loginIndex).toBeGreaterThan(smokeIndex);
        expect(pushIndex).toBeGreaterThan(loginIndex);
        expect(jobs.publish.env.PUBLISHED_REFERENCE).toMatch(/^ghcr\.io\/cserror\/vozeb-pro:sha-/);
        expect(source).not.toContain("ghcr.io/csyqlz/");
        expect(source).not.toContain("self-hosted");
        expect(source).not.toContain("cosign");
        for (const [name, job] of Object.entries(jobs)) {
            if (name !== "publish") expect(job.permissions?.packages).not.toBe("write");
            if (job["runs-on"]) expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
            for (const step of job.steps || []) {
                if (step.uses?.startsWith("actions/checkout@")) expect(step.with["persist-credentials"]).toBe(false);
            }
        }
        expect(source).not.toMatch(/uses:\s+[^\s]+@(v\d|main|master)\b/);
    });

    it("retires docs image publication without leaving a tag or package-write trigger", () => {
        const parsed = parseDocument(workflow("docs-docker-image.yml"));
        expect(parsed.errors).toEqual([]);
        const document = parsed.toJS();
        expect(Object.keys(document.on)).toEqual(["workflow_dispatch"]);
        expect(document.permissions).toEqual({ contents: "read" });
        expect(Object.keys(document.jobs)).toEqual(["retired"]);
        expect(document.jobs.retired.steps[0].run).toContain("exit 1");
    });

    it("keeps full quality opt-in while secret scanning always blocks failures", () => {
        const source = workflow("quality.yml");
        const parsed = parseDocument(source);
        expect(parsed.errors).toEqual([]);
        const { on, jobs } = parsed.toJS();
        for (const event of ["workflow_dispatch", "workflow_call"]) {
            expect(on[event].inputs.full_checks).toMatchObject({ type: "boolean", default: false });
        }
        expect(jobs.web.if).toBe("${{ inputs.full_checks == true }}");
        expect(jobs.docs.if).toBe(jobs.web.if);
        expect(jobs.security.if).toBeUndefined();
        const secrets = jobs.security.steps.find((step) => step.name === "Scan committed secrets");
        expect(secrets.if).toBeUndefined();
        expect(secrets["continue-on-error"]).toBeUndefined();
        for (const step of jobs.security.steps.filter((item) => item.uses?.startsWith("github/codeql-action/"))) {
            expect(step.if).toBe(jobs.web.if);
        }
        for (const command of ["pnpm run lint", "pnpm run typecheck", "pnpm test", "pnpm run build", "pnpm run e2e"]) expect(source).toContain(command);
        expect(source).toContain("pnpm exec playwright install --with-deps chromium");
        expect(source).toContain("version: 11.9.0");
        expect(source).toContain("gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7");
        expect(source).toContain("github/codeql-action/analyze@47be0dbd5113ab1b79fe2dd3f68bdf7e426cdc87");
        expect(source).not.toMatch(/uses:\s+[^\s]+@(v\d|main|master)\b/);
        const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
        expect(dockerfile).toContain("pnpm install --frozen-lockfile");
        expect(dockerfile).toContain("pnpm run typecheck && NEXT_SKIP_BUILD_TYPECHECK=1 pnpm run build");
    });

    it("serializes shared PostgreSQL integration tests in reusable quality", () => {
        const document = parseDocument(workflow("quality.yml"));
        expect(document.errors).toEqual([]);
        expect(document.toJS().on.workflow_call.inputs.source_sha.required).toBe(true);
        const step = document.toJS().jobs.web.steps.find((item) => item.name === "PostgreSQL integration tests");
        expect(step?.run).toContain("pnpm exec vitest run --no-file-parallelism");
    });

    it("declares one pnpm version for the repository and both Docker builds", () => {
        const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
        const appDockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
        const docsDockerfile = readFileSync(path.join(repoRoot, "docs/Dockerfile"), "utf8");

        expect(rootPackage.packageManager).toBe("pnpm@11.9.0");
        expect(appDockerfile).toContain("ARG PNPM_VERSION=11.9.0");
        expect(appDockerfile).toContain("ARG NODE_BASE=node:22-bookworm-slim");
        expect(appDockerfile.match(/FROM \$\{NODE_BASE\}/g)).toHaveLength(2);
        expect(docsDockerfile).toContain("pnpm@11.9.0");
    });

    it("keeps automated dependency PRs within supported major versions", () => {
        const document = parseDocument(readFileSync(path.join(repoRoot, ".github/dependabot.yml"), "utf8"));
        expect(document.errors).toEqual([]);

        const updates = document.toJS().updates;
        const web = updates.find((item) => item["package-ecosystem"] === "npm" && item.directory === "/web");
        const docs = updates.find((item) => item["package-ecosystem"] === "npm" && item.directory === "/docs");
        const actions = updates.find((item) => item["package-ecosystem"] === "github-actions");
        const docker = updates.filter((item) => item["package-ecosystem"] === "docker");

        expect(web.groups["web-runtime"]["update-types"]).toEqual(["minor", "patch"]);
        expect(web.groups["web-development"]["update-types"]).toEqual(["minor", "patch"]);
        expect(web.ignore.map((item) => item["dependency-name"])).toEqual(["*"]);
        expect(docs.groups["docs-dependencies"]["update-types"]).toEqual(["minor", "patch"]);
        expect(docs.ignore.map((item) => item["dependency-name"])).toEqual(["*"]);
        expect(actions.ignore.map((item) => item["dependency-name"])).toEqual(["*"]);
        expect([...web.ignore, ...docs.ignore, ...actions.ignore, ...docker.flatMap((item) => item.ignore)].every((item) => item["update-types"][0] === "version-update:semver-major")).toBe(true);
        expect(docker).toHaveLength(2);
        expect(docker.every((item) => item.ignore[0]["dependency-name"] === "node")).toBe(true);
    });
});

function workflow(file) {
    return readFileSync(path.join(repoRoot, ".github/workflows", file), "utf8");
}
