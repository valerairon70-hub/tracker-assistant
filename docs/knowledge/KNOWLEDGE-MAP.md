# KNOWLEDGE MAP — Coral Club AI

Навигация по базе знаний. Обновлять этот файл при добавлении новых документов.

## Структура

```
docs/knowledge/
├── KNOWLEDGE-MAP.md              ← этот файл
├── core/
│   ├── methodology.md            ← метод Бутаковой: 7 шагов, 12 систем, цвета
│   ├── systems.md                ← 12 систем: аббревиатуры, часы, приоритет
│   └── safety-rules.md           ← GUARDRAILS: запреты, острая фаза, дисклеймер
├── products/
│   └── catalog.md                ← 72 продукта: название, система, действие
├── protocols/
│   ├── by-system/
│   │   ├── cns.md                ← ЦНС: 10 программ
│   │   ├── respiratory.md        ← ДС: 5 программ
│   │   ├── cardiovascular.md     ← ССС: 7 программ
│   │   ├── blood.md              ← КС: 7 программ
│   │   ├── digestive.md          ← ПС: 10 программ
│   │   ├── urinary.md            ← МВС+Кожа: 9 программ
│   │   ├── reproductive.md       ← РС: 8 программ (жен+муж)
│   │   ├── endocrine.md          ← ЭС: 6 программ
│   │   ├── musculoskeletal.md    ← КМС: 7 программ
│   │   ├── lymphatic.md          ← ЛС: 3 программы
│   │   ├── immune.md             ← ИС: 6 программ
│   │   └── pns.md                ← ПНС: 3 программы
│   └── special/
│       ├── parasites.md          ← Парашилд / Парашилд Плюс
│       └── cleansing.md          ← Коло-Вада Лайт / Плюс / Грин
└── screening/
    └── safety-questions.md       ← скрининг: когда, какие вопросы, логика

```

## Соответствие файл → раздел SYSTEM_PROMPT в api/analyze.js

| Файл docs/knowledge/        | Секция в api/analyze.js             |
|-----------------------------|--------------------------------------|
| core/methodology.md         | `═══ МЕТОД БУТАКОВОЙ ═══`           |
| core/systems.md             | `═══ 12 СИСТЕМ ОРГАНИЗМА ═══`       |
| core/safety-rules.md        | `const GUARDRAILS`                   |
| products/catalog.md         | `═══ ПОЛНЫЙ КАТАЛОГ ПРОДУКТОВ ═══`  |
| protocols/by-system/*.md    | `═══ ОФИЦИАЛЬНЫЕ ПРОГРАММЫ ═══`     |
| protocols/special/*.md      | `ПРОГРАММЫ ОЧИЩЕНИЯ / ЗАЩИТЫ...`    |
| screening/safety-questions  | `═══ СКРИНИНГ БЕЗОПАСНОСТИ ═══`     |

## Правила обновления

1. **Новый продукт** → обновить `products/catalog.md` и нужный файл в `protocols/by-system/`; потом обновить SYSTEM_PROMPT в `api/analyze.js`
2. **Новая программа** → добавить в соответствующий `protocols/by-system/*.md` и в `api/analyze.js`
3. **Цены ПЭК** → менять только в `api/analyze.js` (секция `═══ СОСТАВ И ЦЕНЫ ПЭКОВ ═══`)
4. **Правила безопасности** → менять в `core/safety-rules.md` И в `api/analyze.js` (GUARDRAILS)

## Счётчик продуктов

Текущее кол-во продуктов в каталоге: **72**
Последнее обновление: 2026-06-12
