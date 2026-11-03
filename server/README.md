# Тезрасон API (сервер)

Node.js 22 · TypeScript · Fastify 5 · PostgreSQL 16 · Redis 7 · WebSocket.

## Оғоз
```bash
docker compose up -d db redis
cp .env.example .env
npm install
npm run dev          # миграцияҳо худкор иҷро мешаванд → http://localhost:3000
npm test             # тестҳои интегратсионӣ (база: hizmat_test, Redis db 15)
```

## Қоидаҳо
- Пул ҳамеша дар **дирам** (integer): 1 TJS = 100 дирам.
- Нарх, минтақа ва ҳадди ақалро сервер аз база ҳисоб мекунад; нархи клиент қабул намешавад.
- Нақшҳо: `customer`, `courier`, `merchant`, `admin` (админ аз `ADMIN_PHONES`).
- Ҳар тағйири ҳолат танҳо тавассути `transition()` (`src/orders-core.ts`): мошини ҳолатҳо, `FOR UPDATE`, журнал, огоҳӣ, refund.

## Endpoint-ҳо
| Метод | Роҳ | Кӣ | Тавсиф |
|---|---|---|---|
| POST | /auth/otp/request, /auth/otp/verify | ҳама | SMS-рамз → JWT |
| GET/PATCH | /me | ✓ | профил |
| PATCH | /admin/users/:id | admin | таъини нақш |
| GET | /merchants?kind=, /merchants/:id | ҳама | тарабхонаҳо / маркет, меню |
| GET/POST/DELETE | /addresses | ✓ | суроғаҳои нигоҳдошташуда (≤ 10) |
| POST | /quotes/cart | ✓ | нарх, масофа, ETA; `out_of_zone`, `below_min_order` |
| POST | /orders | ✓ | фармоиш; корт → `checkoutUrl` |
| GET | /orders[?active=1], /orders/:id | ✓ | рӯйхат (бо таркиб) / тафсилот, ETA, курьер |
| POST | /orders/:id/status | вобаста ба ҳолат | тағйири ҳолат |
| GET/PATCH | /merchant | merchant | тарабхонаи худ: кушода/пӯшида, вақти омодасозӣ |
| POST/PATCH | /merchant/products[/:id] | merchant | меню: нарх, «ҳаст/тамом», маҳсулоти нав |
| POST | /courier/location, /courier/offline | courier | GPS (≤ 60 с), хатми смена |
| GET | /courier/offer | courier | пешниҳоди ҷорӣ |
| POST | /courier/offers/:id/accept\|decline | courier | қабул / рад |
| POST | /payments/webhook | провайдер | натиҷаи пардохт, имзои HMAC-SHA256 (`x-signature`) |
| GET/POST | /payments/mock/:ref | санҷиш | саҳифаи «бонк»-и санҷишӣ |
| WS | /ws?token=JWT | ✓ | `order.new`, `order.status`, `delivery.offer`, `courier.location` |

## Ҳолатҳо
`awaiting_payment` (корт) → `created` → `accepted` → `ready` → `picked_up` → `delivered`; `cancelled` аз `awaiting_payment`, `created`, `accepted`.
Курьер алоҳида таъин мешавад (`courier_id`, рӯйдоди `courier_assigned`).

## Тақсими курьер (`src/dispatch.ts`)
1. Фармоиш `accepted` шуд → GEOSEARCH аз тарабхона (радиус `DISPATCH_RADIUS_KM`), наздиктарин аввал.
2. Филтр: зинда (GPS ≤ 60 с), бе фармоиши фаъол, бе пешниҳоди дигар, ҳанӯз пешниҳод нагирифта.
3. Пешниҳод ба **як** курьер, TTL 30 с. Рад ё гузаштани вақт → курьери навбатӣ. `tick()` ҳар 5 с (қулфи Redis — як инстансия).

## Формулаҳо
- d₀ — haversine (R = 6371 км); масир — OSRM ё d = 1.3·d₀, t = d / 25 км/с
- Минтақа: d₀ ≤ R_тарабхона (`delivery_radius_km`, пешфарз 7 км)
- Расонидан: C = max(700, round₁₀₀(500 + 150·d)) дирам; хизматрасонӣ 5 %
- ETA: T = max(t_омода, t_курьер→тарабхона) + 3 + t_тарабхона→мизоҷ (бе курьер: t_курьер = 10 дақ)

## Пардохт
`src/payments.ts` → интерфейси `PaymentProvider` (`createPayment`, `verifyWebhook`, `refund`).
Ҳоло `MockPayments` (пул гирифта намешавад). Барои production провайдери бонкро амалӣ кунед ва `PAYMENT_WEBHOOK_SECRET`-ро гузоред.
Webhook idempotent аст; бекор кардани фармоиши пардохтшуда → refund.

## Масиркашӣ (OSRM)
`OSRM_URL` холӣ → ҳисоби тахминӣ (d = 1.3·d₀, v = 25 км/с). Сервери худи OSRM барои Тоҷикистон:
```bash
mkdir osrm && cd osrm
wget https://download.geofabrik.de/asia/tajikistan-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/tajikistan-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/tajikistan-latest.osrm
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/tajikistan-latest.osrm
docker run -d -p 5000:5000 -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/tajikistan-latest.osrm
```
Баъд `OSRM_URL=http://localhost:5000`. Вақти OSRM бе трафик аст: t = t_osrm · `TRAFFIC_FACTOR` (пешфарз 1.3, бояд аз рӯи сафарҳои воқеӣ калибровка шавад).
Агар OSRM ҷавоб надиҳад (3 с) → худкор ба ҳисоби тахминӣ мегузарад. Масирҳо дар Redis 1 соат кэш мешаванд.
