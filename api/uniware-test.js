function safeText(value, max = 1200) {
  return String(value || '')
    .replace(/(access_token|refresh_token|password|client_secret|authorization)\s*[:=]\s*["']?[^"'\s,}]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .slice(0, max);
}

function safeErrorFields(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const allowed = ['error', 'error_description', 'message', 'status', 'code', 'path', 'timestamp'];
  const result = {};
  for (const key of allowed) {
    const value = payload[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = safeText(value, 500);
    }
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST for the connection test.' });
  }

  const { UNIWARE_BASE_URL, UNIWARE_USERNAME, UNIWARE_PASSWORD, UNIWARE_CLIENT_ID } = process.env;
  const required = ['UNIWARE_BASE_URL', 'UNIWARE_USERNAME', 'UNIWARE_PASSWORD', 'UNIWARE_CLIENT_ID'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(200).json({ ok: false, code: 'CONFIG_MISSING', message: `Missing environment variables: ${missing.join(', ')}`, diagnostic: { stage: 'configuration' } });
  }

  let base;
  try {
    base = new URL(UNIWARE_BASE_URL);
    if (base.protocol !== 'https:' || !/(^|\.)unicommerce\.com$/i.test(base.hostname)) throw new Error('invalid host');
  } catch {
    return res.status(200).json({ ok: false, code: 'INVALID_BASE_URL', message: 'Base URL must be an HTTPS Uniware tenant host, such as https://yourtenant.unicommerce.com.', diagnostic: { stage: 'base-url-validation' } });
  }

  const tokenUrl = new URL('/oauth/token', base.origin);
  tokenUrl.searchParams.set('grant_type', 'password');
  tokenUrl.searchParams.set('client_id', UNIWARE_CLIENT_ID);
  // Uniware POC confirmed username/password must be query parameters, not headers.
  tokenUrl.searchParams.set('username', UNIWARE_USERNAME);
  tokenUrl.searchParams.set('password', UNIWARE_PASSWORD);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(tokenUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    const raw = await upstream.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = null; }

    if (upstream.ok && payload?.access_token) {
      return res.status(200).json({
        ok: true,
        code: 'CONNECTED',
        message: 'Uniware authentication successful. Access token received securely.',
        tokenType: payload.token_type || 'bearer',
        expiresIn: Number.isFinite(Number(payload.expires_in)) ? Number(payload.expires_in) : null,
        diagnostic: { stage: 'oauth', upstreamStatus: upstream.status, contentType: upstream.headers.get('content-type') || 'unknown', host: base.hostname, path: '/oauth/token' }
      });
    }

    const fields = safeErrorFields(payload);
    const description = String(fields.error_description || fields.message || fields.error || '').toLowerCase();
    let code = 'UPSTREAM_ERROR';
    let message = 'Uniware did not return an access token. Review the diagnostic details below.';
    if (/otp|mfa|multi.?factor|verification code|two.?factor/.test(description)) {
      code = 'OTP_REQUIRED';
      message = 'Uniware appears to require an OTP or additional verification. Ask Uniware support for an API/service-user authentication method that supports unattended access.';
    } else if (upstream.status === 401 || upstream.status === 403) {
      code = 'AUTH_REJECTED';
      message = 'Uniware rejected the credentials or API access. Confirm the API user is active and has API access.';
    }

    console.error('Uniware OAuth diagnostic', JSON.stringify({
      upstreamStatus: upstream.status,
      contentType: upstream.headers.get('content-type') || 'unknown',
      host: base.hostname,
      path: '/oauth/token',
      responseFields: fields,
      responsePreview: payload ? undefined : safeText(raw, 1200)
    }));

    return res.status(200).json({
      ok: false,
      code,
      message,
      diagnostic: {
        stage: 'oauth-response',
        upstreamStatus: upstream.status,
        contentType: upstream.headers.get('content-type') || 'unknown',
        host: base.hostname,
        path: '/oauth/token',
        responseFields: fields,
        responsePreview: payload ? undefined : safeText(raw, 1200)
      }
    });
  } catch (error) {
    const timeoutError = error?.name === 'AbortError';
    console.error('Uniware OAuth connection error', JSON.stringify({ name: error?.name || 'Error', message: safeText(error?.message || 'Unknown error', 500), host: base.hostname, path: '/oauth/token' }));
    return res.status(200).json({
      ok: false,
      code: timeoutError ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timeoutError ? 'Uniware authentication timed out after 15 seconds.' : 'Could not reach the Uniware authentication endpoint. Check the diagnostic details.',
      diagnostic: { stage: 'network', errorName: error?.name || 'Error', errorMessage: safeText(error?.message || 'Unknown error', 500), host: base.hostname, path: '/oauth/token' }
    });
  } finally {
    clearTimeout(timeout);
  }
}
