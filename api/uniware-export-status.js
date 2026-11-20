import { getUniwareConfig, getAccessToken, uniwarePost, safeText } from '../lib/uniware.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Use POST.' });
  }
  const jobCode = String(req.body?.jobCode || '').trim();
  if (!jobCode || jobCode.length > 200) return res.status(400).json({ ok: false, code: 'JOB_CODE_REQUIRED', message: 'Enter the export job code.' });
  try {
    const config = await getUniwareConfig();
    const token = await getAccessToken(config);
    const result = await uniwarePost(config, token, '/services/rest/v1/export/job/status', { jobCode });
    return res.status(200).json({
      ok: result.successful !== false,
      message: safeText(result.message || 'Export job status retrieved.', 500),
      status: safeText(result.status || 'UNKNOWN', 100),
      filePath: typeof result.filePath === 'string' ? safeText(result.filePath, 1500) : null,
      errors: Array.isArray(result.errors) ? result.errors.map(e => ({ code: e.code, fieldName: safeText(e.fieldName, 100), description: safeText(e.description, 300), message: safeText(e.message, 300) })) : []
    });
  } catch (error) {
    console.error('Uniware export status failed', JSON.stringify({ code: error.code || 'ERROR', upstreamStatus: error.upstreamStatus || null, message: safeText(error.message, 900), diagnostic: error.diagnostic || null }));
    return res.status(error.upstreamStatus ? 502 : 500).json({ ok: false, code: error.code || 'EXPORT_STATUS_FAILED', upstreamStatus: error.upstreamStatus || null, message: safeText(error.message || 'Could not read export job status.', 900), diagnostic: error.diagnostic || null });
  }
}
