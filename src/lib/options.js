/**
 * @file Pre-wired NextAuth options for inscribed CMS apps (Skylab auth adapter).
 *
 * Part of `@skylab-kulubu/inscribed-auth`. The inscribed core is auth-agnostic;
 * this module is Skylab's NextAuth + Keycloak server wiring on top of it.
 *
 * `createCmsAuthOptions()` returns a complete `AuthOptions` object suitable
 * for `NextAuth(...)` in `app/api/auth/[...nextauth]/route.js`. It bundles:
 *   - JWT callback that persists Keycloak access/refresh tokens
 *   - Silent refresh of expired access tokens
 *   - Client-role extraction from the access token
 *   - Session callback that exposes `accessToken`, `user.id`, `user.clientRoles`
 *
 * The OAuth provider itself stays on the consumer side - import
 * `next-auth/providers/keycloak` (or any other provider) in your own
 * `lib/auth.js` and pass the configured instance via `provider`. Importing
 * NextAuth provider modules from a bundled package breaks Webpack's
 * CJS/ESM interop and the provider resolves to `undefined` at runtime.
 *
 * Admin metadata (`adminRole` / `isAdmin`) is stamped onto the returned
 * options so `createCmsPage({ ...withCmsAuth(authOptions) })` can derive admin
 * gating automatically without the caller wiring a separate `deriveAdmin`.
 */

import { getServerSession } from "next-auth";

/** @type {unique symbol} */
const CMS_META = Symbol.for("inscribed/auth.meta");

/**
 * @typedef {Object} CmsAuthMeta
 * @property {string|null} adminRole
 * @property {((session: *) => boolean)|null} isAdmin
 */

/**
 * @typedef {Object} CreateCmsAuthOptionsInput
 * @property {*} provider
 *   Configured NextAuth provider instance. Import the provider module on
 *   the consumer side (typically `next-auth/providers/keycloak`) and pass
 *   the result of calling it. Required.
 * @property {string} [adminRole]
 *   Keycloak client role required for admin access. Default `"cms:access"`.
 * @property {(session: *) => boolean} [isAdmin]
 *   Override admin gating with arbitrary logic. Wins over `adminRole`.
 * @property {number} [refreshLeadTimeMs]
 *   Refresh access tokens this many ms before expiry. Default 10 000.
 * @property {Partial<import("next-auth").AuthOptions["callbacks"]>} [extraCallbacks]
 *   Extra callbacks merged on top of the built-in ones. Each callback runs
 *   AFTER the built-in version and receives the already-augmented value.
 * @property {Partial<import("next-auth").AuthOptions>} [extraOptions]
 *   Anything else (pages, cookies, events, ...) merged onto the result.
 */

/**
 * Build a ready-to-use NextAuth `AuthOptions` object.
 *
 * @param {CreateCmsAuthOptionsInput} input
 * @returns {import("next-auth").AuthOptions & { [CMS_META]: CmsAuthMeta }}
 */
export function createCmsAuthOptions(input) {
  const {
    provider,
    adminRole = "cms:access",
    isAdmin,
    refreshLeadTimeMs = 10_000,
    extraCallbacks,
    extraOptions,
  } = input ?? {};

  if (!provider) {
    throw new Error(
      "createCmsAuthOptions: `provider` is required. Import a NextAuth provider " +
        "(e.g. `next-auth/providers/keycloak`) in your own auth file and pass " +
        "the configured instance.",
    );
  }

  /** @type {import("next-auth").AuthOptions} */
  const base = {
    providers: [provider],
    callbacks: {
      async jwt(args) {
        const { token, account } = args;
        let next = token;

        // 1. Initial sign-in: copy tokens off the OAuth account.
        if (account) {
          next.accessToken = account.access_token;
          next.refreshToken = account.refresh_token;
          next.accessTokenExpires =
            typeof account.expires_at === "number" ? account.expires_at * 1000 : 0;
          next.sub = account.providerAccountId ?? next.sub;
          next.error = undefined;
          next.clientRoles = readClientRoles(account.access_token);
        } else if (
          // 2. Previous refresh failed - bail until the user re-authenticates.
          next.error !== "RefreshAccessTokenError" &&
          // 3. Token still valid (with lead time) - return as-is.
          (typeof next.accessTokenExpires !== "number" ||
            Date.now() >= next.accessTokenExpires - refreshLeadTimeMs)
        ) {
          // 4. Expired (or about to) - silently refresh.
          next = await refreshAccessToken(next);
        }

        if (extraCallbacks?.jwt) {
          const overridden = await extraCallbacks.jwt({ ...args, token: next });
          if (overridden !== undefined) return overridden;
        }
        return next;
      },

      async session(args) {
        const { session, token } = args;
        session.accessToken = /** @type {string|undefined} */ (token.accessToken);
        session.error = token.error;
        if (session.user) {
          session.user.id = /** @type {string} */ (token.sub ?? "");
          session.user.clientRoles =
            /** @type {string[]} */ (token.clientRoles ?? []);
        }

        if (extraCallbacks?.session) {
          const overridden = await extraCallbacks.session(args);
          if (overridden !== undefined) return overridden;
        }
        return session;
      },

      ...(extraCallbacks
        ? Object.fromEntries(
            Object.entries(extraCallbacks).filter(
              ([key]) => key !== "jwt" && key !== "session",
            ),
          )
        : {}),
    },
    ...extraOptions,
  };

  /** @type {CmsAuthMeta} */
  const meta = {
    adminRole: isAdmin ? null : adminRole,
    isAdmin: isAdmin ?? null,
  };

  return Object.assign(base, { [CMS_META]: meta });
}

