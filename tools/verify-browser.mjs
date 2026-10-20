import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer, preview} from 'vite';
import {chromium} from 'playwright';

const channel=process.env.TERRA_BROWSER_CHANNEL || 'msedge';
const run=promisify(execFile);
const dev=await createServer({server:{host:'127.0.0.1',port:0}});
await dev.listen();
const production=await preview({base:'/terra-life/',preview:{host:'127.0.0.1',port:0}});
let browser;
try {
  browser=await chromium.launch({channel,headless:true});
  const prodUrl=production.resolvedUrls.local[0];
  for(const [name,url] of [
    ['development',dev.resolvedUrls.local[0]],
    ['production-subpath',prodUrl],
    ['offline-file',new URL('../dist-offline/index.html',import.meta.url).href]
  ]) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
    await page.goto(url);
    await page.locator('#startBtn').click();
    await page.locator('#beginLife').click({timeout:15000});
    await page.waitForFunction(()=>window.TL?.S?.phase==='life');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' layout');
    await page.evaluate(()=>TL.die(TL.S,'old'));
    await page.waitForFunction(()=>!document.getElementById('report').hidden);
    assert.deepEqual(errors,[],name+' browser errors');
    await page.close();
    console.log('PASS:',name,'birth, play, report, resources and narrow viewport');
  }
  await browser.close(); browser=null;
  const {stdout}=await run(process.execPath,['tools/verify-organizations-ui.mjs','playwright',prodUrl],{
    env:{...process.env,TERRA_BROWSER_CHANNEL:channel},maxBuffer:2*1024*1024
  });
  console.log(stdout.trim());
} finally {
  if(browser)await browser.close();
  await dev.close();
  await new Promise((resolve,reject)=>production.httpServer.close(error=>error?reject(error):resolve()));
}
