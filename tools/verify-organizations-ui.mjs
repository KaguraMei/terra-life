// Optional browser check: start tools/serve.mjs, then pass a Playwright module path and URL.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const {chromium} = require(process.argv[2] || 'playwright');
const browser = await chromium.launch({channel:process.env.TERRA_BROWSER_CHANNEL || 'msedge',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404')) errors.push(m.text());});
  await page.goto(process.argv[3] || 'http://127.0.0.1:8814/');
  await page.locator('#startBtn').click();
  await page.locator('#beginLife').click({timeout:15000});
  async function answerInterview(style='best') {
    for(let i=0;i<6;i++) {
      await page.waitForFunction(()=>['organization_interview','organization_interview_result'].includes(TL.S.pending?.id));
      if(await page.evaluate(()=>TL.S.pending.id==='organization_interview_result')) break;
      const choice=await page.evaluate(style=>{
        const a=TL.S.orgApplication,q=a.session.questions[a.session.answers.length];
        const values=q.options.map(o=>a.session.pool.axes.reduce((s,x)=>s+o.scores[x.id]*x.weight,0));
        return values.indexOf(style==='best'?Math.max(...values):Math.min(...values));
      },style);
      await page.locator('#modalOpts .opt').nth(choice).click();
    }
    await page.getByRole('button',{name:'继续人生',exact:true}).waitFor();
    const result=await page.evaluate(()=>TL.S.orgInterviewResult.status);
    await page.screenshot({path:path.join(os.tmpdir(),'terra-interview-result-'+style+'.png')});
    await page.getByRole('button',{name:'继续人生',exact:true}).click();
    return result;
  }
  await page.evaluate(()=>{
    const T=window.TL, S=T.newLife({seed:930101,nation:'CLB',race:'liberi',bornYear:1064});
    Object.assign(S,{age:30,year:1094,school:null,job:'scholar',eduLevel:4,arts:90,serveLeft:0,q:4,
      queue:[],pending:null,speed:0,paused:true,st:{hl:90,h:70,sm:90,so:90}});
    S.orgApplication={organization:'rhine_life',route:'research'};
    T.openDecision(S,'organization_offer');
  });
  await page.getByRole('button',{name:'接受招募考核',exact:false}).click();
  await page.waitForFunction(()=>TL.S.pending?.id==='organization_interview');
  assert.equal(await page.evaluate(()=>TL.S.affiliation),null);
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'interview viewport overflow');
    assert.ok(await page.locator('#modalBox').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'interview dialog overflow');
  }
  await page.screenshot({path:path.join(os.tmpdir(),'terra-interview-mobile.png')});
  assert.equal(await answerInterview(),'passed');
  assert.equal(await page.evaluate(()=>TL.S.affiliation),'rhine_life');
  await page.setViewportSize({width:1440,height:1000});
  assert.ok((await page.locator('#game').innerText()).includes('科学研究'));
  await page.evaluate(()=>{const S=TL.S;S.orgService=10;S.year=1095;TL.promoteOrganization(S);TL.renderAll(S,true);});
  assert.equal(await page.evaluate(()=>TL.S.orgRank),1);
  const screenshots=[];
  async function capture(name) {
    const file=path.join(os.tmpdir(),'terra-org-ui-'+name+'.png');
    await page.screenshot({path:file,fullPage:true});screenshots.push(file);
  }
  await capture('desktop');
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>TL.renderAll(TL.S,true));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'no overflow '+width);
  }
  await capture('mobile');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{
    const S=TL.newLife({seed:930103,nation:'CLB',race:'liberi',bornYear:1064});
    Object.assign(S,{age:30,year:1094,school:null,job:'scholar',eduLevel:4,arts:90,serveLeft:0,q:4,
      queue:[],pending:null,speed:0,paused:true,st:{hl:90,h:70,sm:90,so:90}});
    TL.tryJoinOrganization(S,'rhine_life','research');
  });
  assert.equal(await answerInterview('worst'),'rejected');
  assert.equal(await page.evaluate(()=>TL.S.job),'scholar');
  await page.evaluate(()=>{TL.S.year+=3;TL.S.age+=3;TL.tryJoinOrganization(TL.S,'rhine_life','research');});
  await page.getByRole('button',{name:'撤回本次申请',exact:false}).click();
  await page.getByRole('button',{name:'继续人生',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>TL.S.orgInterviewResult.status),'withdrawn');
  await page.getByRole('button',{name:'继续人生',exact:true}).click();
  await page.evaluate(()=>{
    const S=TL.newLife({seed:930104,nation:'URS',race:'liberi',bornYear:1070});
    Object.assign(S,{age:25,year:1095,school:null,job:'factory',eduLevel:3,arts:50,serveLeft:0,
      queue:[],pending:null,speed:0,paused:true,q:1,st:{hl:90,h:0,sm:90,so:90}});
    TL.infect(S,true);S.ori.known=true;S.ori.treated=false;
    TL.fire(S,{type:'ev',id:'reunion_recruit'});TL.openDecision(S,'reunion_invite');
  });
  await page.getByRole('button',{name:'商量同行与分工',exact:false}).click();
  assert.match(await page.locator('#modalBox').innerText(),/营地接纳/);
  assert.equal(await answerInterview(),'passed');
  assert.equal(await page.evaluate(()=>TL.S.income),0);
  assert.match(await page.locator('#game').innerText(),/无固定工资/);
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'camp supplies no overflow');
  await capture('reunion');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{
    const S=TL.newLife({seed:930102,nation:'SIR',race:'lupo',bornYear:1068});
    Object.assign(S,{age:30,year:1098,school:null,job:'guard',eduLevel:4,arts:90,serveLeft:0,q:4,
      queue:[],pending:null,speed:0,paused:true,st:{hl:90,h:70,sm:90,so:90}});
    S.flags.sirFamilyIntroducedYear=S.year;
    if(!TL.joinOrganization(S,'sir_family','executor')) throw Error('family fixture');
    S.year=1099;S.age++;TL.scheduleEvents(S);
    TL.fire(S,S.queue.find(e=>e.id==='organization_transition'));S.queue=[];
  });
  await page.getByRole('button',{name:'转入新沃尔西尼市政',exact:false}).click();
  assert.equal(await page.evaluate(()=>TL.S.affiliation),'sir_family');
  assert.equal(await answerInterview(),'passed');
  assert.equal(await page.evaluate(()=>TL.S.affiliation),'sir_newcourt');
  // The next-question hook must survive a real button click and re-render.
  await page.evaluate(()=>{
    TL.defDecision('test_question_1',{title:'接口测试一',options:[{label:'下一题'}]});
    TL.defDecision('test_question_2',{title:'接口测试二',options:[{label:'完成测试'}]});
    TL.testPreviousAfterDecision=TL.afterDecision;
    TL.afterDecision=(S,p,index)=>{TL.testPreviousAfterDecision(S,p,index);if(p.id==='test_question_1') TL.openDecision(S,'test_question_2');};
    TL.openDecision(TL.S,'test_question_1');
  });
  await page.getByRole('button',{name:'下一题',exact:true}).click();
  await page.getByRole('button',{name:'完成测试',exact:true}).click();
  await page.evaluate(()=>{
    TL.afterDecision=TL.testPreviousAfterDecision;
    const S=TL.S;S.orgRank=1;TL.organizationContact(S,'sir_newcourt','vigil');
    TL.leaveOrganization(S,'主动离职');TL.die(S,'dem','test');
  });
  await page.locator('#report').waitFor({state:'visible'});
  const report=await page.locator('#rGrid').innerText();
  for(const text of ['组织履历','叙拉古家族','新沃尔西尼市政','伺夜','面试记录','录用']) assert.ok(report.includes(text),text);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'report no overflow');
  await capture('report');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['four-question interview','rejection/retry/withdrawal','promotion','historical transfer',
    'multi-question hook','career/contact report','camp admission and zero wages','1440/390/320px layout','no page errors'],screenshots}));
} finally {await browser.close();}
