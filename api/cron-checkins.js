// Vercel Cron Job — ежедневная проверка чек-инов 30/60/90 дней на протоколе
// Запускается: 0 5 * * * (05:00 UTC = 08:00 МСК)
// Авторизация: Authorization: Bearer {CRON_SECRET}

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

async function tgSend(chatId, text) {
  const token = process.env.TG_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

function daysSince(dateStr) {
  const start = new Date(dateStr + 'T00:00:00Z');
  const now = new Date();
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

function checkinMilestone(days) {
  if (days >= 29 && days <= 31) return 30;
  if (days >= 59 && days <= 61) return 60;
  if (days >= 89 && days <= 91) return 90;
  return null;
}

function checkinScript(name, milestone) {
  const first = name.split(' ')[0];
  if (milestone === 30) {
    return `«${first}, прошёл месяц — как ты себя чувствуешь?\nЧто заметила за это время по энергии, сну, самочувствию?»`;
  }
  if (milestone === 60) {
    return `«${first}, уже два месяца — самое время сверить ощущения.\nЧто изменилось? Есть что-то, что явно стало лучше?»`;
  }
  return `«${first}, три месяца позади — это уже полный цикл!\nХочу услышать твой отзыв: что изменилось с тех пор, как начали?»`;
}

async function processSlug(slug, chatId) {
  const raw = await kvCmd('GET', `ns:${slug}:clients:index`);
  if (!raw) return { checked: 0, sent: 0 };

  const clients = JSON.parse(raw);
  let checked = 0;
  let sent = 0;

  for (const entry of clients) {
    if (!entry.protocolStartDate) continue;
    if (entry.status !== 'on_protocol') continue;

    const days = daysSince(entry.protocolStartDate);
    const milestone = checkinMilestone(days);
    if (!milestone) continue;

    checked++;

    const dedupKey = `ns:${slug}:checkin:${entry.id}:${milestone}`;
    const exists = await kvCmd('EXISTS', dedupKey);
    if (exists === 1) continue;

    const script = checkinScript(entry.name, milestone);
    const msg =
      `⏰ Чек-ин: ${entry.name} (${milestone} дней на протоколе)\n\n` +
      `Готовый текст для отправки:\n${script}`;

    await tgSend(chatId, msg);
    await kvCmd('SET', dedupKey, '1', 'EX', 604800); // TTL 7 дней
    sent++;
  }

  return { checked, sent };
}

module.exports = async function handler(req, res) {
  // Авторизация: только Vercel Cron или ручной curl с CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const ownerChatId = process.env.TG_OWNER_CHAT_ID;

  if (!kvUrl || !kvToken || !ownerChatId) {
    return res.status(500).json({ error: 'Не настроено: KV или TG_OWNER_CHAT_ID' });
  }

  const results = [];

  // Основной аккаунт (владелец)
  try {
    const r = await processSlug('main', ownerChatId);
    results.push({ slug: 'main', ...r });
  } catch (err) {
    results.push({ slug: 'main', error: err.message });
  }

  // Партнёры, у которых сохранён Telegram chat ID (после входа в бот)
  try {
    const partnerPasswords = await kvCmd('HGETALL', 'partners:passwords');
    if (Array.isArray(partnerPasswords)) {
      const seen = new Set(['main']);
      for (let i = 0; i < partnerPasswords.length; i += 2) {
        const slug = partnerPasswords[i + 1];
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        const partnerChatId = await kvCmd('GET', `partner:${slug}:tgchatid`);
        if (!partnerChatId) continue;

        try {
          const r = await processSlug(slug, partnerChatId);
          results.push({ slug, ...r });
        } catch (err) {
          results.push({ slug, error: err.message });
        }
      }
    }
  } catch {}

  const totalSent = results.reduce((s, r) => s + (r.sent || 0), 0);
  return res.status(200).json({ ok: true, results, totalSent });
};
