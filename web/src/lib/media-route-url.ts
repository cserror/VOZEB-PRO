export function mediaRouteUrl(scope: "generation" | "reference", storageKey: string) {
    const encodedKey = storageKey
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${scope === "generation" ? "/api/generation-log-assets" : "/api/reference-assets"}/${encodedKey}`;
}
