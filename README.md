# Тезрасон — расонидани хӯрок ва маҳсулот (Душанбе)

Expo SDK 58 · React Native · TypeScript. Интерфейс: тоҷикӣ / русӣ.
Сервер: [`server/`](server/README.md) — Fastify 5 · PostgreSQL 16 · Redis · WebSocket.

Як барнома, се нақш (аз рӯи `user.role` баъди воридшавӣ):

| Нақш | Имкониятҳо |
|---|---|
| Мизоҷ | Тарабхонаҳо ва маркет, сабад, суроғаҳои нигоҳдошташуда (даромадгоҳ/ошёна/хона/шарҳ), нақд ё корт, ETA, курьер дар харита, занг ба курьер |
| Курьер | Смена (онлайн/офлайн), GPS дар пасзамина, пешниҳоди худкор бо ҳисоби баръакси 30 с, навигатсия, «Гирифтам» → «Расонидам», даромади имрӯз |
| Тарабхона | Фармоишҳои нав (бо ларзиш), «Қабул» → «Омода шуд», меню: нарх ва «ҳаст/тамом», кушода/пӯшида, вақти омодасозӣ |

## Оғоз (development)
```bash
cd server && docker compose up -d db redis && npm install && npm run dev
```
```bash
npm install && npx expo start   # QR-кодро бо Expo Go скан кунед
```
Суроғаи API худкор муайян мешавад (IP-и компютере, ки Metro дар он кор мекунад, порти 3000).
Телефон ва компютер бояд дар як шабакаи Wi‑Fi бошанд. Нақшҳо: `PATCH /admin/users/:id` (админ аз `ADMIN_PHONES`).

## Сохтани APK (Android)
GPS-и пасзамина ва Google Maps дар Expo Go кор намекунанд — сохтани EAS лозим аст:
```bash
npx eas-cli@latest login
```
```bash
npx eas-cli@latest init
```
```bash
GOOGLE_MAPS_API_KEY=... npx eas-cli@latest build -p android --profile preview
```
- `preview` → `.apk` барои насби мустақим; `production` → `.aab` барои Google Play.
- Суроғаи сервер дар `eas.json` → `EXPO_PUBLIC_API_URL` (ҳоло `https://tezrason-api.onrender.com` — иваз кунед).
- Калиди Google Maps: Google Cloud Console → Maps SDK for Android (бо маҳдудияти `tj.tezrason.app` + SHA‑1).
- Барои Google Play иҷозати `ACCESS_BACKGROUND_LOCATION` эъломия ва видеои кӯтоҳ талаб мекунад.

## Сохтор
```
App.tsx                      навигатсия; интихоби интерфейс аз рӯи нақш
index.ts                     эълони вазифаи GPS-и пасзамина (пеш аз render)
src/api/                     client (fetch + JWT), types, tokenStorage (SecureStore)
src/state/store.tsx          сессия, сабад, суроға, фармоишҳо, WebSocket
src/screens/                 экранҳои мизоҷ (+ AddressesScreen)
src/courier/                 CourierApp, useCourierShift, backgroundLocation
src/merchant/MerchantApp.tsx панели тарабхона
src/components/RouteMap*.tsx харита (native) / нақшаи схематикӣ (web)
app.config.js, eas.json      ном, package, иҷозатҳо, профилҳои сохтан
```
