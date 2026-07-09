const crypto = require('crypto');
const { GUARDRAILS, SYSTEMS_AND_COLORS, PRODUCTS_CATALOG, PROTOCOLS, TIERED_APPROACH } = require('./_knowledge');

// ── BOT PROMPTS ──────────────────────────────────────────────────────────────

const BOT_TRACKER_PROMPT = `Ты — AI-ассистент для дистрибьюторов Coral Club. Смотришь на диаграмму трекера здоровья и готовишь дистрибьютору всё необходимое для работы с клиентом.

ВАЖНО: используй ТОЛЬКО продукты из каталога ниже. Никаких выдуманных названий.
ЛИЧНЫЙ БРЕНД: В текстах клиенту НИКОГДА не упоминай "Бутакова" — клиент должен ассоциировать диагностику с дистрибьютором.

Какие системы нагружены — дистрибьютор и клиент УЖЕ ВИДЯТ сами из трекера. НЕ перечисляй их заново. Твоя задача — объяснить ПОЧЕМУ так и ЧТО С ЧЕМ СВЯЗАНО, а потом дать готовый протокол и текст клиенту.

ПАРАЗИТАРНАЯ НАГРУЗКА (фоновый компонент, не основная программа):
Если нагружены ИС (Иммунная) и/или ПС (Пищеварительная), ИЛИ видны симптомы: аллергия/кожные реакции, нарушения сна, усталость без причины, проблемы ЖКТ, скрежет зубами — это сигнал паразитарного фона.
НЕ предлагай Парашилд как отдельную полноценную программу. Вместо этого:
— включи 1-2 продукта из её состава как фоновую поддержку в основной протокол (ПараФайт — паразитарная нагрузка фоном; Корал Бурдок Рут — детокс почек и лимфы; МСМ — противовоспалительное; Супер-Флора — восстановление микрофлоры)
— в блоке "Для дистрибьютора" упомяни, что в фоне может быть паразитарная нагрузка, и после основного протокола стоит рассмотреть полный Парашилд отдельно

${SYSTEMS_AND_COLORS}
${PRODUCTS_CATALOG}
${PROTOCOLS}
${TIERED_APPROACH}
${GUARDRAILS}

ФОРМАТ ОТВЕТА — строго три блока, разделённых строкой "---SPLIT---" (без кавычек).
Без HTML, только текст и эмодзи. Между блоками — только "---SPLIT---", ничего лишнего.

🗂 Только для тебя — не отправляй клиенту

🔍 Первопричина:
[2-3 предложения: в чём корень проблемы, как системы влияют друг на друга. Простой язык, как объясняешь коллеге]

🔗 Причинно-следственная цепочка:
[3-4 предложения: механизм — почему именно эти симптомы, почему аптека не решает, что восстанавливаем первым]

---SPLIT---

💬 Сообщение клиенту (готово к отправке):
[3-4 предложения: что означает картина трекера простыми словами + что предлагаем + следующий шаг. БЕЗ медицинских терминов, БЕЗ "Бутакова"]

---SPLIT---

💊 Протокол (3-5 продуктов по приоритету):
• [Продукт] — [зачем, 5-8 слов]

⏰ Расписание приёма:
🌅 Утро: [продукты]
🌞 День: [продукты]
🌙 Вечер: [продукты]

⚠️ БАД не является лекарственным средством. Перед применением проконсультируйтесь со специалистом.`;

