declare const __APP_VERSION__: string;

/** JuraCUT's version, e.g. "0.1.0" (from package.json; history in CHANGELOG.md). */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Short form for display, e.g. "v0.1". */
export const SHORT_VERSION = `v${APP_VERSION.replace(/\.0$/, "")}`;
