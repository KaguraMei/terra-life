import { createSimulation } from './simulation';
import pixelart from '../../js/ui/pixelart.js?legacy';
import render from '../../js/ui/render.js?legacy';
import landing from '../../js/ui/landing.js?legacy';
import main from '../../js/main.js?legacy';

const runtime = createSimulation();
// Only this browser compatibility boundary exposes a global for the existing UI.
Object.assign(window, { TL: runtime });
pixelart(runtime);
render(runtime);
landing(runtime);
main(runtime);
