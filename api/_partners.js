const crypto = require('crypto');

function makeToken(slug, secret) {
  return crypto.createHmac('sha256', secret).update(slug).digest('hex').slice(0, 32);
}

async function kvCmd(...args) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// Все известные слаги: main + всё, что есть в partners:passwords (единственный источник правды)
async function getAllSlugs() {
  const slugs = new Set(['main']);
  try {
    const passwords = await kvCmd('HGETALL', 'partners:passwords');
    if (Array.isArray(passwords)) {
      for (let i = 1; i < passwords.length; i += 2) slugs.add(passwords[i]);
    }
  } catch { /* Redis недоступен */ }
  return [...slugs];
}

async function isActive(slug) {
  try {
    const raw = await kvCmd('GET', `partner:${slug}:data`);
    if (!raw) return slug === 'main'; // main бутстрапится до первой записи в Redis
    return JSON.parse(raw).active !== false;
  } catch {
    return slug === 'main';
  }
}

async function resolveSlugByPassword(password) {
  try {
    const slug = await kvCmd('HGET', 'partners:passwords', password);
    if (slug && await isActive(slug)) return slug;
  } catch { /* Redis недоступен */ }

  // Аварийный доступ (не бутстрап — main уже зарегистрирован в Redis с 2026-07-22).
  // Эта ветка срабатывает только если Redis полностью недоступен (kvCmd выше
  // выбросил, GET здесь тоже упадёт и .catch вернёт null) — тогда владелец
  // всё равно может войти по статичному паролю из env. Решение зафиксировано
  // в PLAN.md (Фаза 14/16): держим как disaster-recovery, не удаляем.
  if (password === process.env.ACCESS_PASSWORD) {
    const mainData = await kvCmd('GET', 'partner:main:data').catch(() => null);
    if (!mainData) return 'main';
  }
  return null;
}

async function resolveSlugByToken(token, secret) {
  if (!token) return null;
  const slugs = await getAllSlugs();
  for (const slug of slugs) {
    if (makeToken(slug, secret) === token && await isActive(slug)) return slug;
  }
  return null;
}

module.exports = { makeToken, kvCmd, getAllSlugs, resolveSlugByPassword, resolveSlugByToken };
