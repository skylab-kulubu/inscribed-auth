"use client";

/**
 * @file `@skylab-kulubu/inscribed-auth` — client entry.
 *
 * NextAuth-aware wrapper around inscribed's `CmsProvider`. The inscribed core is
 * auth-agnostic; this is Skylab's NextAuth + Keycloak client wiring.
 *
 * Wraps children with NextAuth's `SessionProvider` (so you don't need to add it
 * to `layout.jsx`) and feeds `useSession()` into `CmsProvider` so admin saves
 * include a valid `Authorization: Bearer` header automatically.
 *
 * This is the only client surface in the package; keeping it isolated in the
 * `.` entry is what lets the top-level `"use client"` above survive bundling.
 */

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo } from "react";

import { CmsProvider } from "inscribed";

/**
 * @import { CmsConfig, BlockResponse } from "inscribed"
 */

/**
 * Inner component: needs to be inside `SessionProvider` to call `useSession`.
 *
 * @param {{
 *   config: CmsConfig | { baseUrl: string },
 *   isAdmin: boolean,
 *   userSub: string | null,
 *   initialBlocks?: BlockResponse[],
 *   onAfterSave?: (slug: string) => void | Promise<void>,
 *   children: React.ReactNode,
 * }} props
 */
function Inner({ config, isAdmin, userSub, initialBlocks, onAfterSave, children }) {
  const { data: session } = useSession();

  useEffect(() => {
    // Pass the provider id explicitly. Bare `signIn()` redirects to NextAuth's
    // provider-picker ("Sign in with Keycloak") interstitial; `signIn("keycloak")`
    // POSTs straight into the Keycloak flow and silently re-auths while the
    // Keycloak SSO session is still alive - no extra page, no extra click.
    if (session?.error === "RefreshAccessTokenError") signIn("keycloak");
  }, [session?.error]);

  const getAccessToken = useCallback(
    async () => /** @type {string} */ (session?.accessToken ?? ""),
    [session?.accessToken],
  );

  // Surface identity for the admin panel footer. Re-build only when the
  // underlying values change so CmsProvider's memo doesn't bust on every
  // render of this component.
  const userInfo = useMemo(
    () =>
      session?.user
        ? {
            name: session.user.name ?? null,
            email: session.user.email ?? null,
            image: session.user.image ?? null,
          }
        : null,
    [session?.user?.name, session?.user?.email, session?.user?.image],
  );

  const onSignOut = useCallback(() => {
    signOut({ callbackUrl: "/" });
  }, []);

  return (
    <CmsProvider config={config} isAdmin={isAdmin} userSub={userSub}
      initialBlocks={initialBlocks} onAfterSave={onAfterSave}
      getAccessToken={isAdmin ? getAccessToken : undefined}
      userInfo={userInfo}
      onSignOut={onSignOut}
    >
      {children}
    </CmsProvider>
  );
}

/**
 * Drop-in replacement for `CmsProvider` when using NextAuth + Keycloak.
 *
 * The parent Server Component should:
 * 1. Call `getServerSession(authOptions)` to get the session
 * 2. Derive `isAdmin` (e.g. `session !== null`) and `userSub` (`session?.user?.id`)
 * 3. Server-fetch `initialBlocks` with `getCmsContent`
 * 4. Pass `onAfterSave={revalidateCmsSlug}` from `inscribed/actions`
 *
 * @param {{
 *   config: CmsConfig | { baseUrl: string },
 *   isAdmin: boolean,
 *   userSub: string | null,
 *   initialBlocks?: BlockResponse[],
 *   onAfterSave?: (slug: string) => void | Promise<void>,
 *   session?: import("next-auth").Session | null,
 *   children: React.ReactNode,
 * }} props
 */
export function NextAuthCmsProvider({ session, ...props }) {
  return (
    <SessionProvider session={session}>
      <Inner {...props} />
    </SessionProvider>
  );
}