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
 * @property {string} [background]
 *   CSS background for the sign-in splash. Defaults to `light-dark(Canvas,
 *   #1c1815)` — light mode follows the system canvas, dark mode uses a warm
 *   near-black. Pass your app's background as a concrete value (hex, `rgb()`,
 *   gradient, or your own `light-dark(...)`) to match its theme. This is a
 *   separate document, so app-defined custom properties (`var(--...)`) aren't
 *   available here — pass the resolved value or wire it from the same
 *   source/env the app uses.
 * @property {string} [color]
 *   CSS foreground color for the logo + text. Defaults to `CanvasText`. The
 *   loader is drawn in `currentColor`, so this is what tints it.
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
    background = "light-dark(Canvas, #1c1815)",
    color = "CanvasText",
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
      background,
      color,
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

// ---------------------------------------------------------------------------
// Brand loader. The app ships a `<SkylabLoader>` React component (framer-motion),
// but this route returns a plain HTML string with no client framework, so the
// same logo is reproduced here as static inline SVG driven by CSS + SMIL. That
// also means the animation keeps running under a strict CSP that blocks the
// inline <script> - the loader never freezes silently.
// ---------------------------------------------------------------------------

/** Logo glyph outlines, keyed for the staggered draw. */
const LOGO_PATHS = {
  p12f85900: "M202.27 271.08C202.27 271.42 202.14 277.72 201.97 285.09C201.8 292.46 201.87 298.27 202.13 298.01C202.39 297.75 204.01 292.65 205.72 286.69L208.83 275.84L205.55 273.15C203.74 271.67 202.27 270.74 202.28 271.07L202.27 271.08Z",
  p15984f0: "M254.51 96.18C259.05 97.81 261.03 102.32 261.5 112.09L261.86 119.63L263.66 115.21C264.03 114.13 264.4 113.05 264.78 111.97C264.94 108.59 265.16 103.34 265.27 96.87C265.45 86.64 265.03 83.81 266.57 79.93C268.03 76.25 270.98 73.18 276.83 67.09L285.42 58.14L289.06 47.76C290.39 43.98 291.67 40.79 292.48 39.15C292.81 38.48 293.06 38.08 293.21 38C293.35 38.07 293.61 38.48 293.94 39.15C294.75 40.79 296.03 43.98 297.36 47.76L301 58.14L309.59 67.09C315.44 73.18 318.39 76.25 319.85 79.93C321.39 83.81 320.97 86.63 321.15 96.87C321.26 103.34 321.48 108.59 321.64 111.97C322.01 113.05 322.38 114.13 322.76 115.21L324.56 119.63L324.92 112.09C325.39 102.32 327.37 97.81 331.91 96.18C333.56 95.59 335 95.05 335.11 94.98C335.35 94.83 320.48 53.26 314.4 37.09C303.07 6.93 301.53 3.78 296.83 1.27C295.42 0.52 294.65 0.12 293.94 0.02C293.66 9.31323e-10 293.46 -0.01 293.2 0C292.95 0 292.75 9.31323e-10 292.48 0.02C291.77 0.12 291 0.52 289.59 1.27C284.89 3.77 283.35 6.93 272.02 37.09C265.95 53.26 251.08 94.83 251.31 94.98C251.41 95.04 252.85 95.58 254.51 96.18Z",
  p1a20d600: "M300.36 401.43C298.05 399.2 295.67 398.18 293.2 398.37C290.74 398.19 288.37 399.2 286.06 401.43C281.41 405.92 250.43 443.34 249.35 445.77C248.76 447.1 248.46 449.28 248.68 450.63C249.47 455.44 285.34 548.6 287.14 550.51C289.04 552.53 291.22 553.7 293.21 553.9C293.21 553.9 293.21 553.9 293.22 553.9C295.2 553.7 297.38 552.53 299.29 550.51C301.09 548.6 336.96 455.44 337.75 450.63C337.97 449.29 337.67 447.1 337.08 445.77C336 443.34 305.02 405.93 300.37 401.43H300.36ZM305.97 484.19C299.28 502.24 293.6 517.1 293.35 517.22C293.34 517.22 293.29 517.15 293.23 517.03V517C293.23 517 293.23 517 293.23 517.02C293.23 517.02 293.23 517.02 293.23 517V517.03C293.17 517.16 293.12 517.23 293.11 517.22C292.86 517.11 287.18 502.25 280.49 484.19C273.8 466.14 268.38 451.21 268.44 451.01C268.86 449.67 292.39 422.73 293.11 422.77C293.13 422.77 293.18 422.8 293.23 422.83C293.28 422.79 293.33 422.76 293.35 422.76C294.06 422.72 317.6 449.67 318.02 451C318.08 451.2 312.66 466.13 305.97 484.18V484.19Z",
  p1cd4e100: "M156.39 277.82V437.85L174.06 420.19L191.73 402.53V323.38C191.73 279.85 191.48 244.25 191.17 244.27C190.86 244.29 182.91 251.84 173.5 261.06L156.39 277.81V277.82Z",
  p1dae6200: "M585.43 359.08C584.42 356.66 514 285.9 509.93 283.22C508.79 282.47 506.67 281.86 505.22 281.85C502.56 281.85 455.76 294.86 449.76 297.27C443.91 299.62 442.21 304.11 444.6 310.89C447.69 319.64 467.07 359.3 469.19 361.22C472.21 363.95 486.86 365.69 538.48 369.43C576.82 372.21 580.5 372.11 584.74 368.14C586.7 366.3 586.96 362.78 585.42 359.09L585.43 359.08ZM486.71 346.88L481.34 346.4L473.69 329.81C469.49 320.69 466.19 312.84 466.37 312.38C466.63 311.71 500.83 301.22 502.22 301.38C502.43 301.4 513.85 312.45 527.6 325.92C541.35 339.39 552.6 350.64 552.6 350.92C552.6 351.35 502.15 348.26 486.7 346.88H486.71Z",
  p20f79d00: "M284.09 79.39L275.34 88.23L275.08 235.98L274.82 383.73H293.23H293.95H311.62L311.36 235.98L311.1 88.23L302.35 79.39C298.65 75.66 295.38 72.46 293.95 71.17C293.56 70.82 293.31 70.61 293.23 70.58C293.15 70.62 292.9 70.83 292.51 71.18C291.08 72.47 287.81 75.67 284.11 79.4L284.09 79.39Z",
  p28bb8280: "M136.66 297.27C130.66 294.86 83.86 281.84 81.2 281.85C79.75 281.85 77.63 282.47 76.49 283.22C72.42 285.9 2 356.66 0.99 359.08C-0.55 362.77 -0.29 366.3 1.67 368.13C5.91 372.1 9.59 372.21 47.93 369.42C99.56 365.68 114.21 363.94 117.22 361.21C119.34 359.29 138.72 319.62 141.81 310.88C144.2 304.1 142.5 299.62 136.65 297.26L136.66 297.27ZM112.73 329.81L105.08 346.4L99.71 346.88C84.27 348.26 33.81 351.35 33.81 350.92C33.81 350.64 45.06 339.39 58.81 325.92C72.56 312.45 83.98 301.4 84.19 301.38C85.58 301.22 119.78 311.71 120.04 312.38C120.22 312.84 116.92 320.68 112.72 329.81H112.73Z",
  p2cc72200: "M251.13 383.35V244.62C251.13 168.32 251.04 105.89 250.94 105.89C250.84 105.89 242.88 113.76 233.27 123.38L215.79 140.87V383.35H251.13Z",
  p3097fa00: "M395.27 244.28C394.96 244.26 394.71 279.86 394.71 323.39V402.54L412.38 420.2L430.05 437.86V277.83L412.94 261.08C403.53 251.87 395.58 244.31 395.27 244.29V244.28Z",
  p36c88b00: "M320.98 368.13V378.84C322.24 379.74 323.5 380.64 324.77 381.54V359.68C323.51 358.72 322.25 357.75 320.98 356.79V368.14V368.13Z",
  p3b5dc900: "M392.63 160.9L381.16 160.78V179.44L387.36 179.87C390.77 180.11 406.25 180.66 421.76 181.09C461.49 182.2 494.23 183.36 494.54 183.68C494.76 183.9 419.91 243.04 415.44 246.17C414.1 247.11 414.39 247.59 420.22 253.98C423.64 257.72 426.65 260.78 426.91 260.77C427.18 260.77 440.59 250.44 456.72 237.83C472.85 225.22 489.09 212.56 492.81 209.69C496.53 206.83 505.82 199.46 513.46 193.32C524.59 184.37 527.7 181.46 529.15 178.64C532.97 171.23 529.66 167.27 518.62 166.05C506.9 164.75 466.22 162.84 423.63 161.59C412.88 161.27 398.92 160.96 392.61 160.9H392.63Z",
  p3cad3800: "M384.3 298.01C384.56 298.27 384.64 292.46 384.46 285.09C384.29 277.72 384.15 271.42 384.16 271.08C384.16 270.74 382.69 271.68 380.89 273.16L377.61 275.85L380.72 286.7C382.43 292.67 384.04 297.76 384.31 298.02L384.3 298.01Z",
  p4c50c00: "M261.67 381.54C262.93 380.64 264.19 379.74 265.46 378.84V356.79C264.2 357.75 262.94 358.72 261.67 359.68V381.54Z",
  p543f872: "M370.64 383.35V140.87L353.16 123.38C343.55 113.76 335.6 105.89 335.49 105.89C335.38 105.89 335.3 168.32 335.3 244.62V383.35H370.64Z",
  p596f400: "M213.15 391.35L201.88 398.68C201.54 400.62 201.3 402.3 200.64 404.18C198.89 409.17 186.19 420.53 181.71 424.97C177.48 429.15 172.75 433.77 168.62 438.06C165 441.82 157.27 448.3 152.12 444.77C150.93 443.95 150.05 443.12 149.18 441.96C147.49 439.71 145.46 431.83 145.5 431.49C145.59 430.65 140.15 446.25 146.13 450.76C147.39 451.71 149 452.13 149.46 452.23C152.29 452.85 155.07 451.97 158.13 450.79C165.4 447.97 173.68 441.39 180.31 437.02C194.5 427.67 208.44 417.81 222.54 408.1C228.96 403.68 236.37 398.88 242.73 394.58C243.34 394.17 244.14 393.3 244.49 392.28H215.41C215.19 392.28 213.81 391.48 213.16 391.35H213.15Z",
  p5ee5d00: "M379.16 133.04C380.94 136.68 383.44 137.87 389 137.73C396.82 137.53 442.29 129.24 445.2 127.48C447.15 126.3 452.13 115.85 457.1 102.5C468.6 71.62 483.02 30.41 483.81 26.11C484.47 22.55 483.05 17.5 480.99 16.06C480.08 15.42 477.77 14.9 475.84 14.9C471.63 14.9 469.88 15.77 443.21 31.15C432.46 37.35 414 47.92 402.18 54.64C385.46 64.15 380.38 67.39 379.25 69.26C377.87 71.54 377.79 73.28 377.82 100.99C377.84 127.41 377.98 130.58 379.17 133.03L379.16 133.04ZM396.23 98.56L396.25 79.2L426.42 61.91C443.01 52.4 456.93 44.48 457.35 44.33C457.78 44.17 457.9 44.58 457.63 45.29C457.37 45.98 454.75 53.38 451.82 61.75C448.89 70.11 445.69 79.15 444.71 81.84C443.73 84.53 440.99 92.31 438.62 99.13C436.25 105.95 434.27 111.61 434.21 111.7C434.12 111.84 397.28 117.93 396.52 117.93C396.35 117.93 396.22 109.22 396.23 98.57V98.56Z",
  p7800: "M129.34 102.51C134.31 115.85 139.29 126.31 141.24 127.49C144.14 129.24 189.62 137.53 197.44 137.74C203 137.88 205.5 136.69 207.28 133.05C208.47 130.61 208.61 127.44 208.63 101.01C208.66 73.3 208.58 71.55 207.2 69.28C206.06 67.4 200.99 64.17 184.27 54.66C172.46 47.94 154 37.37 143.24 31.17C116.57 15.79 114.82 14.92 110.61 14.92C108.68 14.92 106.37 15.44 105.46 16.08C103.4 17.52 101.98 22.57 102.64 26.13C103.43 30.43 117.85 71.64 129.35 102.52L129.34 102.51ZM129.08 44.32C129.5 44.48 143.41 52.39 160.01 61.9L190.18 79.19L190.2 98.55C190.21 109.2 190.08 117.91 189.91 117.91C189.14 117.91 152.3 111.82 152.22 111.68C152.17 111.59 150.18 105.94 147.81 99.11C145.44 92.29 142.7 84.5 141.72 81.82C140.74 79.13 137.54 70.09 134.61 61.73C131.68 53.37 129.07 45.96 128.8 45.27C128.53 44.56 128.65 44.14 129.08 44.31V44.32Z",
  p9522b80: "M72.95 193.32C80.58 199.46 89.87 206.83 93.6 209.69C97.32 212.55 113.56 225.22 129.69 237.83C145.82 250.44 159.23 260.77 159.5 260.77C159.77 260.77 162.78 257.72 166.19 253.98C172.02 247.6 172.31 247.11 170.97 246.17C166.5 243.04 91.65 183.9 91.87 183.68C92.18 183.37 124.92 182.2 164.65 181.09C180.16 180.66 195.64 180.11 199.05 179.87L205.25 179.44V160.78L193.78 160.9C187.47 160.97 173.52 161.28 162.76 161.59C120.17 162.84 79.49 164.75 67.77 166.05C56.73 167.27 53.42 171.23 57.24 178.64C58.69 181.46 61.8 184.37 72.93 193.32H72.95Z",
  pe3cee00: "M440.93 431.49C440.97 431.83 438.94 439.71 437.25 441.96C436.38 443.12 435.5 443.95 434.31 444.77C429.16 448.3 421.43 441.82 417.81 438.06C413.68 433.77 408.94 429.15 404.72 424.97C400.24 420.54 387.54 409.17 385.79 404.18C385.13 402.29 384.89 400.62 384.55 398.68L373.28 391.35C372.63 391.48 371.25 392.28 371.03 392.28H341.95C342.3 393.31 343.1 394.17 343.71 394.58C350.07 398.88 357.47 403.68 363.9 408.1C378 417.81 391.95 427.67 406.13 437.02C412.77 441.39 421.05 447.97 428.31 450.79C431.37 451.98 434.15 452.86 436.98 452.23C437.43 452.13 439.05 451.71 440.31 450.76C446.29 446.25 440.85 430.65 440.94 431.49H440.93Z",
};

