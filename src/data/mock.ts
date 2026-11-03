import { L10n } from '../i18n/strings';

export type GeoPoint = { lat: number; lon: number };
export type Place = { id: string; name: L10n; point: GeoPoint };

/**
 * Ҷойҳои маъмул барои такси — то пайваст кардани харита ва геокодинг.
 * Координатаҳо тахминӣ (WGS‑84).
 */
export const places: Place[] = [
  { id: 'pl1', name: { tj: 'Фурудгоҳи Душанбе', ru: 'Аэропорт Душанбе' }, point: { lat: 38.5433, lon: 68.825 } },
  { id: 'pl2', name: { tj: 'Майдони Озодӣ', ru: 'Площадь Озоди' }, point: { lat: 38.5762, lon: 68.7797 } },
  { id: 'pl3', name: { tj: 'Бозори Деҳқон', ru: 'Рынок Дехкон (Мехргон)' }, point: { lat: 38.5872, lon: 68.7905 } },
  { id: 'pl4', name: { tj: 'Истгоҳи роҳи оҳан', ru: 'Ж/д вокзал' }, point: { lat: 38.5519, lon: 68.7804 } },
  { id: 'pl5', name: { tj: 'Сино (ДДТТ)', ru: 'Сино (ТГМУ)' }, point: { lat: 38.5906, lon: 68.7456 } },
];

export const productCategories: { id: string; name: L10n }[] = [
  { id: 'fruit', name: { tj: 'Мева', ru: 'Фрукты' } },
  { id: 'dairy', name: { tj: 'Ширӣ', ru: 'Молочное' } },
  { id: 'bakery', name: { tj: 'Нон', ru: 'Хлеб' } },
  { id: 'drinks', name: { tj: 'Нӯшокӣ', ru: 'Напитки' } },
];

/** Нуқтаи расонидани пешфарз — то пайваст кардани GPS/харита */
export const defaultDeliveryPoint: GeoPoint = { lat: 38.5781, lon: 68.7838 };
