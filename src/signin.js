/**
 * @file `@skylab-kulubu/inscribed-auth/signin` — signin route handler factory.
 *
 * Server-only App Router route handler that auto-submits the user to NextAuth's
 * provider sign-in flow, skipping the "Sign in with X" confirm page that
 * NextAuth shows when its sign-in URL is hit with GET. The route returns
 * a tiny HTML document that fetches the CSRF token and POSTs the sign-in
 * form via JavaScript - the same dance `next-auth/react`'s `signIn()`
 * helper does, just done from a server route so the consumer can link to
 * `/api/signin` from anywhere (server components, plain anchors, server
 * actions) without bundling client-side helpers.
 *
 * Usage (consumer side):
 *
 *   // app/api/signin/route.js
 *   export { GET } from "@skylab-kulubu/inscribed-auth/signin";
 *
 * Or with explicit provider id / forced callback URL:
 *
 *   import { createSignInRoute } from "@skylab-kulubu/inscribed-auth/signin";
 *   export const GET = createSignInRoute({ provider: "keycloak" });
 *
 * The `callbackUrl` query parameter is forwarded to NextAuth so the user
 * lands back where they came from after signing in. Defaults to "/".
 *
 * `<noscript>` users get a link to NextAuth's standard provider page
 * (the one with the "Sign in with X" button) so sign-in still works
 * without JavaScript - it just can't skip the extra click.
 */

/**
 * @typedef {Object} CreateSignInRouteOptions
 * @property {string} [provider]
 *   Provider id NextAuth registered. Default `"keycloak"`. Set to `null`
 *   (or `""`) to land on NextAuth's provider-picker page instead.
 * @property {string} [defaultCallbackUrl]
 *   Where to send the user when no `?callbackUrl=` query is present. Default `"/"`.
 * @property {string} [signInPath]
 *   Override the NextAuth sign-in mount path. Default `/api/auth/signin`.
 * @property {string} [csrfPath]
 *   Override the NextAuth CSRF endpoint. Default `/api/auth/csrf`.
 */

/**
 * @param {CreateSignInRouteOptions} [options]
 */
export function createSignInRoute(options = {}) {
  const {
    provider = "keycloak",
    defaultCallbackUrl = "/",
    signInPath = "/api/auth/signin",
    csrfPath = "/api/auth/csrf",
  } = options;

  const signInUrl = provider ? `${signInPath}/${provider}` : signInPath;

  /**
   * @param {Request} request
   * @returns {Response}
   */
  return function GET(request) {
    const url = new URL(request.url);
    const callbackUrl = url.searchParams.get("callbackUrl") ?? defaultCallbackUrl;

    const html = renderAutoSubmitPage({
      signInUrl,
      csrfPath,
      callbackUrl,
      // <noscript> fallback - NextAuth's own GET sign-in page, which
      // shows the "Sign in with X" button. It's a worse UX (extra click)
      // but it's the only thing that works without JS.
      noscriptHref: `${signInUrl}?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Don't let browsers/proxies cache this - the form needs a fresh
        // CSRF token on every visit.
        "Cache-Control": "no-store",
      },
    });
  };
}

/**
 * Build the auto-submit HTML page. All user-controlled values are
 * embedded with `escapeForScript` to prevent `</script>` and other XSS
 * vectors when the value lands inside the inline `<script>` block.
 *
 * @param {{ signInUrl: string, csrfPath: string, callbackUrl: string, noscriptHref: string }} args
 */
function renderAutoSubmitPage({ signInUrl, csrfPath, callbackUrl, noscriptHref }) {
  const jsSignInUrl = escapeForScript(signInUrl);
  const jsCsrfPath = escapeForScript(csrfPath);
  const jsCallbackUrl = escapeForScript(callbackUrl);
  const htmlNoscriptHref = escapeForHtmlAttribute(noscriptHref);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Signing in…</title>
<meta name="robots" content="noindex,nofollow">
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center;
         font: 14px/1.5 system-ui, -apple-system, sans-serif; color: #6b7280; }
</style>
</head>
<body>
<p>Signing in…</p>
<noscript>
  <p><a href=${htmlNoscriptHref}>Continue to sign in</a></p>
</noscript>
<script>
(function () {
  fetch(${jsCsrfPath}, { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var form = document.createElement("form");
      form.method = "POST";
      form.action = ${jsSignInUrl};
      var fields = { csrfToken: data.csrfToken, callbackUrl: ${jsCallbackUrl} };
      for (var key in fields) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = fields[key];
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    })
    .catch(function () {
      // CSRF fetch failed - drop the user on NextAuth's confirm page so
      // they can still complete sign-in manually.
      window.location.replace(${escapeForScript(noscriptHref)});
    });
})();
</script>
</body>
</html>`;
}

// U+2028 / U+2029 are valid string contents in JSON output but illegal in
// JavaScript string literals - inline <script> would parse the response
// as a syntax error. Built from char codes so this source file itself
// stays free of literal separator characters that confuse parsers/diffs.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * Encode a string as a JavaScript string literal safe for inline `<script>`.
 * `JSON.stringify` handles quotes/control chars; the extra replacements
 * neutralise sequences that could otherwise close the script tag or
 * smuggle in HTML.
 *
 * @param {string} value
 */
function escapeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LINE_SEPARATOR).join("\\u2028")
    .split(PARAGRAPH_SEPARATOR).join("\\u2029");
}

/**
 * Encode a string for use as an HTML attribute value with surrounding
 * double quotes embedded by the caller.
 *
 * @param {string} value
 */
function escapeForHtmlAttribute(value) {
  return `"${value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}"`;
}

/** Default GET handler — `export { GET } from "@skylab-kulubu/inscribed-auth/signin"`. */
export const GET = createSignInRoute();