/** Draw order / stagger buckets - paths in the same bucket animate together. */
const LOGO_GROUPS = [
  ["p20f79d00"],
  ["p15984f0", "p1a20d600"],
  ["p2cc72200", "p543f872", "p4c50c00", "p36c88b00"],
  ["p1cd4e100", "p3097fa00", "p12f85900", "p3cad3800"],
  ["p28bb8280", "p1dae6200", "p7800", "p5ee5d00"],
  ["p9522b80", "p3b5dc900"],
  ["p596f400", "pe3cee00"],
];

/** @param {string} key */
function logoGroupIndex(key) {
  for (let g = 0; g < LOGO_GROUPS.length; g++) {
    if (LOGO_GROUPS[g].includes(key)) return g;
  }
  return LOGO_GROUPS.length;
}

/** Build the `<path>` markup, staggering each group's draw by 0.1s. */
function renderLogoPaths() {
  return Object.keys(LOGO_PATHS)
    .map((key) => {
      const delay = (logoGroupIndex(key) * 0.1).toFixed(1);
      return `<path d="${LOGO_PATHS[key]}" fill-rule="evenodd" clip-rule="evenodd" style="animation-delay:${delay}s"/>`;
    })
    .join("");
}

/**
 * Build the auto-submit HTML page: a centered, animated Skylab loader that
 * silently POSTs the user into the provider flow. User-controlled values are
 * escaped with `escapeForScript` / `escapeForHtmlAttribute` so they can't break
 * out of the inline `<script>` or the link attribute.
 *
 * A "continue to sign in" link sits below the loader, hidden, and is revealed:
 *   - after 10s by a pure-CSS animation - covers a slow/hung CSRF fetch AND a
 *     strict CSP that blocks the script (the loader would otherwise spin
 *     forever with no escape),
 *   - immediately for no-JS users (a `<noscript>` style override),
 *   - immediately if the fetch errors (the script tags it `.show`).
 *
 * @param {{ signInUrl: string, csrfPath: string, callbackUrl: string, noscriptHref: string, background: string, color: string }} args
 */
