const crypto = require('crypto');
const { GUARDRAILS, SYSTEMS_AND_COLORS, PRODUCTS_CATALOG, PROTOCOLS, TIERED_APPROACH } = require('./_knowledge');

// ── BOT PROMPTS ──────────────────────────────────────────────────────────────

const BOT_TRACKER_PROMPT = `Ты — AI-ассистент для дистрибьюторов Coral Club. Расшифровываешь диаграммы трекера здоровья и формируешь протокол из реальных продуктов Coral Club.

ВАЖНО: используй ТОЛЬКО продукты из каталога ниже. Никаких выдуманных названий.
ЛИЧНЫЙ БРЕНД: В текстах клиенту НИКОГДА не упоминай "Бутакова" — клиент должен ассоциировать диагностику с дистрибьютором.
${SYSTEMS_AND_COLORS}
${PRODUCTS_CATALOG}
${PROTOCOLS}
${TIERED_APPROACH}
${GUARDRAILS}

ФОРМАТ ОТВЕТА (строго для Telegram, без HTML, только текст и эмодзи):

📊 Анализ трекера

⚠️ Нагруженные системы:
• [Система] — [XX]% — [1-2 слова что происходит]

💊 Протокол (3-5 продуктов по приоритету нагрузки):
• [Продукт] — [зачем, 5-8 слов]

💬 Готовый текст клиенту:
[3-4 предложения: что показал трекер + первопричина + что предлагаем + следующий шаг]

⏰ Расписание приёма:
🌅 Утро: [продукты]
🌞 День: [продукты]
🌙 Вечер: [продукты]

⚠️ БАД не является лекарственным средством. Перед применением проконсультируйтесь со специалистом.`;

const BOT_DIALOG_PROMPT = `Ты — эксперт по продажам через доверие для дистрибьюторов Coral Club.
Дистрибьютор пересылает тебе сообщение от клиента (или потенциального клиента). Сгенерируй готовые варианты ответа.

ТИПЫ РЕАКЦИЙ клиента и алгоритм ответа (принять → понять → мост):
1. Страх цены — акцент на ценность, не на стоимость
2. Нет времени — трекер занимает 15 минут, один раз
3. Не верит в БАДы — разделить "аптечные" и нутрицевтику, конкретика трекера
4. Не понимает — объяснить через образ, без терминов
5. Откладывает — создать мягкую срочность через последствия бездействия
6. Уже лечится у врача — медицина и нутрицевтика на разных уровнях, не конкурируют
7. Попробовал — не помогло — один продукт без системы = нет результата
8. Позитивный/нейтральный — вести к следующему шагу (трекер)

ФОРМАТ ОТВЕТА (для Telegram, только текст и эмодзи):

💬 Тип реакции: [название из списка]

Вариант 1 (тёплый, личный):
[текст — 2-4 предложения]

Вариант 2 (краткий, цепляющий):
[текст — 1-2 предложения]

Вариант 3 (через пользу/факт):
[текст — 2-3 предложения]

💡 Тактика:
[1-2 предложения что делать если клиент ответит — только для дистрибьютора]

ЗАПРЕЩЕНО: упоминать деньги и цены в первых сообщениях, критиковать врачей, давить на клиента, называть "Бутакова" в текстах клиенту.`;

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

