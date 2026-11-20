function safeText(value, max = 1000) {
  return String(value ?? '')
    .replace(/(access_token|refresh_token|password|client_secret|authorization)\s*[:=]\s*["']?[^"'\s,}]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .slice(0, max);
}

export async function getUniwareConfig() {
  const baseUrl = process.env.UNIWARE_BASE_URL;
  const username = process.env.UNIWARE_USERNAME;
  const password = process.env.UNIWARE_PASSWORD;
  const clientId = process.env.UNIWARE_CLIENT_ID || 'my-trusted-client';
  const facility = process.env.UNIWARE_FACILITY_CODE || process.env.UNIWARE_TENANT_CODE || 'kuchipoo';
  const missing = [];
  if (!baseUrl) missing.push('UNIWARE_BASE_URL');
  if (!username) missing.push('UNIWARE_USERNAME');
  if (!password) missing.push('UNIWARE_PASSWORD');
  if (!clientId) missing.push('UNIWARE_CLIENT_ID');
  if (missing.length) throw Object.assign(new Error(`Missing environment variables: ${missing.join(', ')}`), { code: 'CONFIG_MISSING' });

  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== 'https:' || !/(^|\.)unicommerce\.com$/i.test(base.hostname)) throw new Error('invalid host');
  } catch {
    throw Object.assign(new Error('UNIWARE_BASE_URL must be an HTTPS Uniware tenant URL.'), { code: 'INVALID_BASE_URL' });
  }
  return { base, username, password, clientId, facility };
}

export async function getAccessToken(config) {
  const tokenUrl = new URL('/oauth/token', config.base.origin);
  tokenUrl.searchParams.set('grant_type', 'password');
  tokenUrl.searchParams.set('client_id', config.clientId);
  tokenUrl.searchParams.set('username', config.username);
  tokenUrl.searchParams.set('password', config.password);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(tokenUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (!response.ok || !data.access_token) {
      const description = safeText(data.error_description || data.message || data.error || raw || `HTTP ${response.status}`, 500);
      throw Object.assign(new Error(`Uniware OAuth failed (HTTP ${response.status}): ${description}`), {
        code: 'OAUTH_FAILED', upstreamStatus: response.status
      });
    }
    return data.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

export async function uniwarePost(config, token, path, body) {
  const response = await fetch(new URL(path, config.base.origin), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Facility: config.facility
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { rawMessage: safeText(raw, 1200) }; }
  if (!response.ok) {
    const detail = safeText(data.message || data.description || data.rawMessage || `HTTP ${response.status}`, 900);
    const diagnostic = {
      upstreamStatus: response.status,
      contentType: safeText(response.headers.get('content-type') || 'unknown', 120),
      responseBody: safeText(raw || '(empty response body)', 1200),
      requestPath: path,
      requestFieldNames: Object.keys(body || {})
    };
    throw Object.assign(new Error(`Uniware API failed (HTTP ${response.status}): ${detail}`), {
      code: 'UNIWARE_API_FAILED',
      upstreamStatus: response.status,
      diagnostic
    });
  }
  if (data && data.successful === false) {
    const diagnostic = {
      upstreamStatus: response.status,
      contentType: safeText(response.headers.get('content-type') || 'unknown', 120),
      responseBody: safeText(raw || '(empty response body)', 1200),
      requestPath: path,
      requestFieldNames: Object.keys(body || {})
    };
    throw Object.assign(new Error(safeText(data.message || 'Uniware rejected the export request.', 900)), {
      code: 'UNIWARE_REQUEST_REJECTED', upstreamStatus: response.status, diagnostic
    });
  }
  return data;
}

export { safeText };