function renderAutoSubmitPage({ signInUrl, csrfPath, callbackUrl, noscriptHref, background, color }) {
  const jsSignInUrl = escapeForScript(signInUrl);
  const jsCsrfPath = escapeForScript(csrfPath);
  const jsCallbackUrl = escapeForScript(callbackUrl);
  const htmlNoscriptHref = escapeForHtmlAttribute(noscriptHref);
  const bg = cssValue(background, "light-dark(Canvas, #1c1815)");
  const fg = cssValue(color, "CanvasText");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Giriş yapılıyor…</title>
<meta name="robots" content="noindex,nofollow">
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  html { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100dvh;
    display: grid; place-items: center;
    background: ${bg}; color: ${fg};
    font: 14px/1.5 system-ui, -apple-system, sans-serif;
  }
  .loader { position: relative; width: 96px; height: 96px; }
  .glow {
    position: absolute; inset: 0; border-radius: 9999px;
    background: radial-gradient(circle, color-mix(in srgb, currentColor 9%, transparent) 0%, transparent 70%);
    filter: blur(8px);
    animation: glowPulse 3.2s ease-in-out infinite;
  }
  .logo { display: block; width: 100%; height: 100%; }
  .logo path {
    fill: url(#skylab-shimmer);
    transform-box: view-box; transform-origin: 293px 277px;
    opacity: 0;
    animation: pathPulse 3.2s ease-in-out infinite;
  }
  .fallback {
    position: fixed; left: 50%; top: calc(50% + 84px);
    transform: translateX(-50%);
    margin: 0; text-align: center; white-space: nowrap;
    opacity: 0; pointer-events: none;
    animation: reveal .5s ease-out 10s forwards;
  }
  .fallback.show { opacity: 1; pointer-events: auto; animation: none; }
  .fallback a { color: inherit; text-underline-offset: 3px; }
  @keyframes glowPulse {
    0% { opacity: 0; } 30% { opacity: .6; } 50% { opacity: 1; }
    75% { opacity: .6; } 100% { opacity: 0; }
  }
  @keyframes pathPulse {
    0% { opacity: 0; transform: scale(.97); }
    37.5% { opacity: 1; transform: scale(1); }
    68.75% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(.97); }
  }
  @keyframes reveal { to { opacity: 1; pointer-events: auto; } }
  @media (prefers-reduced-motion: reduce) {
    .glow, .logo path { animation: none; }
    .logo path { opacity: 1; }
  }
</style>
<noscript><style>.fallback { opacity: 1 !important; pointer-events: auto !important; animation: none !important; }</style></noscript>
</head>
<body>
<div class="loader" role="status" aria-label="Giriş yapılıyor">
  <div class="glow"></div>
  <svg class="logo" fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 586 554" aria-hidden="true">
    <defs>
      <linearGradient id="skylab-shimmer" gradientUnits="userSpaceOnUse" x1="-100" y1="0" x2="100" y2="0">
        <animate attributeName="x1" values="-100;700" dur="3.2s" calcMode="spline" keyTimes="0;1" keySplines="0.42 0 0.58 1" repeatCount="indefinite"/>
        <animate attributeName="x2" values="100;900" dur="3.2s" calcMode="spline" keyTimes="0;1" keySplines="0.42 0 0.58 1" repeatCount="indefinite"/>
        <stop offset="0" stop-color="currentColor" stop-opacity="0.4"/>
        <stop offset="0.5" stop-color="currentColor" stop-opacity="1"/>
        <stop offset="1" stop-color="currentColor" stop-opacity="0.4"/>
      </linearGradient>
    </defs>
    ${renderLogoPaths()}
  </svg>
</div>
<p class="fallback" id="inscribed-fallback"><a href=${htmlNoscriptHref}>Giriş işlemine devam et</a></p>
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
      // Swallow. The "continue" link reveals itself via the pure-CSS 10s timer
      // (and immediately for no-JS users), so the fallback is consistently 10s
      // - we don't short-circuit it on a fast error.
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

/**
 * Sanitise a consumer-provided CSS color/background before it lands in the
 * inline `<style>` block. These come from server-side config (trusted), but we
 * still strip characters that could close the declaration or the `<style>`.
 *
 * @param {unknown} value
 * @param {string} fallback
 */
function cssValue(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return value.replace(/[<>{};]/g, "").trim();
}

/** Default GET handler — `export { GET } from "@skylab-kulubu/inscribed-auth/signin"`. */
export const GET = createSignInRoute();