async function tgPost(method, body) {
  return fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function tgSend(chatId, text) {
  return tgPost('sendMessage', { chat_id: chatId, text });
}

async function getSlugByTgId(tgId) {
  try { return await kvCmd('GET', `tg:${tgId}`); } catch { return null; }
}

async function downloadTgPhoto(fileId) {
  const token = process.env.TG_BOT_TOKEN;
  const metaRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const { result } = await metaRes.json();
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${result.file_path}`);
  const buf = await fileRes.arrayBuffer();
  return Buffer.from(buf).toString('base64');
}

async function claudeForBot(systemPrompt, userText, imageBase64) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('API-ключ не настроен');

  const userContent = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: userText }
      ]
    : userText;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(50000),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Claude API: ${r.status} — ${err.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

function generatePassword() {
  // 8 readable hex chars — easy to type and share
  return crypto.randomBytes(4).toString('hex');
}

function generateSlug() {
  // Unique partner slug: p + 8 hex chars
  return 'p' + crypto.randomBytes(4).toString('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Validate webhook secret
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (process.env.TG_WEBHOOK_SECRET && secret !== process.env.TG_WEBHOOK_SECRET) {
    return res.status(403).end();
  }

  const update = req.body;
  if (!update) return res.status(200).send('ok');

  // ── ВХОДЯЩИЕ СООБЩЕНИЯ (AI-режим) ────────────────────────────────────────
  const msg = update.message;
  if (msg) {
    const chatId = msg.chat.id;
    const userId = String(msg.from?.id || '');
    const text = (msg.text || '').trim();
    const isOwner = userId === String(process.env.TG_OWNER_CHAT_ID);

    // /start — авторизация или приветствие
    if (text.startsWith('/start')) {
      const password = text.split(' ')[1];
      if (password) {
        try {
          const slug = await kvCmd('HGET', 'partners:passwords', password);
          if (slug) {
            await kvCmd('SET', `tg:${userId}`, slug);
            await tgSend(chatId,
              '✅ Доступ открыт!\n\n' +
              'Отправь мне фото диаграммы трекера → получишь анализ и протокол.\n' +
              'Или перешли сообщение от клиента → получишь готовый скрипт ответа.\n\n' +
              'Команды:\n/analyze — режим анализа трекера\n/respond — режим скрипта ответа'
            );
          } else {
            await tgSend(chatId, '❌ Пароль не найден. Проверь и попробуй ещё раз.');
          }
        } catch {
          await tgSend(chatId, '⚠️ Ошибка подключения. Попробуй позже.');
        }
      } else {
        await tgSend(chatId,
          'Привет! 👋\n\n' +
          'Этот бот помогает дистрибьюторам Coral Club:\n' +
          '📊 Анализировать трекеры здоровья (фото)\n' +
          '💬 Готовить скрипты ответов на сообщения клиентов\n\n' +
          'Для доступа введи:\n/start твой_пароль'
        );
      }
      return res.status(200).send('ok');
    }

    // /analyze и /respond — подсказки режима
    if (text === '/analyze') {
      await tgSend(chatId, '📊 Режим анализа трекера.\nОтправь фото диаграммы — расшифрую и пришлю протокол.');
      return res.status(200).send('ok');
    }
    if (text === '/respond') {
      await tgSend(chatId, '💬 Режим скрипта ответа.\nПерешли или вставь сообщение от клиента — подберу варианты ответа.');
      return res.status(200).send('ok');
    }

    // Авторизация для всех остальных сообщений
    const slug = !isOwner ? await getSlugByTgId(userId) : 'owner';
    if (!slug) {
      await tgSend(chatId, 'Для доступа введи:\n/start твой_пароль');
      return res.status(200).send('ok');
    }

    // Фото → анализ трекера
    if (msg.photo) {
      try {
        await tgPost('sendChatAction', { chat_id: chatId, action: 'typing' });
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const imageBase64 = await downloadTgPhoto(fileId);
        const result = await claudeForBot(BOT_TRACKER_PROMPT, 'Расшифруй эту диаграмму трекера здоровья.', imageBase64);
        await tgSend(chatId, result);
      } catch (err) {
        await tgSend(chatId, '⚠️ Не удалось обработать фото: ' + err.message);
      }
      return res.status(200).send('ok');
    }

    // Текст → скрипт ответа клиенту
    if (text && !text.startsWith('/')) {
      try {
        await tgPost('sendChatAction', { chat_id: chatId, action: 'typing' });
        const result = await claudeForBot(BOT_DIALOG_PROMPT, 'Сообщение от клиента:\n' + text);
        await tgSend(chatId, result);
      } catch (err) {
        await tgSend(chatId, '⚠️ Ошибка: ' + err.message);
      }
      return res.status(200).send('ok');
    }

    return res.status(200).send('ok');
  }

  // Handle callback_query (button press)
  if (update.callback_query) {
    const { id: callbackId, data, message } = update.callback_query;
    const colonIdx = (data || '').indexOf(':');
    if (colonIdx === -1) {
      await tgPost('answerCallbackQuery', { callback_query_id: callbackId, text: '⚠️ Неверный запрос' });
      return res.status(200).send('ok');
    }

    const action = data.slice(0, colonIdx);
    const requestId = data.slice(colonIdx + 1);

    const raw = await kvCmd('GET', `req:${requestId}`);
    if (!raw) {
      await tgPost('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '⚠️ Заявка не найдена или уже обработана'
      });
      return res.status(200).send('ok');
    }

    const request = JSON.parse(raw);

    // Clean up request from Redis
    await kvCmd('DEL', `req:${requestId}`);
    await kvCmd('LREM', 'reqs:pending', 0, requestId);

    if (action === 'approve') {
      const password = generatePassword();
      const slug = generateSlug();

      // Store partner data
      await kvCmd('SET', `partner:${slug}:data`, JSON.stringify({
        name: request.name,
        telegram: request.telegram,
        created: Date.now(),
        active: true
      }));
      // Fast reverse-lookup: password → slug (used by auth.js)
      await kvCmd('HSET', 'partners:passwords', password, slug);
      // Track all partners
      await kvCmd('SADD', 'partners:index', slug);

      await tgPost('answerCallbackQuery', { callback_query_id: callbackId, text: '✅ Доступ выдан!' });

      // Update original message to remove buttons
      await tgPost('editMessageText', {
        chat_id: message.chat.id,
        message_id: message.message_id,
        text: message.text + '\n\n✅ ОДОБРЕНО',
        parse_mode: 'HTML'
      });

      // Send the password to owner for forwarding
      await tgPost('sendMessage', {
        chat_id: process.env.TG_OWNER_CHAT_ID,
        text: `✅ <b>Партнёр добавлен: ${request.name}</b>\n\nПароль: <code>${password}</code>\nTelegram: @${request.telegram}\n\n📋 Перешли это партнёру в Telegram:\n<i>Привет! Твой доступ к AI-ассистенту Coral Club готов. Заходи на сайт и вводи пароль: ${password}</i>`,
        parse_mode: 'HTML'
      });

    } else if (action === 'reject') {
      await tgPost('answerCallbackQuery', { callback_query_id: callbackId, text: '❌ Отклонено' });
      await tgPost('editMessageText', {
        chat_id: message.chat.id,
        message_id: message.message_id,
        text: message.text + '\n\n❌ ОТКЛОНЕНО',
        parse_mode: 'HTML'
      });
    }
  }

  return res.status(200).send('ok');
};
