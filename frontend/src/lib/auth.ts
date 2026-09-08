// Client-side-only JWT storage (ADR-5: stateless auth, no server session).
// There is no `/auth/logout` endpoint by design — logging out just discards
// the token here; an already-issued token stays valid server-side until it
// expires naturally (~15-30 min, docs/architecture.md §13).
const TOKEN_KEY = "hwaf_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.localStorage.getItem(TOKEN_KEY) ??
    window.sessionStorage.getItem(TOKEN_KEY)
  );
}

// `remember` controls storage lifetime, not the auth model itself (still
// stateless JWT, ADR-5): checked -> localStorage (survives closing the
// browser), unchecked -> sessionStorage (cleared when the tab/browser
// closes). Either way the token still expires server-side on its own.
export function setToken(token: string, remember = true): void {
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
}
