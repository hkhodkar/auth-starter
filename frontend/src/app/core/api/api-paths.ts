export function isApiUrl(url: string): boolean {
  return /^\/api(\/|\?|$)/.test(url);
}

// these never carry the access token and a 401 from them must not trigger a refresh
const PUBLIC_AUTH = /^\/api\/auth\/(login|register|refresh|logout)(\?|$)/;

export function isPublicAuthUrl(url: string): boolean {
  return PUBLIC_AUTH.test(url);
}
