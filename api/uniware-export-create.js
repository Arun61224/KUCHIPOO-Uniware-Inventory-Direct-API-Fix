import { getUniwareConfig, getAccessToken, uniwarePost, safeText } from '../lib/uniware.js';

function fail(res, code, message, extra = {}, httpStatus = 400) {
  return res.status(httpStatus).json({ ok: false, code, message, ...extra });
}
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00+05:30`)); }
// Uniware dateRange examples are UTC. Convert India-local calendar boundaries to UTC.
function indiaDateToUtc(date, end = false) {
  return new Date(`${date}T${end ? '23:59:59' : '00:00:00'}+05:30`).toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, message: 'Use POST.' }); }
  try {
    const reportType = String(req.body?.reportType || 'inventory').toLowerCase();
    let payload;
    if (reportType === 'inventory') {
      // Use Uniware's dedicated Inventory Snapshot REST API instead of Export Job columns.
      // Export Job column labels are rejected by this tenant as INVALID_EXPORT_JOB_COLUMN.
      const config = await getUniwareConfig();
      const token = await getAccessToken(config);
      const result = await uniwarePost(config, token, '/services/rest/v1/inventory/inventorySnapshot/get', {});
      const snapshots = Array.isArray(result.inventorySnapshots) ? result.inventorySnapshots : [];
      const bySku = new Map();
      for (const row of snapshots) {
        const sku = String(row.itemTypeSKU || '').trim();
        if (!sku) continue;
        const qty = Number(row.inventory || 0);
        bySku.set(sku, (bySku.get(sku) || 0) + (Number.isFinite(qty) ? qty : 0));
      }
      const inventory = [...bySku.entries()].map(([skuCode, inventory]) => ({ skuCode, inventory }));
      const totalInventory = inventory.reduce((sum, row) => sum + row.inventory, 0);
      return res.status(200).json({
        ok: true,
        mode: 'direct-inventory-snapshot',
        report: 'Inventory Snapshot',
        message: 'Inventory Snapshot fetched directly from Uniware.',
        recordCount: inventory.length,
        totalInventory,
        inventory
      });
    } else if (reportType === 'sales') {
      const startDate = String(req.body?.startDate || '');
      const endDate = String(req.body?.endDate || '');
      const filterId = Number(req.body?.filterId);
      if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return fail(res, 'INVALID_DATE_RANGE', 'Enter a valid date range in YYYY-MM-DD format.');
      const start = new Date(`${startDate}T00:00:00+05:30`);
      const end = new Date(`${endDate}T23:59:59+05:30`);
      const days = Math.floor((end - start) / 86400000) + 1;
      if (days > 92) return fail(res, 'DATE_RANGE_TOO_LARGE', 'Uniware allows a maximum date range of 3 months. Split the export into smaller ranges.');
      if (!Number.isInteger(filterId) || filterId <= 0) return fail(res, 'SALES_FILTER_ID_REQUIRED', 'Sale Orders date filter ID is not configured. Enter the numeric ID for “Invoiced In Date Range” once Uniware/POC confirms it.');
      payload = {
        exportJobTypeName: 'Sale Orders',
        exportColums: ['Item SKU Code', 'Invoice Created', 'Channel Name'],
        exportFilters: [{ id: filterId, text: 'Invoiced In Date Range', dateRange: { start: indiaDateToUtc(startDate), end: indiaDateToUtc(endDate) }, checked: true }],
        frequency: 'ONETIME',
        reportName: `KUCHIPOO Sale Orders ${startDate} to ${endDate}`
      };
    } else return fail(res, 'INVALID_REPORT_TYPE', 'reportType must be inventory or sales.');

    const config = await getUniwareConfig();
    const token = await getAccessToken(config);
    const result = await uniwarePost(config, token, '/services/rest/v1/export/job/create', payload);
    if (result.successful !== true || !result.jobCode) {
      return fail(res, 'EXPORT_CREATE_REJECTED', safeText(result.message || 'Uniware did not confirm export job creation.', 500), {
        errors: Array.isArray(result.errors) ? result.errors.map(e => ({ code: e.code, fieldName: safeText(e.fieldName, 100), description: safeText(e.description, 300), message: safeText(e.message, 300) })) : []
      });
    }
    return res.status(200).json({ ok: true, message: `${payload.exportJobTypeName} export job created successfully.`, exportJobId: result.exportJobId || null, jobCode: result.jobCode, report: payload.exportJobTypeName, columns: payload.exportColums, dateRange: reportType === 'sales' ? { startDate: req.body.startDate, endDate: req.body.endDate } : null });
  } catch (error) {
    const diagnostic = error.diagnostic || null;
    console.error('Uniware export create failed', JSON.stringify({
      code: error.code || 'ERROR',
      upstreamStatus: error.upstreamStatus || null,
      message: safeText(error.message, 900),
      diagnostic
    }));
    return fail(res, error.code || 'EXPORT_CREATE_FAILED', safeText(error.message || 'Could not create Uniware export.', 900), {
      upstreamStatus: error.upstreamStatus || null,
      diagnostic
    }, error.upstreamStatus ? 502 : 500);
  }
}
