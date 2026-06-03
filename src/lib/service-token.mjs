/**
 * @file Keycloak client-credentials service-token provider.
 *
 * Part of `@skylab-kulubu/inscribed-auth`. The inscribed core is backend-neutral:
 * it only knows the `ServiceTokenProvider` contract (`() => Promise<string>`)
 * and defaults to "no token". This module implements that contract against
 * Keycloak and is wired into the SDK via `createCmsPage({ getServiceToken })`
 * (consumer `lib/cms.jsx`) and the `cms-sync` CLI (consumer `cms.config.mjs`,
 * which re-exports from `@skylab-kulubu/inscribed-auth/config`).
 *
 * `.mjs` so the plain-Node `cms-sync` CLI can `import()` the resolved `./config`
 * entry as ESM regardless of the consuming app's `"type"`. (Skylab apps stay
 * CommonJS so next-auth v4's Keycloak provider resolves through Webpack's CJS
 * interop — see the provider-injection note in `options.js`.)
 *
 * Server / build-time only. Reads KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET,
 * KEYCLOAK_ISSUER. Returns "" when those vars are absent so reads degrade to
 * unauthenticated. In-process cache shared across requests, re-fetched 30s
 * before expiry.
 */

/** @type {{ token: string; expiresAt: number } | null} */
let cache = null;

/**
 * Implements the SDK's `ServiceTokenProvider` contract: `() => Promise<string>`.
 * @returns {Promise<string>}
 */
export async function getClientCredentialsToken() {
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const issuer = process.env.KEYCLOAK_ISSUER;

  if (!clientId || !clientSecret || !issuer) return "";

  if (cache && cache.expiresAt > Date.now() + 30_000) return cache.token;

  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `[inscribed-auth] Keycloak token request failed: ${res.status} ${await res.text()}`,
    );
  }

  const { access_token, expires_in } = await res.json();
  cache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

/**
 * Drop the cached service token so the next call re-fetches. Intentionally NOT
 * part of the public `./server` surface — kept here for internal use and for
 * anyone who deep-imports the raw module (e.g. token rotation in tests).
 */
export function invalidateClientCredentialsToken() {
  cache = null;
}

/**
 * On a sync failure, fetch the service token directly and dump the claims the
 * backend's `CmsAccessPolicy` checks (`azp`, `aud`, `resource_access`). Most
 * 403s come from the service account missing the `cms:access` role mapping in
 * Keycloak - this prints exactly what's there. Wired as `onSyncError` in the
 * `./config` entry.
 */
export async function debugServiceTokenClaims() {
  const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, KEYCLOAK_ISSUER } = process.env;
  if (!KEYCLOAK_CLIENT_ID || !KEYCLOAK_CLIENT_SECRET || !KEYCLOAK_ISSUER) return;

  const res = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    console.error(`[cms-sync:debug] Token fetch failed: ${res.status} ${await res.text()}`);
    return;
  }

  const { access_token } = await res.json();
  const [, payload] = access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

  console.error("[cms-sync:debug] Service token claims:");
  console.error(`  azp:             ${claims.azp}`);
  console.error(`  sub:             ${claims.sub}`);
  console.error(`  aud:             ${JSON.stringify(claims.aud)}`);
  console.error(`  scope:           ${claims.scope}`);
  console.error(`  resource_access: ${JSON.stringify(claims.resource_access)}`);

  const ourRoles = claims.resource_access?.[claims.azp]?.roles ?? [];
  console.error(`  -> roles for "${claims.azp}": ${JSON.stringify(ourRoles)}`);
  if (!ourRoles.includes("cms:access")) {
    console.error(`  ! "cms:access" role missing on service account.`);
    console.error(`     Keycloak Admin -> Clients -> ${claims.azp} -> Service account roles -> Assign "cms:access".`);
  }
}
