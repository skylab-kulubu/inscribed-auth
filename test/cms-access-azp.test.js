import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readClientRoles } from "../src/lib/client-roles.js";
import { createCmsAuthOptions, isCmsAdmin, readCmsAuthMeta } from "../src/lib/options.js";

function unsignedJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

function options() {
  return createCmsAuthOptions({ provider: { id: "keycloak", name: "Keycloak" } });
}

async function sessionFor(payload) {
  const auth = options();
  const token = await auth.callbacks.jwt({
    token: {},
    account: {
      access_token: unsignedJwt(payload),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      providerAccountId: "user-1",
    },
  });
  return auth.callbacks.session({
    session: { user: {} },
    token,
  });
}

describe("cms:access is scoped to the Site client azp", () => {
  it("GeceKodu Leader with cms:access on azp is a CMS admin for that client", async () => {
    const token = unsignedJwt({
      azp: "gecekodu",
      resource_access: {
        gecekodu: { roles: ["cms:access"] },
        agc: { roles: ["cms:access"] },
        skycms: { roles: ["cms:access"] },
      },
    });
    assert.deepEqual(readClientRoles(token), ["cms:access"]);

    const session = await sessionFor({
      azp: "gecekodu",
      resource_access: {
        gecekodu: { roles: ["cms:access"] },
        agc: { roles: ["cms:access"] },
        skycms: { roles: ["cms:access"] },
      },
    });
    assert.deepEqual(session.user.clientRoles, ["cms:access"]);
    assert.equal(isCmsAdmin(session, readCmsAuthMeta(options())), true);
  });

  it("does not OR cms:access from other resource_access clients onto this azp", async () => {
    const token = unsignedJwt({
      azp: "gecekodu",
      resource_access: {
        agc: { roles: ["cms:access"] },
        skycms: { roles: ["cms:access"] },
      },
    });
    assert.equal(readClientRoles(token).includes("cms:access"), false);

    const session = await sessionFor({
      azp: "gecekodu",
      resource_access: {
        agc: { roles: ["cms:access"] },
        skycms: { roles: ["cms:access"] },
      },
    });
    assert.equal(isCmsAdmin(session, readCmsAuthMeta(options())), false);
  });

  it("AGC token does not inherit GeceKodu cms:access", async () => {
    const token = unsignedJwt({
      azp: "agc",
      resource_access: {
        gecekodu: { roles: ["cms:access"] },
        agc: { roles: ["view"] },
      },
    });
    assert.deepEqual(readClientRoles(token), ["view"]);

    const session = await sessionFor({
      azp: "agc",
      resource_access: {
        gecekodu: { roles: ["cms:access"] },
        agc: { roles: ["view"] },
      },
    });
    assert.deepEqual(session.user.clientRoles, ["view"]);
    assert.equal(isCmsAdmin(session, readCmsAuthMeta(options())), false);
  });
});
