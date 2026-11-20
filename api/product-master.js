export default async function handler(req, res) {
  const url = process.env.PRODUCT_MASTER_CSV_URL;
  if (!url) return res.status(200).json({ configured:false, rows:[], message:"Product Master CSV URL not configured yet." });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);
    const csv = await response.text();
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=60");
    res.status(200).json({ configured:true, csv });
  } catch (e) {
    res.status(502).json({ configured:false, error:e.message });
  }
}
