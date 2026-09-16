export function readClientRoles(accessToken) {
  if (!accessToken) return [];
  const segments = accessToken.split(".");
  if (segments.length < 2) return [];
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    );
    const azp = payload?.azp;
    if (!azp) return [];
    const roles = payload?.resource_access?.[azp]?.roles ?? [];
    return Array.isArray(roles) ? roles.filter((role) => typeof role === "string") : [];
  } catch {
    return [];
  }
}
