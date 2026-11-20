export default function handler(req, res) {
  const required = ["UNIWARE_BASE_URL","UNIWARE_USERNAME","UNIWARE_PASSWORD","UNIWARE_CLIENT_ID"];
  const missing = required.filter(k => !process.env[k]);
  res.status(200).json({
    configured: missing.length === 0,
    tenant: process.env.UNIWARE_TENANT_CODE || "kuchipoo",
    baseUrlConfigured: Boolean(process.env.UNIWARE_BASE_URL),
    missing
  });
}
