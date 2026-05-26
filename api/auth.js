const crypto = require('crypto');

function makeToken(slug, secret) {
  return crypto.createHmac('sha256', secret).update(slug).digest('hex').slice(0, 32);
}

function getPartners(secret) {
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

  const partners = getPartners(tokenSecret);

  if (partners.length > 0) {
    const matched = partners.find(p => p.password === password);
    if (matched) {
      return res.status(200).json({ mode: matched.slug, token: matched.token });
    }
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  // Обратная совместимость: если PARTNERS не задан, используем старые переменные
  const accessPassword = process.env.ACCESS_PASSWORD;
  const testPassword   = process.env.TEST_PASSWORD;
  if (password === accessPassword) {
    return res.status(200).json({ mode: 'main', token: makeToken('main', tokenSecret) });
  }
  if (testPassword && password === testPassword) {
    return res.status(200).json({ mode: 'test', token: makeToken('test', tokenSecret) });
  }

  return res.status(401).json({ error: 'Неверный пароль' });
};
