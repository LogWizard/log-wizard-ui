# src — структура

Бекенд LogWizard (log-wizard-ui). ESM (`"type": "module"`). Запускається і як PM2, і як Docker-контейнер `logwizard` (той самий код).

## Файли кореня src

| Файл | Призначення |
|------|-------------|
| `server.js` | Головний сервер: HTTPS (3333/HTTP), Express, CORS-proxy, медіа-проксі, аватари, стікери, urlReplaser. Великий файл (~1150 рядків) — кандидат на майбутній рефактор у мікрофайли. |
| `config-manager.js` | `ConfigManager` — читання/запис `config.json`. |
| `certificate.pem` / `privatekey.pem` | TLS-сертифікати для HTTPS-сервера. |

## Підпапки

| Папка | Вміст |
|-------|-------|
| `utils/` | Спільні утиліти. `logger.js` — таймстемп-логер (див. `utils/_structure.md`). |
| `api/` | HTTP-ендпоінти: `send-message.js`, `upload.js`, `manual-mode.js`. |
| `services/` | Бізнес-сервіси: `db.js`, `chats-scanner.js`, `stats-service.js`, `sync-service.js`, `avatar-service.js`, `video-processor.js`. |
| `scripts/` | Разові скрипти: `archive_now.js` (форс-архівація старих повідомлень). |

## Логування
- Усі логи йдуть через `utils/logger.js` (`logInfo` / `logWarn` / `logError`).
- Кожен рядок починається з `[YYYY-MM-DD HH:MM:SS]`.
- Голі `console.*` у новому коді заборонені (виняток — внутрішня реалізація `utils/logger.js`).
