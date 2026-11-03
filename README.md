# Хизмат — супер-барнома (Хӯрок + Такси + Маркет), Душанбе

Expo SDK 58 · React Native 0.88 · TypeScript. Интерфейс: тоҷикӣ / русӣ.

## Оғоз
```bash
# 1) сервер (ниг. server/README.md)
cd server && docker compose up -d db redis && npm install && npm run dev
# 2) барнома
cd .. && npm install && npx expo start   # QR-кодро бо Expo Go скан кунед
```
Суроғаи API худкор муайян мешавад (IP-и компютере, ки Metro дар он кор мекунад, порти 3000).
Барои production: `EXPO_PUBLIC_API_URL=https://api.example.tj`.
Телефон ва компютер бояд дар як шабакаи Wi‑Fi бошанд.

## Сохтор
```
App.tsx                  навигатсия (stack + tab bar)
src/i18n/strings.ts      луғати tj / ru
src/api/                 client (fetch + JWT), types, tokenStorage (SecureStore)
src/data/mock.ts         ҷойҳои маъмул барои такси (то харита)
src/state/store.tsx      сессия, сабад, фармоишҳо, WebSocket
server/                  API (Fastify + PostgreSQL + Redis)
src/screens/*            Home, Food, Restaurant, Market, Cart, Taxi, Orders, Profile
```

## Формулаҳо
- Масофа: haversine, R = 6371 км; d_роҳ = 1.3·d₀
- Вақт: t = d / 25 км/соат
- Такси: C = max(C_min, (C₀ + c_km·d + c_min·t)·k_surge), k_surge = 1.3 (07–09, 17–19)
- Расонидан: C = max(7, 5 + 1.5·d) TJS; хизматрасонӣ 5%

## Қадамҳои навбатӣ (production)
1. Backend: NestJS/FastAPI + PostgreSQL/PostGIS, Redis, WebSocket (ҳолати фармоиш, ҷойгиршавии ронанда)
2. Харита: react-native-maps + OSRM (масофаи воқеии роҳ)
3. Аутентификатсия: SMS-OTP (+992)
4. Пардохт: Корти Миллӣ / DC Wallet / Alif (API-и бонк)
5. Барномаҳои алоҳида: курьер/ронанда, панели тарабхона, админ
6. Сохтан: `npx eas-cli@latest build -p android`

## Харита
- iOS: Apple Maps; Android: Google Maps. Дар Expo Go калид лозим нест.
- Барои APK/AAB: `GOOGLE_MAPS_API_KEY=... npx eas-cli@latest build -p android` (ниг. `app.config.js`).
- Дар веб — нақшаи схематикӣ (`RouteMap.web.tsx`), танҳо барои санҷиш.
