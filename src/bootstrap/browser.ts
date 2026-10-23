import { createSimulation } from './simulation';
import pixelart from '../../js/ui/pixelart.js?legacy';
import render from '../../js/ui/render.js?legacy';
import landing from '../../js/ui/landing.js?legacy';
import main from '../../js/main.js?legacy';

// The storage getter is lazy: reading window.localStorage can throw in a
// privacy-mode frame, and that must degrade to "no persistence", not a crash.
const runtime = createSimulation({ storage: () => window.localStorage });
// Only this browser compatibility boundary exposes a global for the existing UI.
Object.assign(window, { TL: runtime });
pixelart(runtime);
render(runtime);
landing(runtime);
main(runtime);
