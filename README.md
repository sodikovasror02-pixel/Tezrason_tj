# Хизмат — супер-барнома (Хӯрок + Такси + Маркет), Душанбе

Expo SDK 58 · React Native 0.88 · TypeScript. Интерфейс: тоҷикӣ / русӣ.

## Оғоз
```bash
npm install
npx expo start        # QR-кодро бо Expo Go (Android/iOS) скан кунед
npx expo start --web  # дар браузер
```

## Сохтор
```
App.tsx                  навигатсия (stack + tab bar)
src/i18n/strings.ts      луғати tj / ru
src/data/mock.ts         тарабхонаҳо, маҳсулот, ҷойҳо, тарифҳо (TJS)
src/data/pricing.ts      haversine, нархи такси, нархи расонидан
src/state/store.tsx      сабад, фармоишҳо, забон (React Context)
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
