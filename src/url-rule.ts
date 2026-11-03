// where a key may be sent (block 472; shared with scripts/snapshot.mjs since
// block 492): cuehq itself (https, the www host) or a local server for
// testing. anything else, or a URL carrying credentials, is refused.
export const DEFAULT_URL = 'https://www.cuehq.social/mcp';
export const URL_RULE = 'CUEHQ_MCP_URL must be https://www.cuehq.social/mcp or a localhost URL.';

export function allowedUrl(u: URL): boolean {
  if (u.username || u.password) return false;
  if (u.protocol === 'https:' && u.host === 'www.cuehq.social') return true;
  return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

// the endpoint CUEHQ_MCP_URL names (the default when unset), or null when it
// is not a URL or not an allowed one; the caller reports URL_RULE.
export function endpointFromEnv(raw: string | undefined): URL | null {
  let u: URL;
  try {
    u = new URL(raw || DEFAULT_URL);
  } catch {
    return null;
  }
  return allowedUrl(u) ? u : null;
}
