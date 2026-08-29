// Client-side-only JWT storage (ADR-5: stateless auth, no server session).
// There is no `/auth/logout` endpoint by design — logging out just discards
// the token here; an already-issued token stays valid server-side until it
// expires naturally (~15-30 min, docs/architecture.md §13).
const TOKEN_KEY = "hwaf_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}
