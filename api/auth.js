const crypto = require('crypto');

function makeToken(slug, secret) {
  return crypto.createHmac('sha256', secret).update(slug).digest('hex').slice(0, 32);
}

function getEnvPartners(secret) {
  const raw = process.env.PARTNERS || '';
  if (!raw) return [];
  return raw.split(',').map(pair => {
    const idx = pair.indexOf(':');
    if (idx === -1) return null;
    const slug     = pair.slice(0, idx).trim();
    const password = pair.slice(idx + 1).trim();
    if (!slug || !password) return null;
    return { slug, password, token: makeToken(slug, secret) };
  }).filter(Boolean);
}

async function checkHasRedisMain(kvUrl, kvToken) {
  if (!kvUrl || !kvToken) return false;
  try {
    const res = await fetch(kvUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EXISTS', 'partner:main:data'])
    });
    const data = await res.json();
    return data.result === 1;
  } catch {
    return false;
  }
}

async function findRedisPartner(password, secret) {
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return null;

  try {
    // O(1) reverse-lookup: password → slug
    const res = await fetch(kvUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['HGET', 'partners:passwords', password])
    });
    const data = await res.json();
    const slug = data.result;
    if (!slug) return null;

    // Verify partner is active
    const res2 = await fetch(kvUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', `partner:${slug}:data`])
    });
    const data2 = await res2.json();
    if (!data2.result) return null;
    const partner = JSON.parse(data2.result);
    if (!partner.active) return null;

    return { slug, token: makeToken(slug, secret) };
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tokenSecret = process.env.TOKEN_SECRET;
  if (!tokenSecret) return res.status(500).json({ error: 'Сервер не настроен' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Пароль не указан' });

  // 1. Check Redis partners first (added via Telegram bot, no redeploy needed)
  const redisPartner = await findRedisPartner(password, tokenSecret);
  if (redisPartner) {
    return res.status(200).json({ mode: redisPartner.slug, token: redisPartner.token });
  }

  // 2. Check env PARTNERS (backward compatibility)
  const envPartners = getEnvPartners(tokenSecret);
  if (envPartners.length > 0) {
    const matched = envPartners.find(p => p.password === password);
    if (matched) {
      return res.status(200).json({ mode: matched.slug, token: matched.token });
    }
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  // 3. Fallback: single ACCESS_PASSWORD / TEST_PASSWORD
  const accessPassword = process.env.ACCESS_PASSWORD;
  const testPassword   = process.env.TEST_PASSWORD;
  if (password === accessPassword) {
    const kvUrl   = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const mainInRedis = await checkHasRedisMain(kvUrl, kvToken);
    if (!mainInRedis) {
      return res.status(200).json({ mode: 'main', token: makeToken('main', tokenSecret) });
    }
    // Redis override exists — ACCESS_PASSWORD superseded, fall through to 401
  }
  if (testPassword && password === testPassword) {
    return res.status(200).json({ mode: 'test', token: makeToken('test', tokenSecret) });
  }

  return res.status(401).json({ error: 'Неверный пароль' });
};
