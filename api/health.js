// api/health.js — Vercel/Netlify serverless health check
export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    key_configured: Boolean(process.env.DEEPSEEK_API_KEY),
  });
}
