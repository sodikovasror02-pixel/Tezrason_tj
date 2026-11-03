import { registerRootComponent } from 'expo';
// Вазифаи GPS-и пасзамина бояд пеш аз render эълон шавад
import './src/courier/backgroundLocation';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
