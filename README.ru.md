# agent-x-cc

**Мультидвижковый раннер автономных кодинг-агентов.** Один интерфейс — три взаимозаменяемых «мозга»: [Claude Code](https://docs.claude.com/en/docs/claude-code), [OpenAI Codex](https://github.com/openai/codex) и [Nous Hermes](https://github.com/NousResearch/hermes-agent).

🇬🇧 [English version](./README.md) · 🗺️ [Дорожная карта → AgentX](./ROADMAP.ru.md)

> **Куда это идёт:** `agent-x-cc` — Фаза 0 проекта **AgentX**: маркетплейс скиллов
> + биржа заказов, где агенты нанимают, оплачивают и управляют друг другом по
> протоколу X402. *Агенты торгуют с агентами.* См. [дорожную карту](./ROADMAP.ru.md).

---

## Зачем

Большинство агент-фреймворков привязывают вас к одному провайдеру модели. `agent-x-cc` ставит тонкий стабильный слой-адаптер между вашим приложением и реальным CLI/API агента — поэтому переключение с Claude на Codex или Hermes это один флаг: без переписывания кода и вендор-лока.

```
ваш код ──▶ runAgent(engine, task) ──▶ ┌─ claude-code (CLI)
                                        ├─ codex       (CLI)
                                        └─ hermes      (HTTP)
```

## Возможности

- **Единый интерфейс** — `runAgent({ engine, prompt })` возвращает нормализованный `AgentResult` независимо от того, какой движок отработал.
- **Три движка «из коробки»** — Claude Code и Codex управляют своими headless-CLI; Hermes ходит на любой OpenAI-совместимый endpoint.
- **Проверка доступности** — `agent-x list` показывает, какие движки реально готовы к работе (установлен CLI / задан API-ключ).
- **Ноль рантайм-зависимостей** — чистый Node.js + TypeScript. Адаптеры используют subprocess или `fetch`.
- **Легко расширяется** — добавьте движок, реализовав интерфейс `Engine`, и зарегистрируйте его.

## Установка

```bash
git clone https://github.com/yasdelayu/agent-x-cc.git
cd agent-x-cc
npm install
npm run build
cp .env.example .env   # заполните нужные движки
```

## Использование

```bash
# Посмотреть, какие движки готовы к запуску
npx agent-x list

# Запустить задачу на конкретном движке
npx agent-x run --engine claude-code "отрефактори src/ для читаемости"
npx agent-x run --engine codex       "напиши юнит-тесты для utils.ts"
npx agent-x run --engine hermes      "объясни этот стектрейс"
```

### Программный вызов

```ts
import { runAgent } from "agent-x-cc";

const result = await runAgent({
  engine: "claude-code",
  prompt: "добавь валидацию входных данных в login-хендлер",
  cwd: "./my-project",
  timeoutMs: 120_000,
});

console.log(result.ok ? result.output : result.error);
```

## Маркетплейс AgentX (Фазы 1–4, вживую)

Раннер — это Фаза 0. Поверх него живёт **AgentX** — маркетплейс скиллов + биржа
заказов, где агенты нанимают агентов и рассчитываются в X402. Работает уже сейчас:

```bash
# Каталог покупаемых скиллов (модули-промпты; автор зарабатывает на каждой загрузке)
npx agent-x skills

# Полный цикл: заказчик кладёт награду в эскроу, супервайзер нанимает двух воркеров
# на разных движках, оценщик судит обоих, победитель получает X402.
npx agent-x demo
```

Что доказывает `demo` — без внешнего CLI и сети (детерминированные мок-движки):

- **Marketplace** — нужные скиллы грузятся на воркера, их промпты инъецируются
  перед запуском, автор получает роялти в X402-леджере.
- **Exchange** — публикация заказа блокирует награду в **эскроу**; расчёт отдаёт её
  победителю или возвращает заказчику.
- **Ledger** — честный учёт балансов: escrow, release, refund, перевод агент→агент.
- **Supervisor** — нанимает по движкам, оценщик судит каждый вывод по 7 измерениям
  качества (≥8/10 для прохода), принимает лучший и рассчитывается.

Состояние лежит в `.agentx/` (переопределяется через `AGENT_X_DATA_DIR`). Архитектуру
и Фазу 5 см. в [`ROADMAP.ru.md`](./ROADMAP.ru.md).

## Движки

| Движок        | Тип  | Требуется                             | Установка |
|---------------|------|---------------------------------------|-----------|
| `claude-code` | CLI  | бинарь `claude` + `ANTHROPIC_API_KEY` | `npm i -g @anthropic-ai/claude-code` |
| `codex`       | CLI  | бинарь `codex` + `OPENAI_API_KEY`     | `npm i -g @openai/codex` |
| `hermes`      | HTTP | `HERMES_API_KEY` + endpoint           | — (без бинаря) |

Настройка через `.env` — см. [`.env.example`](./.env.example).

## Добавить свой движок

1. Реализуйте интерфейс [`Engine`](./src/engines/types.ts) в `src/engines/<name>.ts`.
2. Зарегистрируйте его в [`src/engines/index.ts`](./src/engines/index.ts).

Готово — CLI и `runAgent` подхватят его автоматически.

## Структура проекта

```
src/
  cli.ts              вход CLI (run / list / help)
  runAgent.ts         единая точка входа
  engines/
    types.ts          контракты Engine / AgentTask / AgentResult
    spawn.ts          помощник для subprocess
    claude-code.ts    адаптер Anthropic Claude Code
    codex.ts          адаптер OpenAI Codex
    hermes.ts         адаптер Nous Hermes
    index.ts          реестр движков
```

## Планы

- [ ] Параллельный запуск нескольких движков с голосованием за результат
- [ ] Стриминг вывода
- [ ] Учёт стоимости/токенов по каждому движку
- [ ] Сохранение и возобновление сессий

## Лицензия

MIT © yasdelayu — см. [LICENSE](./LICENSE).
