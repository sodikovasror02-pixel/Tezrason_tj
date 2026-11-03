// Конфигуратсияи динамикӣ (app.json + муҳит). Калидҳо аз муҳит, на дар код.

/** ID-и лоиҳа дар expo.dev (сирр нест) */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '14c4286e-b894-4e4d-b8f7-afbece4f9164';
/** Ҳисоби expo.dev, ки соҳиби лоиҳа аст */
const EAS_OWNER = 'asrorsodikov';

module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const permission =
    'Тезрасон ҷойгиршавии шуморо барои расонидан истифода мебарад / Тезрасон использует геопозицию для доставки.';
  return {
    ...config,
    name: 'Тезрасон',
    slug: 'tezrason',
    owner: EAS_OWNER,
    scheme: 'tezrason',
    ios: {
      ...config.ios,
      bundleIdentifier: 'tj.tezrason.app',
    },
    android: {
      ...config.android,
      package: 'tj.tezrason.app',
      // Танҳо иҷозатҳои лозимӣ (Google Play иҷозатҳои зиёдатиро рад мекунад)
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS', 'VIBRATE'],
      // Иҷозатҳои шаблон, ки лозим нестанд (Google Play SYSTEM_ALERT_WINDOW-ро «ҳассос» меҳисобад)
      blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.RECEIVE_BOOT_COMPLETED'],
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-location',
        {
          locationWhenInUsePermission: permission,
          locationAlwaysAndWhenInUsePermission: permission + ' (курьер: ҳатто вақте барнома пӯшида аст)',
          // GPS-и пасзамина барои курьер (Foreground Service дар Android)
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          isIosBackgroundLocationEnabled: true,
        },
      ],
      ...(mapsKey ? [['react-native-maps', { androidGoogleMapsApiKey: mapsKey }]] : []),
    ],
    extra: { ...config.extra, ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}) },
  };
};
