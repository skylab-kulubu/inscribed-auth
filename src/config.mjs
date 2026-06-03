/**
 * @file `@skylab-kulubu/inscribed-auth/config` — `cms-sync` CLI wiring.
 *
 * The `cms-sync` CLI is a plain Node binary - it can't receive function props
 * the way the React tree does - so it loads the consumer's `cms.config.{js,mjs}`
 * from the project root to learn how to obtain a service token (and, optionally,
 * how to diagnose failures). This entry lets that config file be a one-liner:
 *
 *   // cms.config.mjs (consumer project root)
 *   export { getServiceToken, onSyncError } from "@skylab-kulubu/inscribed-auth/config";
 *
 * Resolves to ESM so the CLI's dynamic `import()` works regardless of the
 * consuming app's `"type"`.
 */

import {
  getClientCredentialsToken,
  debugServiceTokenClaims,
} from "./lib/service-token.mjs";

/** Service token for build-time `POST /cms/sync`. */
export const getServiceToken = getClientCredentialsToken;

/** Called when a sync fails - dumps Keycloak claims to explain 403s. */
export const onSyncError = () => debugServiceTokenClaims();