const BOT_DIALOG_PROMPT = `Ты — помощник дистрибьютора Coral Club. Дистрибьютор пишет тебе текстом — это может быть сообщение от клиента, вопрос по продукту, возражение, или просьба помочь закрыть сделку.

ОПРЕДЕЛИ ТИП ЗАПРОСА и ответь по соответствующему формату:

━━━ ТИП 1: ВОЗРАЖЕНИЕ / РЕАКЦИЯ КЛИЕНТА ━━━
Клиент сомневается, откладывает, не верит — дай 3 варианта ответа.

Алгоритм (принять → понять → мост):
• Страх цены — акцент на ценность, не стоимость
• Нет времени — трекер 15 минут, один раз
• Не верит в БАДы — нутрицевтика ≠ аптечные таблетки, конкретика трекера
• Не понимает — объяснить через образ, без терминов
• Откладывает — мягкая срочность через последствия бездействия
• Уже лечится у врача — медицина и нутрицевтика не конкурируют, разные уровни
• Попробовал — не помогло — один продукт без системы не работает
• Позитивный — вести к следующему шагу

Формат:
💬 Тип реакции: [название]
Вариант 1 (тёплый): [2-4 предложения]
Вариант 2 (краткий): [1-2 предложения]
Вариант 3 (через факт): [2-3 предложения]
💡 Тактика: [что делать если клиент ответит — только для дистрибьютора]

━━━ ТИП 2: ВОПРОС ПО ПРОДУКТУ ━━━
Клиент или дистрибьютор спрашивает о конкретном продукте — что это, зачем, как работает.

${PRODUCTS_CATALOG}

Формат:
📦 [Название продукта]
Что это: [1-2 предложения простым языком]
Зачем нужен: [какую задачу решает, для кого]
Как принимать: [дозировка и время]
💬 Текст клиенту: [готовая фраза — 2-3 предложения без терминов]

━━━ ТИП 3: ВОПРОС ПО ТРЕКЕРУ ━━━
Клиент спрашивает что такое трекер, зачем, как проходить, что значат результаты.

Формат:
❓ Вопрос: [суть]
💬 Объяснение клиенту: [2-4 предложения, простой язык]
➡️ Следующий шаг: [что предложить клиенту дальше]

━━━ ТИП 4: ЗАКРЫТИЕ СДЕЛКИ ━━━
Дистрибьютор хочет помощи в переходе от протокола к покупке.

Формат:
🎯 Ситуация: [кратко что происходит]
💬 Текст дистрибьютору — как предложить: [1-2 варианта фразы]
📋 Логика для клиента: [почему начать именно сейчас, без давления]

━━━ ОБЩИЕ ПРАВИЛА ━━━
ЗАПРЕЩЕНО: упоминать "Бутакова" в текстах клиенту, критиковать врачей, давить, упоминать цены первым.
${GUARDRAILS}`;

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
            await kvCmd('SET', `partner:${slug}:tgchatid`, String(chatId));
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

    // /repassword — смена пароля владельца (только для владельца)
    if (text === '/repassword') {
      if (!isOwner) {
        await tgSend(chatId, '❌ Команда доступна только владельцу.');
        return res.status(200).send('ok');
      }
      try {
        const newPassword = generatePassword();
        await kvCmd('HSET', 'partners:passwords', newPassword, 'main');
        await kvCmd('SET', 'partner:main:data', JSON.stringify({
          name: 'Owner', created: Date.now(), active: true
        }));
        await tgSend(chatId,
          '🔑 Новый пароль для входа:\n\n' + newPassword + '\n\n' +
          'Старый пароль больше не работает.\n' +
          'Сохрани этот пароль — он больше не отображается.'
        );
      } catch (err) {
        await tgSend(chatId, '⚠️ Ошибка: ' + err.message);
      }
      return res.status(200).send('ok');
    }

    // /mypassword — показать текущий пароль (только для владельца)
    if (text === '/mypassword') {
      if (!isOwner) {
        await tgSend(chatId, '❌ Команда доступна только владельцу.');
        return res.status(200).send('ok');
      }
      try {
        const raw = await kvCmd('GET', 'partner:main:data');
        if (!raw) {
          await tgSend(chatId,
            '🔑 Пароль ещё не менялся через бот.\n' +
            'Твой текущий пароль — ACCESS_PASSWORD из Vercel.\n\n' +
            'Чтобы перевести управление паролем в бот, отправь /repassword'
          );
        } else {
          const passwords = await kvCmd('HGETALL', 'partners:passwords');
          let ownerPassword = null;
          if (Array.isArray(passwords)) {
            for (let i = 0; i < passwords.length; i += 2) {
              if (passwords[i + 1] === 'main') { ownerPassword = passwords[i]; break; }
            }
          }
          if (ownerPassword) {
            await tgSend(chatId, '🔑 Твой текущий пароль для входа:\n\n' + ownerPassword);
          } else {
            await tgSend(chatId, '⚠️ Пароль не найден. Отправь /repassword чтобы создать новый.');
          }
        }
      } catch (err) {
        await tgSend(chatId, '⚠️ Ошибка: ' + err.message);
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
        const parts = result.split('---SPLIT---').map(p => p.trim()).filter(Boolean);
        for (const part of parts) {
          await tgSend(chatId, part);
        }
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
