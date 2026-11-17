// SUPERSHOT client entry point.
import '@fontsource/exo-2/latin-800-italic.css';
import '@fontsource/exo-2/latin-900-italic.css';
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/chakra-petch/latin-700-italic.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/teko/latin-500.css';
import '@fontsource/teko/latin-600.css';
import './styles/main.css';
import { render } from 'preact';
import { App } from './ui/App.jsx';
import { app } from './app.js';
import { S } from './state.js';
import { input } from './input.js';
import { net } from './net.js';

function supportsWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

const uiRoot = document.getElementById('ui');
const hudRoot = document.createElement('div');
hudRoot.id = 'ui-hud';
document.body.insertBefore(hudRoot, uiRoot);
document.getElementById('boot')?.remove();

if (!supportsWebGL2()) {
  uiRoot.innerHTML = '<div class="fatal"><h1>SUPERSHOT</h1><p>Your browser or device does not support WebGL 2. Please use a recent version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p></div>';
} else {
  render(<App />, uiRoot);
  // wait for fonts so canvas text (signs, name tags) uses them
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))])
    .then(() => app.boot())
    .catch((e) => {
      console.error(e);
      S.loading.value = { progress: 0, text: 'FAILED TO START — PLEASE REFRESH' };
    });
}

// expose for debugging / automated tests
window.__supershot = { app, S, input, net };
