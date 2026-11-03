# Хизмат API (сервер)

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
- Нархро сервер аз база ҳисоб мекунад; нархи клиент қабул намешавад.
- Нақшҳо: `customer`, `driver`, `courier`, `merchant`, `admin` (админ аз `ADMIN_PHONES`).

## Endpoint-ҳо
| Метод | Роҳ | Кӣ | Тавсиф |
|---|---|---|---|
| POST | /auth/otp/request | ҳама | SMS-рамз (+992…), 1 дар 60 с |
| POST | /auth/otp/verify | ҳама | рамз → JWT (30 рӯз) |
| GET/PATCH | /me | ✓ | профил |
| PATCH | /admin/users/:id | admin | таъини нақш |
| GET | /merchants?kind= | ҳама | тарабхонаҳо / маркет |
| GET | /merchants/:id | ҳама | бо меню |
| GET | /tariffs | ҳама | тарифҳои такси |
| POST | /quotes/cart | ✓ | ҳисоби сабад |
| POST | /orders | ✓ | фармоиши хӯрок/маркет |
| POST | /quotes/taxi | ҳама | нарх барои ҳамаи тарифҳо |
| POST | /rides | ✓ | даъвати такси + пешниҳод ба ронандаҳои наздик |
| POST | /drivers/location | driver, courier | ҷойгиршавӣ (ҳар ≤60 с) |
| GET | /jobs | driver, courier | фармоишҳои озод |
| POST | /orders/:id/claim | driver, courier | гирифтан (атомӣ) |
| POST | /orders/:id/status | вобаста ба ҳолат | тағйири ҳолат |
| GET | /orders, /orders/:id | ✓ | рӯйхат / тафсилот + журнал |
| WS | /ws?token=JWT | ✓ | `order.new`, `order.status`, `ride.offer`, `driver.location` |

## Ҳолатҳо
- Хӯрок/маркет: `created → accepted → ready → picked_up → delivered` (+ `cancelled`)
- Такси: `searching → driver_assigned → arrived → in_progress → completed` (+ `cancelled`)

## Формулаҳо
- d₀ — haversine (R = 6371 км); d = 1.3·d₀; t = d / 25 км/с
- Такси: C = max(C_min, round₁₀₀((C₀ + c_km·d + c_min·t)·k)), k = 1.3 дар 07–09, 17–19 (UTC+5)
- Расонидан: C = max(700, round₁₀₀(500 + 150·d)) дирам; хизматрасонӣ 5 %

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
