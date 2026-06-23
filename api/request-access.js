const crypto = require('crypto');

async function kvCmd(...args) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function sendTg(method, body) {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) return;
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, telegram, message } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Укажите имя' });
  if (!telegram || !telegram.trim()) return res.status(400).json({ error: 'Укажите Telegram' });

  const nameClean = name.trim().slice(0, 100);
  const tgClean = telegram.replace('@', '').trim().toLowerCase().slice(0, 50);
  const msgClean = (message || '').trim().slice(0, 500);

  // Rate limit: max 3 requests per Telegram per 24h
  const rateLimitKey = `ratelimit:req:${tgClean}`;
  const count = await kvCmd('INCR', rateLimitKey);
  if (count === 1) await kvCmd('EXPIRE', rateLimitKey, 86400);
  if (count > 3) {
    return res.status(429).json({ error: 'Слишком много заявок. Попробуйте завтра.' });
  }

  const requestId = crypto.randomBytes(8).toString('hex');
  const requestData = { name: nameClean, telegram: tgClean, message: msgClean, createdAt: Date.now() };

  // Store with 7-day TTL
  await kvCmd('SET', `req:${requestId}`, JSON.stringify(requestData), 'EX', 604800);
  // Track in pending list
  await kvCmd('LPUSH', 'reqs:pending', requestId);

  // Send Telegram notification to owner
  if (process.env.TG_BOT_TOKEN && process.env.TG_OWNER_CHAT_ID) {
    const text = `🔔 <b>Новая заявка на доступ</b>\n\n👤 Имя: ${nameClean}\n📱 Telegram: @${tgClean}${msgClean ? `\n💬 Сообщение: ${msgClean}` : ''}\n\n🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
    await sendTg('sendMessage', {
      chat_id: process.env.TG_OWNER_CHAT_ID,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Одобрить', callback_data: `approve:${requestId}` },
          { text: '❌ Отклонить', callback_data: `reject:${requestId}` }
        ]]
      }
    });
  }

  return res.status(200).json({ ok: true });
};
