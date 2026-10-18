export const PLAYER_TOKEN_KEY = "btc-arena.token";

export function readToken(): string | null {
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(PLAYER_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(PLAYER_TOKEN_KEY);
}
