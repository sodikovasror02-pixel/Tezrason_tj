import { L10n } from '../i18n/strings';

export type GeoPoint = { lat: number; lon: number };

export type MenuItem = { id: string; name: L10n; price: number; emoji: string };
export type Restaurant = {
  id: string;
  name: string;
  cuisine: L10n;
  emoji: string;
  rating: number;
  etaMin: number;
  location: GeoPoint;
  menu: MenuItem[];
};

export type Product = {
  id: string;
  name: L10n;
  unit: L10n;
  price: number;
  emoji: string;
  category: 'fruit' | 'dairy' | 'bakery' | 'drinks';
};

export type Place = { id: string; name: L10n; point: GeoPoint };

export type Tariff = {
  id: string;
  name: L10n;
  emoji: string;
  base: number; // TJS, посадка
  perKm: number; // TJS/км
  perMin: number; // TJS/мин
  minFare: number; // TJS
};

// Координатаҳо тахминӣ (WGS‑84)
export const restaurants: Restaurant[] = [
  {
    id: 'r1',
    name: 'Ошхонаи Роҳат',
    cuisine: { tj: 'Тоҷикӣ', ru: 'Таджикская' },
    emoji: '🍚',
    rating: 4.8,
    etaMin: 35,
    location: { lat: 38.5733, lon: 68.7864 },
    menu: [
      { id: 'm1', name: { tj: 'Оши палов', ru: 'Плов' }, price: 35, emoji: '🍛' },
      { id: 'm2', name: { tj: 'Қурутоб', ru: 'Курутоб' }, price: 40, emoji: '🥗' },
      { id: 'm3', name: { tj: 'Самбӯса', ru: 'Самса' }, price: 8, emoji: '🥟' },
      { id: 'm4', name: { tj: 'Чойи кабуд', ru: 'Зелёный чай' }, price: 5, emoji: '🍵' },
    ],
  },
  {
    id: 'r2',
    name: 'Шашлыкхона Помир',
    cuisine: { tj: 'Кабоб', ru: 'Шашлык' },
    emoji: '🍢',
    rating: 4.6,
    etaMin: 40,
    location: { lat: 38.5598, lon: 68.774 },
    menu: [
      { id: 'm5', name: { tj: 'Кабоби гӯсфанд', ru: 'Шашлык из баранины' }, price: 18, emoji: '🍢' },
      { id: 'm6', name: { tj: 'Лаваш', ru: 'Лаваш' }, price: 4, emoji: '🫓' },
      { id: 'm7', name: { tj: 'Салати помидор', ru: 'Салат из помидоров' }, price: 12, emoji: '🥗' },
    ],
  },
  {
    id: 'r3',
    name: 'Pizza Dushanbe',
    cuisine: { tj: 'Итолиёвӣ', ru: 'Итальянская' },
    emoji: '🍕',
    rating: 4.5,
    etaMin: 30,
    location: { lat: 38.5862, lon: 68.7791 },
    menu: [
      { id: 'm8', name: { tj: 'Маргарита', ru: 'Маргарита' }, price: 55, emoji: '🍕' },
      { id: 'm9', name: { tj: 'Пеппероні', ru: 'Пепперони' }, price: 65, emoji: '🍕' },
      { id: 'm10', name: { tj: 'Кока-кола 1л', ru: 'Кока-кола 1л' }, price: 12, emoji: '🥤' },
    ],
  },
];

export const products: Product[] = [
  { id: 'p1', name: { tj: 'Себ', ru: 'Яблоки' }, unit: { tj: '1 кг', ru: '1 кг' }, price: 12, emoji: '🍎', category: 'fruit' },
  { id: 'p2', name: { tj: 'Ангур', ru: 'Виноград' }, unit: { tj: '1 кг', ru: '1 кг' }, price: 18, emoji: '🍇', category: 'fruit' },
  { id: 'p3', name: { tj: 'Шир', ru: 'Молоко' }, unit: { tj: '1 л', ru: '1 л' }, price: 10, emoji: '🥛', category: 'dairy' },
  { id: 'p4', name: { tj: 'Чака', ru: 'Чакка' }, unit: { tj: '0.5 кг', ru: '0.5 кг' }, price: 9, emoji: '🥣', category: 'dairy' },
  { id: 'p5', name: { tj: 'Нони тандирӣ', ru: 'Тандырная лепёшка' }, unit: { tj: '1 дона', ru: '1 шт' }, price: 3, emoji: '🫓', category: 'bakery' },
  { id: 'p6', name: { tj: 'Оби минералӣ', ru: 'Минеральная вода' }, unit: { tj: '1.5 л', ru: '1.5 л' }, price: 5, emoji: '💧', category: 'drinks' },
];

export const productCategories: { id: Product['category']; name: L10n }[] = [
  { id: 'fruit', name: { tj: 'Мева', ru: 'Фрукты' } },
  { id: 'dairy', name: { tj: 'Ширӣ', ru: 'Молочное' } },
  { id: 'bakery', name: { tj: 'Нон', ru: 'Хлеб' } },
  { id: 'drinks', name: { tj: 'Нӯшокӣ', ru: 'Напитки' } },
];

export const places: Place[] = [
  { id: 'pl1', name: { tj: 'Фурудгоҳи Душанбе', ru: 'Аэропорт Душанбе' }, point: { lat: 38.5433, lon: 68.825 } },
  { id: 'pl2', name: { tj: 'Майдони Озодӣ', ru: 'Площадь Озоди' }, point: { lat: 38.5762, lon: 68.7797 } },
  { id: 'pl3', name: { tj: 'Бозори Деҳқон', ru: 'Рынок Дехкон (Мехргон)' }, point: { lat: 38.5872, lon: 68.7905 } },
  { id: 'pl4', name: { tj: 'Истгоҳи роҳи оҳан', ru: 'Ж/д вокзал' }, point: { lat: 38.5519, lon: 68.7804 } },
  { id: 'pl5', name: { tj: 'Сино (ДДТТ)', ru: 'Сино (ТГМУ)' }, point: { lat: 38.5906, lon: 68.7456 } },
];

export const tariffs: Tariff[] = [
  { id: 'econom', name: { tj: 'Эконом', ru: 'Эконом' }, emoji: '🚗', base: 5, perKm: 2.0, perMin: 0.3, minFare: 10 },
  { id: 'comfort', name: { tj: 'Комфорт', ru: 'Комфорт' }, emoji: '🚙', base: 8, perKm: 2.8, perMin: 0.4, minFare: 15 },
  { id: 'business', name: { tj: 'Бизнес', ru: 'Бизнес' }, emoji: '🚘', base: 15, perKm: 4.5, perMin: 0.6, minFare: 30 },
];

/** Нуқтаи расонидани пешфарз (ҳамон суроғаи профил) */
export const defaultDeliveryPoint: GeoPoint = { lat: 38.5781, lon: 68.7838 };
