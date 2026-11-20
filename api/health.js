export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: "KUCHIPOO Uniware Dashboard",
    mode: "scaffold",
    message: "Backend is reachable. Uniware credentials and export API contract still need validation."
  });
}
