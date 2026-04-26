const crypto = require('crypto');

function makeToken(mode, secret) {
  return crypto.createHmac('sha256', secret).update(mode).digest('hex').slice(0, 32);
}

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

async function kvGet(key) {
  const result = await kvCmd('GET', key);
  return result ? JSON.parse(result) : null;
}

async function kvSet(key, value) {
  await kvCmd('SET', key, JSON.stringify(value));
}

async function kvDel(key) {
  await kvCmd('DEL', key);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const STATUS_NEXT_DAYS = {
  invited: 3,
  tracker_given: 7,
  awaiting_decode: 0,
  protocol_given: 3,
  on_protocol: 14,
  repeat_tracker: 0,
  permanent: 30,
  rejected: null
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const tokenSecret = process.env.TOKEN_SECRET;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: 'KV не настроен' });
  }

  // Проверка токена
  if (tokenSecret) {
    const token = req.method === 'GET' ? req.query?.token : req.body?.token;
    const mainToken = makeToken('main', tokenSecret);
    const testToken = makeToken('test', tokenSecret);
    if (token !== mainToken && token !== testToken) {
      return res.status(401).json({ error: 'Нет доступа' });
    }
  }

  const action = req.method === 'GET' ? req.query?.action : req.body?.action;

  try {
    // ── GET: список всех клиентов ──
    if (req.method === 'GET' && action === 'list') {
      const index = await kvGet('clients:index') || [];
      return res.status(200).json({ clients: index });
    }

    // ── GET: один клиент ──
    if (req.method === 'GET' && action === 'get') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Не указан id' });
      const client = await kvGet(`client:${id}`);
      if (!client) return res.status(404).json({ error: 'Клиент не найден' });
      return res.status(200).json({ client });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Метод не поддерживается' });
    }

    // ── POST: создать клиента ──
    if (action === 'create') {
      const { name, age, gender, phone, notes } = req.body;
      if (!name) return res.status(400).json({ error: 'Имя обязательно' });

      const id = generateId();
      const now = new Date().toISOString().slice(0, 10);
      const nextActionDate = addDays(now, 3);

      const client = { id, name, age: age || '', gender: gender || '', phone: phone || '', notes: notes || '', created: now, status: 'invited', nextActionDate, sessions: [] };

      // Сохраняем клиента
      await kvSet(`client:${id}`, client);

      // Обновляем индекс
      const index = await kvGet('clients:index') || [];
      index.unshift({ id, name, age: age || '', gender: gender || '', created: now, status: 'invited', nextActionDate, lastSession: null });
      await kvSet('clients:index', index);

      return res.status(200).json({ ok: true, client });
    }

    // ── POST: добавить сессию ──
    if (action === 'add-session') {
      const { clientId, complaints, stage, mood, result, sessionType } = req.body;
      if (!clientId) return res.status(400).json({ error: 'Не указан clientId' });

      const client = await kvGet(`client:${clientId}`);
      if (!client) return res.status(404).json({ error: 'Клиент не найден' });

      const sessionId = generateId();
      const now = new Date().toISOString().slice(0, 10);

      const session = {
        id: sessionId,
        date: now,
        complaints: complaints || '',
        stage: stage || '',
        mood: mood || '',
        result: result || '',
        type: sessionType || 'tracker'
      };

      client.sessions.push(session);
      await kvSet(`client:${clientId}`, client);

      // Обновляем lastSession в индексе
      const index = await kvGet('clients:index') || [];
      const entry = index.find(c => c.id === clientId);
      if (entry) { entry.lastSession = now; await kvSet('clients:index', index); }

      return res.status(200).json({ ok: true, session });
    }

    // ── POST: обновить данные клиента ──
    if (action === 'update') {
      const { clientId, name, age, gender, phone, notes } = req.body;
      if (!clientId) return res.status(400).json({ error: 'Не указан clientId' });

      const client = await kvGet(`client:${clientId}`);
      if (!client) return res.status(404).json({ error: 'Клиент не найден' });

      if (name !== undefined) client.name = name;
      if (age !== undefined) client.age = age;
      if (gender !== undefined) client.gender = gender;
      if (phone !== undefined) client.phone = phone;
      if (notes !== undefined) client.notes = notes;

      await kvSet(`client:${clientId}`, client);

      // Синхронизируем имя в индексе
      const index = await kvGet('clients:index') || [];
      const entry = index.find(c => c.id === clientId);
      if (entry) {
        if (name !== undefined) entry.name = name;
        if (age !== undefined) entry.age = age;
        if (gender !== undefined) entry.gender = gender;
        await kvSet('clients:index', index);
      }

      return res.status(200).json({ ok: true, client });
    }

    // ── POST: сменить статус ──
    if (action === 'set-status') {
      const { clientId, status, nextActionDate } = req.body;
      if (!clientId || !status) return res.status(400).json({ error: 'Не указан clientId или status' });

      const client = await kvGet(`client:${clientId}`);
      if (!client) return res.status(404).json({ error: 'Клиент не найден' });

      client.status = status;
      const days = STATUS_NEXT_DAYS[status];
      const today = new Date().toISOString().slice(0, 10);
      client.nextActionDate = nextActionDate || (days !== null ? addDays(today, days) : null);

      await kvSet(`client:${clientId}`, client);

      const index = await kvGet('clients:index') || [];
      const entry = index.find(c => c.id === clientId);
      if (entry) {
        entry.status = client.status;
        entry.nextActionDate = client.nextActionDate;
        await kvSet('clients:index', index);
      }

      return res.status(200).json({ ok: true, status: client.status, nextActionDate: client.nextActionDate });
    }

    // ── POST: добавить запись о контакте ──
    if (action === 'add-contact') {
      const { clientId, text } = req.body;
      if (!clientId || !text?.trim()) return res.status(400).json({ error: 'Не указан clientId или text' });

      const client = await kvGet(`client:${clientId}`);
      if (!client) return res.status(404).json({ error: 'Клиент не найден' });

      const contactId = generateId();
      const now = new Date().toISOString().slice(0, 10);
      const contact = { id: contactId, date: now, text: text.trim() };

      if (!client.contacts) client.contacts = [];
      client.contacts.push(contact);
      await kvSet(`client:${clientId}`, client);

      const index = await kvGet('clients:index') || [];
      const entry = index.find(c => c.id === clientId);
      if (entry) {
        entry.lastContact = now;
        entry.lastContactText = text.trim().slice(0, 80);
        await kvSet('clients:index', index);
      }

      return res.status(200).json({ ok: true, contact });
    }

    // ── POST: удалить запись о контакте ──
    if (action === 'delete-contact') {
      const { clientId, contactId } = req.body;
      if (!clientId || !contactId) return res.status(400).json({ error: 'Не указан clientId или contactId' });

      const client = await kvGet(`client:${clientId}`);
      if (!client) return res.status(404).json({ error: 'Клиент не найден' });

      client.contacts = (client.contacts || []).filter(c => c.id !== contactId);
      await kvSet(`client:${clientId}`, client);

      return res.status(200).json({ ok: true });
    }

    // ── POST: удалить клиента ──
    if (action === 'delete') {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ error: 'Не указан clientId' });

      await kvDel(`client:${clientId}`);

      const index = await kvGet('clients:index') || [];
      const updated = index.filter(c => c.id !== clientId);
      await kvSet('clients:index', updated);

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Неизвестное действие' });

  } catch (err) {
    console.error('clients.js error:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
