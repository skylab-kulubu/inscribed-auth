import { defineConfig } from "tsup";

/**
 * One entry per export-map key. Each is bundled separately so the top-level
 * `"use client"` directive on the `index` entry survives (tsup/esbuild strips
 * directives from *inner* files but keeps the entry's own top-level one).
 *
 * Peer deps are externalized: the consuming Next.js app owns the single copy of
 * `react`, `next`, `next-auth` and `inscribed`. Crucially, no NextAuth provider
 * module is imported here — the Keycloak provider is configured consumer-side
 * and injected via `createCmsAuthOptions({ provider })`, because bundling
 * `next-auth/providers/*` breaks Webpack's CJS/ESM interop downstream.
 */
export default defineConfig({
  entry: {
    index: "src/index.jsx",
    server: "src/server.js",
    signin: "src/signin.js",
    config: "src/config.mjs",
  },
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ["inscribed", "next", "next-auth", "react", "react-dom"],
});
