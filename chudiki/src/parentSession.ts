const TOKEN_KEY = "zoofun-parent-token";
const FROM_SITE_KEY = "zoofun-from-site";

export type ParentSession = {
  token: string | null;
  fromSite: boolean;
};

/** Take a parent token from the site iframe URL, then hide it from the address bar. */
export function bootstrapParentSession(): ParentSession {
  const params = new URLSearchParams(window.location.search);
  const incoming = params.get("token");
  const fromSite = params.get("from") === "site";

  if (incoming) {
    sessionStorage.setItem(TOKEN_KEY, incoming);
    params.delete("token");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }
  if (fromSite) {
    sessionStorage.setItem(FROM_SITE_KEY, "1");
  }

  return {
    token: incoming ?? sessionStorage.getItem(TOKEN_KEY),
    fromSite: fromSite || sessionStorage.getItem(FROM_SITE_KEY) === "1",
  };
}

export async function readParentProfile(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/zoo/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
