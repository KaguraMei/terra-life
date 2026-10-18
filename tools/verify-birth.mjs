// Behavioral checks for the entrance, using the real simulation and a minimal DOM.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const html = read('index.html');
const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], {
  hidden:false, textContent:'', innerHTML:'', scrollTop:0,
  setAttribute(){}, removeAttribute(){}, focus(){}, addEventListener(){}
}]));
const queue = new Map(); const delays = []; let serial = 0, reduced = false;
const win = { matchMedia:()=>({matches:reduced}) };
const context = vm.createContext({window:win,console,Math,JSON,Date,Intl,Float64Array,
  document:{getElementById:id=>{assert.ok(elements.has(id),`DOM id ${id}`);return elements.get(id);}},
  setTimeout:(fn,delay)=>{delays.push(delay);queue.set(++serial,fn);return serial;},
  clearTimeout:id=>queue.delete(id)});
for (const m of html.matchAll(/<script src="([^"]+)"/g)) {
  if (m[1].includes('/ui/') || m[1] === 'js/main.js') continue;
  vm.runInContext(read(m[1]),context,{filename:m[1]});
}
vm.runInContext(read('js/ui/landing.js'),context);
const T = win.TL;
const $ = id => elements.get(id);
function drain() {
  let guard = 0;
  while(queue.size) {
    assert.ok(++guard <= 30, 'animation must terminate');
    const [id,fn] = queue.entries().next().value; queue.delete(id); fn();
  }
}
function trial(options = {}) {
  const setup = {seed:789,nation:'YAN',race:'sarkaz',pace:'short',bornYear:1082};
  T.newLife(setup); const expectedRng = T.rnd();
  const S = T.newLife(setup); let begins=0; delays.length=0;
  T.birthIntro(S,{mode:options.mode || 'birth',specified:!!options.specified},()=>begins++);
  assert.equal(S.age,0); assert.equal(S.paused,true);
  assert.equal($('birthRoller').hidden,false);
  $('beginLife').onclick(); assert.equal(begins,0,'cannot begin during roll');
  drain();
  assert.equal(delays.length,reduced || options.specified ? 1 : 26);
  assert.equal(delays.at(-1),650);
  if(delays.length>1) assert.ok(delays.slice(0,-1).every((d,i,a)=>i===0 || d>a[i-1]));
  assert.equal($('rollName').textContent,'炎国');
  assert.equal($('certName').textContent,S.fullName);
  assert.equal($('birthCertificate').hidden,false);
  assert.equal(S.age,0); assert.equal(S.t,0);
  assert.equal(T.rnd(),expectedRng,'presentation must not consume simulation RNG');
  assert.ok(!$('certFields').innerHTML.includes('undefined'));
  if(options.back) {
    $('birthBack').onclick(); assert.equal(T.S,null); assert.equal($('start').hidden,false);
  } else {
    $('beginLife').onclick(); $('beginLife').onclick();
    assert.equal(begins,1,'a life begins exactly once');
    assert.equal(S.paused,false); assert.equal($('birth').hidden,true);
  }
}
trial(); trial({back:true}); trial({specified:true}); trial({mode:'pop'});
reduced=true; trial(); reduced=false;
for(const mode of ['birth','pop']) {
  T.renderLandingOdds(mode);
  assert.equal(($('oddsAll').innerHTML.match(/class="odds-row/g)||[]).length,21);
  assert.ok(!$('oddsTable').innerHTML.includes('NaN'));
}
console.log('PASS: 26 slowing frames, 650ms result, certificate, pause, one-shot start, return, specified country, reduced motion, RNG isolation, 21-country odds.');
