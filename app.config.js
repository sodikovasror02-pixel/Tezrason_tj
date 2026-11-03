// Конфигуратсияи динамикӣ: калиди Google Maps аз муҳит (барои APK/AAB тавассути EAS).
// Дар Expo Go калид лозим нест.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    name: 'Хизмат',
    plugins: [
      ...(config.plugins ?? []),
      ['expo-location', { locationWhenInUsePermission: 'Хизмат ҷойгиршавии шуморо барои такси ва расонидан истифода мебарад / Хизмат использует геопозицию для такси и доставки.' }],
      ...(key ? [['react-native-maps', { androidGoogleMapsApiKey: key }]] : []),
    ],
  };
};
