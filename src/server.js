/**
 * @file `@skylab-kulubu/inscribed-auth/server` — server-only entry.
 *
 * The auth adapter + service-token provider for Skylab inscribed apps. Import
 * this from server modules only (it pulls in `next-auth`'s `getServerSession`).
 *
 * `invalidateClientCredentialsToken` is intentionally NOT re-exported here —
 * it stays internal to `./lib/service-token.mjs`.
 */

export {
  createCmsAuthOptions,
  withCmsAuth,
  isCmsAdmin,
  readCmsAuthMeta,
} from "./lib/options.js";

export {
  getClientCredentialsToken,
  debugServiceTokenClaims,
} from "./lib/service-token.mjs";
