import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider, useStore } from './src/state/store';
import { Nav, Route } from './src/nav';
import { C, ErrorView, Loading } from './src/components/ui';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import FoodScreen from './src/screens/FoodScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import MarketScreen from './src/screens/MarketScreen';
import CartScreen from './src/screens/CartScreen';
import TaxiScreen from './src/screens/TaxiScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import ProfileScreen from './src/screens/ProfileScreen';

function Root() {
  const { t, booting, bootError, retryBoot, user, errText } = useStore();
  const [stack, setStack] = useState<Route[]>([{ name: 'tabs', tab: 'home' }]);
  const nav: Nav = useMemo(
    () => ({
      push: (r) => setStack((st) => [...st, r]),
      back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
      reset: (r) => setStack([r]),
    }),
    [],
  );
  const route = stack[stack.length - 1];
  // Баъд аз баромадан/воридшавӣ — аз экрани асосӣ оғоз
  useEffect(() => {
    if (!user) setStack([{ name: 'tabs', tab: 'home' }]);
  }, [user]);

  if (booting) return <View style={styles.root}><Loading /></View>;
  if (bootError) return <View style={styles.root}><ErrorView text={errText(bootError)} retryLabel={t('retry')} onRetry={() => void retryBoot()} /></View>;
  if (!user) return <View style={styles.root}><StatusBar style="dark" /><LoginScreen /></View>;

  let screen: React.ReactNode;
  switch (route.name) {
    case 'food': screen = <FoodScreen nav={nav} />; break;
    case 'restaurant': screen = <RestaurantScreen nav={nav} id={route.id} />; break;
    case 'market': screen = <MarketScreen nav={nav} />; break;
    case 'cart': screen = <CartScreen nav={nav} />; break;
    case 'taxi': screen = <TaxiScreen nav={nav} />; break;
    case 'tabs':
      screen = route.tab === 'home' ? <HomeScreen nav={nav} /> : route.tab === 'orders' ? <OrdersScreen /> : <ProfileScreen />;
      break;
  }

  const tabs = [
    { key: 'home', icon: '🏠', label: t('home') },
    { key: 'orders', icon: '📦', label: t('orders') },
    { key: 'profile', icon: '👤', label: t('profile') },
  ] as const;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>{screen}</View>
      {route.name === 'tabs' && (
        <View style={styles.tabbar}>
          {tabs.map((x) => {
            const active = route.tab === x.key;
            return (
              <Pressable key={x.key} style={styles.tab} onPress={() => nav.reset({ name: 'tabs', tab: x.key })}>
                <Text style={{ fontSize: 20, opacity: active ? 1 : 0.5 }}>{x.icon}</Text>
                <Text style={{ fontSize: 11, color: active ? C.primary : C.muted, fontWeight: active ? '700' : '400' }}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : Platform.OS === 'ios' ? 50 : 0 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: Platform.OS === 'ios' ? 20 : 6, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
});
