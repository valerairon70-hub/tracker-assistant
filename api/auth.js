const { makeToken, resolveSlugByPassword } = require('./_partners');

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

  const slug = await resolveSlugByPassword(password);
  if (!slug) return res.status(401).json({ error: 'Неверный пароль' });

  return res.status(200).json({ mode: slug, token: makeToken(slug, tokenSecret) });
};
