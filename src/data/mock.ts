import { L10n } from '../i18n/strings';

export type GeoPoint = { lat: number; lon: number };

export const productCategories: { id: string; name: L10n }[] = [
  { id: 'fruit', name: { tj: 'Мева', ru: 'Фрукты' } },
  { id: 'dairy', name: { tj: 'Ширӣ', ru: 'Молочное' } },
  { id: 'bakery', name: { tj: 'Нон', ru: 'Хлеб' } },
  { id: 'drinks', name: { tj: 'Нӯшокӣ', ru: 'Напитки' } },
];

/** Маркази Душанбе — нуқтаи пешфарз, вақте GPS нест */
export const DUSHANBE_CENTER: GeoPoint = { lat: 38.5781, lon: 68.7838 };
