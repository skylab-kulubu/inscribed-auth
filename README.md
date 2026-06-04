# @skylab-kulubu/inscribed-auth

Skylab's opt-in **NextAuth + Keycloak** adapter for the [`inscribed`](https://www.npmjs.com/package/inscribed) CMS.

`inscribed` is auth- and vendor-neutral: out of the box it runs read-only/public.
This package is the Skylab layer that plugs admin auth and the build-time
service token into it, so a new Skylab Next.js app gets editing + sync by
**installing one package and setting env vars** — no hand-copied auth files.

It ships **two seam adapters**:

| Seam | What this package provides |
| --- | --- |
| **Auth** | NextAuth options (JWT access/refresh persistence, silent refresh, Keycloak client-role extraction), the `withCmsAuth` adapter, the `NextAuthCmsProvider` client wrapper, and a one-route auto-signin handler. |
| **Service token** | Keycloak client-credentials token for SSR content fetch + the `cms-sync` CLI. |

Transport is **not** provided — Skylab uses `inscribed`'s default REST transport.

## Install

```bash
npm install @skylab-kulubu/inscribed-auth
```

Peer dependencies (you already have most in a Next app):

```bash
npm install inscribed next next-auth@^4 react react-dom
```

> **Keep the app CommonJS** (do not set `"type": "module"` in the app's
> `package.json`). next-auth v4's Keycloak provider only resolves through
> Webpack's CJS/ESM interop; an ESM app breaks it. The one exception is
> `cms.config.mjs` below, which is `.mjs` on purpose.

## Entry points

| Import | Use from | Exports |
| --- | --- | --- |
| `@skylab-kulubu/inscribed-auth` | Client (`"use client"`) | `NextAuthCmsProvider` |
| `@skylab-kulubu/inscribed-auth/server` | Server only | `createCmsAuthOptions`, `withCmsAuth`, `isCmsAdmin`, `readCmsAuthMeta`, `getClientCredentialsToken`, `debugServiceTokenClaims` |
| `@skylab-kulubu/inscribed-auth/signin` | Server route | `GET`, `createSignInRoute` |
| `@skylab-kulubu/inscribed-auth/config` | `cms-sync` CLI / build-time | `getServiceToken`, `onSyncError` |

## Wiring (the five files + env)

### `lib/auth.js` — NextAuth options

The Keycloak **provider instance stays here, on your side** — never let it be
bundled by a dependency, or it resolves to `undefined` at runtime.

```js
import KeycloakProvider from "next-auth/providers/keycloak";
import { createCmsAuthOptions } from "@skylab-kulubu/inscribed-auth/server";

export const authOptions = createCmsAuthOptions({
  provider: KeycloakProvider({
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? "",
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
    issuer: process.env.KEYCLOAK_ISSUER ?? "",
  }),
  adminRole: "cms:access", // Keycloak client role gating admin access (default)
});
```

### `app/api/auth/[...nextauth]/route.js` — NextAuth handler

```js
import NextAuth from "next-auth";
import { authOptions } from "../../../../lib/auth.js";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### `app/api/signin/route.js` — one-click sign-in

`/api/signin?callbackUrl=...` jumps straight into the Keycloak flow, skipping
NextAuth's provider-picker page. Link to it from anywhere (`<a href="/api/signin">`).

```js
export { GET } from "@skylab-kulubu/inscribed-auth/signin";
```

### `lib/cms.jsx` — the CMS page factory

```jsx
import { revalidateCmsSlug } from "inscribed/actions";
import { createCmsPage } from "inscribed/page";
import { NextAuthCmsProvider } from "@skylab-kulubu/inscribed-auth";
import { withCmsAuth, getClientCredentialsToken } from "@skylab-kulubu/inscribed-auth/server";

import { authOptions } from "./auth.js";

export const CmsPage = createCmsPage({
  Provider: NextAuthCmsProvider,
  config: {
    baseUrl: process.env.CMS_URL ?? "http://localhost:5000",
    cdnUrl: process.env.CMS_CDN_URL,
  },
  // Service token for the public SSR content fetch (no session required).
  getServiceToken: getClientCredentialsToken,
  // Adapts NextAuth into inscribed's auth-agnostic callbacks
  // (getSession / deriveAdmin / deriveUserSub).
  ...withCmsAuth(authOptions),
  // Must come through inscribed's `actions` entry so its "use server"
  // directive survives bundling.
  onAfterSave: revalidateCmsSlug,
});
```

### `cms.config.mjs` — `cms-sync` CLI wiring (project root, `.mjs`)

The CLI is plain Node and `import()`s this file. One line:

```js
export { getServiceToken, onSyncError } from "@skylab-kulubu/inscribed-auth/config";
```

### `.env.local`

```dotenv
# Keycloak (same client serves login + client_credentials sync)
KEYCLOAK_CLIENT_ID=<your-client-id>
KEYCLOAK_CLIENT_SECRET=<your-client-secret>
KEYCLOAK_ISSUER=https://<keycloak-host>/realms/<realm>

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>

# CMS backend
CMS_URL=https://<your-cms-host>
# Optional:
# CMS_CDN_URL=https://<your-cdn-host>
```

| Var | Required | Purpose |
| --- | --- | --- |
| `KEYCLOAK_CLIENT_ID` | ✅ | Keycloak client (both grants) |
| `KEYCLOAK_CLIENT_SECRET` | ✅ | Client secret |
| `KEYCLOAK_ISSUER` | ✅ | Realm issuer URL |
| `NEXTAUTH_URL` | ✅ | App base URL for NextAuth |
| `NEXTAUTH_SECRET` | ✅ | NextAuth JWT/session secret |
| `CMS_URL` | ✅ | inscribed backend base URL (→ `config.baseUrl`) |
| `CMS_CDN_URL` | — | Asset CDN base (→ `config.cdnUrl`) |

## Admin access

Admin operations require the `cms:access` Keycloak **client role**, both for the
logged-in user (admin UI) and the service account (sync). The role belongs to
the **inscribed backend's** Keycloak client (the resource server, e.g.
`skycms`) — not the frontend login client (`KEYCLOAK_CLIENT_ID`). As long as the
backend client is mapped into the token audience, the role rides along under
`resource_access["<backend-client>"]`; the SDK reads roles from every client in
`resource_access`, so it doesn't matter that the role isn't keyed under the
frontend client / token `azp`.

Grant the backend client's `cms:access` role to each principal in Keycloak Admin:

- **Admin users** → Users → \<user\> → Role mapping → assign `cms:access`
- **Service account (sync)** → Clients → `KEYCLOAK_CLIENT_ID` → Service account
  roles → assign `cms:access`

If sync still returns `403`, `onSyncError` dumps the service token's `azp` /
`aud` / `resource_access` claims and reports which client (if any) actually
holds `cms:access`.

## License

MIT © Skylab Kulübü — see [LICENSE](LICENSE).

Uses [`inscribed`](https://www.npmjs.com/package/inscribed) (LGPL-3.0-or-later) as
a peer dependency (not bundled); that license governs `inscribed` itself, not
this adapter.