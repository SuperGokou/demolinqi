// site/server.js — Express static host + DeepSeek SSE proxy
import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3100;

// ---- Config ----
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL    = process.env.DEEPSEEK_MODEL    || 'deepseek-chat';
const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY;

const MAX_MSG_LEN      = 2000;
const RATE_WINDOW_MS   = 60_000;
const RATE_MAX         = 20;
const DEEPSEEK_TIMEOUT = 30_000;

if (!DEEPSEEK_API_KEY) {
  console.error('[aoi] DEEPSEEK_API_KEY missing in .env — /api/chat will return 500.');
}

// ---- Rate limit (in-memory, per IP) ----
const rateStore = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

// ---- Middleware ----
app.use(express.json({ limit: '16kb' }));

// ---- Static site ----
app.use(express.static(__dirname, { extensions: ['html'] }));

// ---- System prompt ----
function systemPrompt(currentPath) {
  return [
    '你是 AOI·Vision 智能助手,一家位于江苏扬州的 AI 工业视觉方案公司。',
    '',
    '公司定位: 我们为制造业产线提供 AI 视觉解决方案,替代人工目检 ——',
    '更快、更准、更一致、24/7 不停机。不只是"缺陷检测",还包括外观质量、',
    '装配完整性验证、尺寸识别、计数分拣等广义工业视觉任务。',
    '',
    '你可以帮助用户:',
    '- 解释"工业视觉方案"相比人工目检的优势(速度、一致性、24/7、成本)',
    '- 介绍标杆案例:某知名国内龙头企业(港股上市)的键盘 AOI 项目。涉及具体客户信息时保持匿名。',
    '- 解释核心方法论:分治架构 + 金样对比 + 加权融合(可组合的视觉积木)',
    '- 说明方案矩阵:键盘、PCB、汽车冲压件、家电外壳等多场景',
    '- 引导合作:POC 24-72 小时 · 客单价 20-80 万',
    '',
    '回复风格: 简洁(2-3 句),专业,略带工业气质。中文回复。',
    '强调"视觉方案"而非"只是检测",突出对比人工的高效性与实用性。',
    '',
    `用户当前页面: ${currentPath || '/'}`,
  ].join('\n');
}

// ---- Health ----
app.get('/api/health', (_req, res) => res.json({ ok: true, model: DEEPSEEK_MODEL }));

// ---- Chat endpoint ----
app.post('/api/chat', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
    || req.socket.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait a moment.' });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ success: false, message: 'Chat service not configured.' });
  }

  const { message, context } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'message is required (non-empty string).' });
  }
  if (message.length > MAX_MSG_LEN) {
    return res.status(400).json({ success: false, message: `message exceeds ${MAX_MSG_LEN} chars.` });
  }

  const messages = [
    { role: 'system', content: systemPrompt(context?.current_path) },
    { role: 'user',   content: message.trim() },
  ];

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT);

  let upstream;
  try {
    upstream = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    return res.status(502).json({ success: false, message: `Upstream error: ${err.message}` });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeoutId);
    const detail = await upstream.text().catch(() => '');
    console.error('[aoi] DeepSeek failed', { status: upstream.status, detail: detail.slice(0, 300) });
    return res.status(502).json({ success: false, message: 'AI service temporarily unavailable.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const reader  = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data: ')) continue;
        const payload = s.slice(6);
        if (payload === '[DONE]') {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          continue;
        }
        try {
          const parsed = JSON.parse(payload);
          const token  = parsed.choices?.[0]?.delta?.content;
          if (typeof token === 'string' && token.length) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
  } finally {
    clearTimeout(timeoutId);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`[aoi] http://localhost:${PORT}`);
});
