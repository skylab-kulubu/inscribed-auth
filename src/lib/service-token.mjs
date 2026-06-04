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
 * On a sync failure, surface the *real* reason: re-probe the backend with the
 * service token to print the actual HTTP status + response body, then dump the
 * Keycloak claims (`azp`, `aud`, `resource_access`) for cross-reference.
 *
 * The numeric status/body isn't available from `onSyncError` - inscribed catches
 * the per-slug `CmsApiError(status, detail)`, prints only `detail`, and hands us
 * a generic aggregate - so we re-issue one request to read it directly. The
 * probe body carries no `slug`, so an authorized token gets a harmless 4xx
 * validation error (nothing is created or deleted) and an unauthorized one gets
 * 401/403. Wired as `onSyncError` in the `./config` entry.
 *
 * @param {unknown} [err] The aggregate error inscribed passed to `onSyncError`.
 */
export async function debugServiceTokenClaims(err) {
  const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, KEYCLOAK_ISSUER } = process.env;
  if (!KEYCLOAK_CLIENT_ID || !KEYCLOAK_CLIENT_SECRET || !KEYCLOAK_ISSUER) return;

  if (err) {
    console.error(`[cms-sync:debug] sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }

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

  const cmsUrl = process.env.CMS_URL;
  if (!cmsUrl) {
    console.error(`[cms-sync:debug] CMS_URL is not set - skipping the backend probe.`);
  } else {
    const baseUrl = cmsUrl.replace(/\/+$/, "");
    try {
      const probe = await fetch(`${baseUrl}/cms/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({ __inscribedAuthProbe: true }),
      });
      const body = (await probe.text()).slice(0, 500);
      console.error(`[cms-sync:debug] POST ${baseUrl}/cms/sync -> ${probe.status} ${probe.statusText}`);
      if (body) console.error(`  backend body: ${body}`);
      if (probe.status === 401 || probe.status === 403) {
        console.error(`  -> auth rejected by the backend; cross-check the token claims below.`);
      } else {
        console.error(`  -> token accepted (this status is validation, not auth) - a real 403 would be data/policy-specific.`);
      }
    } catch (e) {
      console.error(`[cms-sync:debug] probe to ${baseUrl}/cms/sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.error("[cms-sync:debug] Service token claims:");
  console.error(`  azp:             ${claims.azp}`);
  console.error(`  aud:             ${JSON.stringify(claims.aud)}`);
  console.error(`  resource_access: ${JSON.stringify(claims.resource_access)}`);

  const ra = claims.resource_access ?? {};
  const holder = Object.keys(ra).find((c) => ra[c]?.roles?.includes("cms:access"));
  if (!holder) {
    console.error(`  ! "cms:access" missing from every client in resource_access - assign it to the`);
    console.error(`    service account: Keycloak -> Clients -> ${claims.azp} -> Service account roles.`);
  }
}