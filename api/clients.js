const crypto = require('crypto');

function makeToken(mode, secret) {
  return crypto.createHmac('sha256', secret).update(mode).digest('hex').slice(0, 32);
}

async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
}

async function kvDel(key) {
  const url = `${process.env.KV_REST_API_URL}/del/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

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

      const client = { id, name, age: age || '', gender: gender || '', phone: phone || '', notes: notes || '', created: now, sessions: [] };

      // Сохраняем клиента
      await kvSet(`client:${id}`, client);

      // Обновляем индекс
      const index = await kvGet('clients:index') || [];
      index.unshift({ id, name, age: age || '', gender: gender || '', created: now, lastSession: null });
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
