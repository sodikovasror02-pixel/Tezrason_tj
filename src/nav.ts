/**
 * Навигатсияи сабук бе китобхонаи берунӣ (stack дар state).
 * Барои production → Expo Router (src/app/*) иваз кардан мумкин.
 */
export type Route =
  | { name: 'tabs'; tab: 'home' | 'orders' | 'profile' }
  | { name: 'food' }
  | { name: 'restaurant'; id: string }
  | { name: 'market' }
  | { name: 'cart' }
  | { name: 'taxi' };

export type Nav = {
  push: (r: Route) => void;
  back: () => void;
  reset: (r: Route) => void;
};
