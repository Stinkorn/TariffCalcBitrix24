# VPS deployment через PM2 и Nginx

Инструкция описывает production-запуск TariffCalcBitrix24 на Ubuntu 22.04/24.04:

- frontend: `https://calc.<domain>` как static build из `apps/web/dist`
- backend: `https://api.calc.<domain>` через Nginx proxy на `127.0.0.1:9099`
- process manager: PM2
- база данных: внешняя PostgreSQL на порту `5432`
- Prisma для MVP: `db push`, не `migrate dev`

Замените `<domain>` и пути на реальные значения перед выполнением команд.

## 1. DNS

Создайте A-записи на статический IPv4 VPS:

```text
calc.<domain>      A    <VPS_IPV4>
api.calc.<domain>  A    <VPS_IPV4>
```

Дождитесь применения DNS и проверьте:

```bash
dig +short calc.<domain>
dig +short api.calc.<domain>
```

## 2. Пакеты сервера

```bash
sudo apt update
sudo apt install -y curl git nginx certbot python3-certbot-nginx
```

Node.js 20 через NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

PM2:

```bash
sudo npm install -g pm2
pm2 -v
```

## 3. Код проекта

Рекомендуемый путь:

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
cd /var/www
git clone <REPOSITORY_URL> tariffcalc-bitrix24
cd /var/www/tariffcalc-bitrix24
```

Если код уже загружен другим способом, дальше выполняйте команды из корня проекта.

## 4. Environment

Backend:

```bash
cp apps/api/.env.production.example apps/api/.env
nano apps/api/.env
```

Минимальный production-набор:

```env
APP_PORT=9099
APP_PUBLIC_URL=https://api.calc.<domain>
WEB_PUBLIC_URL=https://calc.<domain>
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
BITRIX_PORTAL_DOMAIN=
BITRIX_WEBHOOK_URL=
```

Frontend:

```bash
cp apps/web/.env.production.example apps/web/.env.production
nano apps/web/.env.production
```

Значение:

```env
VITE_API_URL=https://api.calc.<domain>
```

Важно: Vite подставляет `VITE_API_URL` во время сборки, поэтому после изменения frontend env нужно заново выполнить `npm run build:web`.

## 5. Установка, Prisma и сборка

```bash
npm install
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
npm run build
```

`prisma:push` применит текущую схему к внешней PostgreSQL. Для текущего MVP не используйте `prisma migrate dev` на VPS.

## 6. Запуск backend через PM2

Убедитесь, что каталог логов существует:

```bash
mkdir -p logs
```

Старт:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

Автозапуск после перезагрузки VPS:

```bash
pm2 startup systemd
```

Команда напечатает строку с `sudo env ... pm2 startup ...`; выполните ее один раз, затем снова:

```bash
pm2 save
```

Логи:

```bash
pm2 logs tariffcalc-api --lines 100
```

## 7. Nginx

Скопируйте пример:

```bash
sudo cp docs/nginx/tariffcalc-vps.conf.example /etc/nginx/sites-available/tariffcalc
sudo nano /etc/nginx/sites-available/tariffcalc
```

Замените:

- `calc.<domain>` на реальный frontend-домен
- `api.calc.<domain>` на реальный backend-домен
- `/var/www/tariffcalc-bitrix24` на реальный путь к проекту, если он отличается

Включите site:

```bash
sudo ln -s /etc/nginx/sites-available/tariffcalc /etc/nginx/sites-enabled/tariffcalc
sudo nginx -t
sudo systemctl reload nginx
```

Если default site мешает, отключите его:

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 8. HTTPS через Let's Encrypt

После того как DNS указывает на VPS и Nginx отвечает на 80 порту:

```bash
sudo certbot --nginx -d calc.<domain> -d api.calc.<domain>
sudo certbot certificates
sudo nginx -t
sudo systemctl reload nginx
```

Certbot добавит SSL-настройки в Nginx config и настроит renew timer.

## 9. Проверка после деплоя

PM2:

```bash
pm2 status
pm2 logs tariffcalc-api --lines 100
```

API:

```bash
curl https://api.calc.<domain>/health
curl https://api.calc.<domain>/dictionaries/bootstrap
```

Frontend:

```bash
curl -I https://calc.<domain>
```

В браузере:

1. Откройте `https://calc.<domain>/deal-calculator`.
2. Проверьте, что справочники грузятся с `https://api.calc.<domain>/dictionaries/bootstrap`.
3. Выполните тестовый расчет.
4. Нажмите `Сохранить расчет`.
5. Проверьте, что история расчетов обновилась и данные сохраняются во внешней PostgreSQL.

Nginx/SSL:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo certbot certificates
```

## 10. Обновление приложения

Из корня проекта на VPS:

```bash
git pull
npm install
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
npm run build
pm2 restart tariffcalc-api
sudo nginx -t
sudo systemctl reload nginx
```

Если менялся только frontend env, обязательно выполните `npm run build:web` или общий `npm run build`.

## Troubleshooting

- `502 Bad Gateway` на `api.calc.<domain>`: проверьте `pm2 status`, `pm2 logs tariffcalc-api --lines 100`, порт `9099`.
- CORS ошибка в браузере: проверьте `WEB_PUBLIC_URL=https://calc.<domain>` в `apps/api/.env` и перезапустите PM2.
- Frontend обращается к localhost: проверьте `apps/web/.env.production` и пересоберите frontend.
- Prisma не подключается к БД: проверьте `DATABASE_URL`, доступность PostgreSQL с VPS и firewall облачной БД.
- Bitrix24 не открывает iframe: проверьте HTTPS, `APP_PUBLIC_URL`, `WEB_PUBLIC_URL` и handler `https://api.calc.<domain>/bitrix/deal-tab`.