/**
 * Read CMS admin metadata previously stamped by `createCmsAuthOptions`.
 * Returns null if the options didn't come from the factory.
 *
 * @param {*} authOptions
 * @returns {CmsAuthMeta|null}
 */
export function readCmsAuthMeta(authOptions) {
  if (!authOptions || typeof authOptions !== "object") return null;
  return authOptions[CMS_META] ?? null;
}

/**
 * Decide whether a session belongs to a CMS admin. Uses `isAdmin` callback
 * when provided, otherwise checks for the named Keycloak client role.
 * Falls back to `false` when no metadata is available.
 *
 * @param {*} session
 * @param {CmsAuthMeta|null} [meta]
 * @returns {boolean}
 */
export function isCmsAdmin(session, meta) {
  if (!session) return false;
  if (!meta) return false;
  if (meta.isAdmin) return Boolean(meta.isAdmin(session));
  if (meta.adminRole) {
    /** @type {string[]} */
    const roles = session.user?.clientRoles ?? [];
    return roles.includes(meta.adminRole);
  }
  return false;
}

/**
 * Adapt NextAuth `authOptions` into the auth-agnostic callbacks
 * `createCmsPage` expects, so the inscribed core never has to import next-auth.
 * Spread the result into the factory:
 *
 *   import { withCmsAuth } from "@skylab-kulubu/inscribed-auth/server";
 *   createCmsPage({ ...withCmsAuth(authOptions), config, Provider, ... });
 *
 * - `getSession` resolves the server session via `getServerSession`.
 * - `deriveAdmin` uses the admin metadata stamped by `createCmsAuthOptions`
 *   (falls back to `session != null` when the options didn't come from the
 *   factory).
 * - `deriveUserSub` reads `session.user.id`.
 *
 * @param {import("next-auth").AuthOptions} authOptions
 * @returns {{ getSession: () => Promise<*|null>, deriveAdmin: (session: *) => boolean, deriveUserSub: (session: *) => string | null }}
 */
export function withCmsAuth(authOptions) {
  if (!authOptions) {
    throw new Error("withCmsAuth: `authOptions` is required");
  }
  const meta = readCmsAuthMeta(authOptions);
  return {
    getSession: () => getServerSession(authOptions),
    deriveAdmin: meta
      ? (session) => isCmsAdmin(session, meta)
      : (session) => session != null,
    deriveUserSub: (session) => session?.user?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Decode a Keycloak access token (JWT) and return the principal's client roles
 * aggregated across every entry in `resource_access`. We aggregate rather than
 * scope to a single client because the admin role (`cms:access`) is a client
 * role of the inscribed backend's Keycloak client (e.g. "skycms"), not the
 * frontend client the token was issued to (`azp`/`KEYCLOAK_CLIENT_ID`). That
 * backend client only appears in `resource_access` because it's mapped into the
 * token audience, so reading the role straight from `resource_access` is exact
 * and needs no extra config. Signature isn't verified - the token came from
 * Keycloak directly via the OAuth flow, so trust is established.
 *
 * @param {string|undefined} accessToken
 * @returns {string[]}
 */
function readClientRoles(accessToken) {
  if (!accessToken) return [];
  const segments = accessToken.split(".");
  if (segments.length < 2) return [];
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    );
    const resourceAccess = payload?.resource_access ?? {};
    return Object.values(resourceAccess).flatMap((client) => client?.roles ?? []);
  } catch {
    return [];
  }
}

/**
 * Exchange the refresh token for a new access token at Keycloak.
 *
 * @param {*} token
 */
async function refreshAccessToken(token) {
  try {
    const issuer = process.env.KEYCLOAK_ISSUER ?? "";
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID ?? "",
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      clientRoles: readClientRoles(refreshed.access_token),
      error: undefined,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[inscribed-auth] Refresh token error:", error);
    return {
      ...token,
      accessToken: undefined,
      error: "RefreshAccessTokenError",
    };
  }
}
