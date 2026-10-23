/* 纯数据题库校验、会话与抉择桥接。回答累计只影响录用，不改变生存属性。 */
(function (TL) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const key = /^[a-z][a-z0-9_]*$/;
  const questions = Object.create(null), pools = Object.create(null), packs = Object.create(null);
  const packSources = Object.create(null), poolPack = Object.create(null);
  TL.INTERVIEW_QUESTIONS = questions; TL.INTERVIEW_POOLS = pools; TL.INTERVIEW_PACKS = packs;
  // Registry of the registered pack objects, for content locks and diagnostics.
  TL.INTERVIEW_PACK_SOURCES = packSources;
  function assert(ok, message) { if (!ok) throw new Error('Interview format: ' + message); }
  function fields(o, allowed, at) {
    assert(o && typeof o === 'object' && !Array.isArray(o), at + ' must be an object');
    for (const k of Object.keys(o)) assert(allowed.includes(k), at + ': unknown field ' + k);
  }
  function id(value, at) { assert(typeof value === 'string' && key.test(value), at + ': invalid id'); }
  function text(value, max, at) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, at + ': invalid text'); }
  function number(value, lo, hi, at) { assert(Number.isFinite(value) && value >= lo && value <= hi, at + ': invalid number'); }
  TL.validateInterviewPack = function (pack) {
    fields(pack,['id','schemaVersion','version','sourceType','questions','pools','extensions'],'pack');
    id(pack.id,'pack.id'); assert(!own(packs,pack.id),'duplicate pack ' + pack.id);
    assert(pack.schemaVersion === 1,'unsupported schemaVersion');
    assert(Number.isInteger(pack.version) && pack.version >= 1,'version must be positive integer');
    assert(pack.sourceType === 'project-rule','question text must declare project-rule');
    assert(Array.isArray(pack.questions) && Array.isArray(pack.pools),'questions/pools must be arrays');
    const nextQ = Object.assign(Object.create(null),questions), nextP = Object.assign(Object.create(null),pools);
    for (const q of pack.questions) {
      fields(q,['id','organization','route','kind','prompt','options','fromYear','untilYear'], 'question');
      id(q.id,'question.id'); assert(!own(nextQ,q.id),'duplicate question ' + q.id);
      assert(TL.organizationDef(q.organization),'unknown organization ' + q.organization);
      assert(['organization','role'].includes(q.kind),'invalid question kind');
      if(q.kind === 'role') assert(TL.organizationRouteDef(q.organization,q.route),'unknown role route');
      else assert(q.route == null,'organization question cannot specify route');
      for(const bound of ['fromYear','untilYear']) if(q[bound] != null) assert(Number.isInteger(q[bound]),'year must be integer');
      assert(q.fromYear == null || q.untilYear == null || q.fromYear <= q.untilYear,'reversed year window');
      text(q.prompt,500,'question.prompt');
      assert(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4,'2-4 answer options required');
      const seen = new Set();
      for(const o of q.options) {
        fields(o,['id','label','scores'],'option'); id(o.id,'option.id');
        assert(!seen.has(o.id),'duplicate option'); seen.add(o.id); text(o.label,140,'option.label');
        fields(o.scores,Object.keys(TL.INTERVIEW_AXES),'option.scores');
        assert(Object.keys(o.scores).length > 0,'empty scores');
        for(const value of Object.values(o.scores)) {
          number(value,0,3,'score'); assert(Number.isInteger(value),'scores must be integers');
        }
      }
      nextQ[q.id]=q;
    }
    for(const p of pack.pools) {
      fields(p,['id','organization','route','axes','questionIds','draw','passScore','waitlistScore'],'pool');
      id(p.id,'pool.id'); assert(!own(nextP,p.id),'duplicate pool ' + p.id);
      const r=TL.organizationRouteDef(p.organization,p.route);
      assert(r && r.interview.questionPool === p.id,'route does not reference pool ' + p.id);
      assert(Array.isArray(p.axes) && p.axes.length === 3,'exactly three axes required');
      const axes=new Set();
      for(const axis of p.axes) {
        fields(axis,['id','weight','minimum'],'axis');
        assert(own(TL.INTERVIEW_AXES,axis.id) && !axes.has(axis.id),'unknown/duplicate axis'); axes.add(axis.id);
        number(axis.weight,0.01,1,'axis weight'); number(axis.minimum,0,100,'axis minimum');
      }
      assert(Math.abs(p.axes.reduce((s,a)=>s+a.weight,0)-1)<1e-8,'weights must sum to 1');
      assert(r.interview.axes.length === 3 && r.interview.axes.every(a=>axes.has(a)),'route/pool axes differ');
      fields(p.draw,['organization','role'],'draw');
      assert(Number.isInteger(p.draw.organization) && p.draw.organization >= 2 && p.draw.organization <= 5 && p.draw.role === 1,'draw requires 2-5 organization + 1 role');
      number(p.passScore,1,100,'pass score'); number(p.waitlistScore,0,p.passScore-1,'waitlist score');
      nextP[p.id]=p;
    }
    assert(pack.extensions == null || Array.isArray(pack.extensions),'extensions must be array');
    const edited=new Set();
    for(const ext of pack.extensions || []) {
      fields(ext,['pool','questionIds'],'extension');
      assert(own(pools,ext.pool) && !edited.has(ext.pool),'extension needs existing pool, once per pack'); edited.add(ext.pool);
      assert(Array.isArray(ext.questionIds) && ext.questionIds.length > 0,'empty extension');
      nextP[ext.pool]=Object.assign({},nextP[ext.pool],{questionIds:nextP[ext.pool].questionIds.concat(ext.questionIds)});
    }
    for(const p of Object.values(nextP)) {
      assert(Array.isArray(p.questionIds) && new Set(p.questionIds).size === p.questionIds.length,'duplicate question refs');
      const counts={organization:0,role:0};
      for(const qid of p.questionIds) {
        const q=nextQ[qid]; assert(q,'missing question ' + qid);
        assert(q.organization === p.organization && (q.kind !== 'role' || q.route === p.route),'cross-organization/route question');
        counts[q.kind]++;
        for(const o of q.options) assert(Object.keys(o.scores).length === p.axes.length &&
          p.axes.every(a=>own(o.scores,a.id)),'score axes must exactly match pool');
        for(const a of p.axes) assert(q.options.some(o=>o.scores[a.id]>0),'unscorable axis ' + a.id);
      }
      assert(counts.organization >= p.draw.organization && counts.role >= p.draw.role,'insufficient question bank');
    }
    for(const q of pack.questions) assert(Object.values(nextP).some(p=>p.questionIds.includes(q.id)),'unreferenced question ' + q.id);
    return {questions:nextQ,pools:nextP};
  };
  TL.registerInterviewPack = function(pack) {
    // Validate everything before mutating the registry; sessions use separate snapshots.
    const checked=TL.validateInterviewPack(pack);
    Object.assign(questions,clone(checked.questions)); Object.assign(pools,clone(checked.pools));
    packs[pack.id]={version:pack.version,questionCount:pack.questions.length,poolCount:pack.pools.length};
    // Keep the source pack so a save can record what the content actually was,
    // and remember which pack each pool came from so a session can name it.
    packSources[pack.id]=pack;
    // A pool belongs to the pack that *declares* it. An extension pack only adds
    // questions to an existing pool, so ownership (and the session's provenance)
    // stays with the declaring pack; the save's content lock still lists every
    // pack in play.
    for(const pool of pack.pools || []) if(!poolPack[pool.id]) poolPack[pool.id]=pack.id;
  };
  TL.registerInterviewPack(TL.CORE_INTERVIEW_PACK);

  /** Which pack a pool belongs to; null for pools registered outside a pack. */
  TL.interviewPoolPack = poolId => (poolPack[poolId] ? {id:poolPack[poolId], version:packs[poolPack[poolId]].version} : null);

  /* 洗牌（Fisher–Yates）与选取规则已迁入 src/model/interview-deck.ts。 */
  function record(S,a,result) {
    const report=Object.assign({token:a.token,organization:a.organization,route:a.route,year:a.year,
      pool:a.spec ? a.spec.questionPool : null,answers:clone(a.session ? a.session.answers : [])},result);
    S.orgInterviewHistory=S.orgInterviewHistory || [];
    S.orgInterviewHistory.push(clone(report));
    S.orgInterviewResult=report;
    const label={passed:TL.organizationDef(a.organization).admission ? '接纳' : '录用',waitlisted:'暂缓',rejected:'未通过',withdrawn:'撤回',ineligible:'资格变化',unavailable:'暂缓面谈'}[report.status];
    TL.log(S,TL.organizationName(a.organization)+TL.organizationAdmissionName(a.organization)+'结果：'+label+'。'+(report.reason || ''),'org',
      {key:'org_interview_result',result:clone(report)});
    return report;
  }
  TL.finishOrganizationInterview = function(S,withdrawn) {
    const a=S.orgApplication;
    if(!a || !a.session) return false;
    const eligibility=TL.organizationApplicationEligibility(S,a);
    let result;
    if(!eligibility.ok) {
      result={status:'ineligible',reason:eligibility.reason};
      S.orgApplication=null;
    } else {
      result=withdrawn ? {status:'withdrawn',reason:'你撤回了申请，三年后可再次申请。'} : TL.evaluateOrganizationInterview(a);
      if(result.status === 'incomplete') return false;
      const joined=TL.completeOrganizationInterview(S,{token:a.token,status:result.status});
      if(result.status === 'passed' && !joined) result={status:'ineligible',reason:'加入前的资格复核未通过。'};
      if(result.status === 'passed') result.reason=TL.organizationDef(a.organization).admission ?
        '双方确认了分工与立场，你已加入。' : '回答满足岗位要求，你已正式加入。';
      if(result.status === 'waitlisted') result.reason='对方仍有顾虑；一年后可重新联系，不会自动加入。';
      if(result.status === 'rejected') result.reason='这次未能达成一致，三年后可重新联系。';
    }
    record(S,a,result); return true;
  };
  TL.answerOrganizationInterview = function(S,token,questionId,optionId) {
    const a=S.orgApplication, session=a && a.session;
    if(!session || a.token !== token || S.phase !== 'life') return false;
    const q=session.questions[session.answers.length];
    if(!q || q.id !== questionId || !q.options.some(o=>o.id === optionId)) return false;
    if(!TL.organizationApplicationEligibility(S,a).ok) {
      TL.finishOrganizationInterview(S); return false;
    }
    session.answers.push({question:q.id,option:optionId});
    return true;
  };
  function current(S) {
    const a=S.orgApplication; return a && a.session && a.session.questions[a.session.answers.length];
  }
  TL.defDecision('organization_interview', {
    title:S=>TL.organizationName(S.orgApplication.organization)+' · '+TL.organizationAdmissionName(S.orgApplication.organization)+' '+
      (S.orgApplication.session.answers.length+1)+' / '+S.orgApplication.session.questions.length,
    when:S=>!!current(S),
    text:S=>{
      const a=S.orgApplication, p=a.session.pool;
      return TL.organizationRouteName(a.organization,a.route)+'\n关注：'+p.axes.map(x=>TL.INTERVIEW_AXES[x.id]).join('、')+
        '。综合需达到 '+p.passScore+'，各项需达到 '+p.axes.map(x=>x.minimum).join('/')+'。\n\n'+current(S).prompt;
    },
    options:S=>{
      const a=S.orgApplication, q=current(S), token=a.token;
      return q.options.map(o=>({label:o.label,hidden:true,run(state){
        return TL.answerOrganizationInterview(state,token,q.id,o.id) ? '回答已记录。' : '这份回答已失效。';
      }})).concat({label:'撤回本次申请',hint:'保留原职业，三年后可再次申请',autoExclude:true,run(state){
        if(state.orgApplication?.token === token) TL.finishOrganizationInterview(state,true);
        return '你结束了本次面谈。';
      }});
    }
  });
  TL.defDecision('organization_interview_result', {
    title:S=>TL.organizationAdmissionName(S.orgInterviewResult.organization)+'结果', when:S=>!!S.orgInterviewResult,
    text:S=>{
      const r=S.orgInterviewResult;
      const detail=r.axes ? '\n综合匹配：'+r.score.toFixed(1)+' / 100（接纳要求 '+r.passScore+'）\n'+r.axes.map(a=>
        a.label+'：'+a.value.toFixed(1)+' / 100（要求 '+a.minimum+'）').join('\n') : '';
      return TL.organizationName(r.organization)+' · '+TL.organizationRouteName(r.organization,r.route)+'\n'+r.reason+detail;
    },
    options:[{label:'继续人生',run(S){S.orgInterviewResult=null;return '你记下了这次面谈的结果。';}}]
  });
  TL.continueOrganizationInterview = function(S) {
    if(S.phase !== 'life' || S.pending) return;
    const a=S.orgApplication;
    if(a && a.session) {
      if(!TL.organizationApplicationEligibility(S,a).ok ||
          a.session.answers.length === a.session.questions.length) TL.finishOrganizationInterview(S);
      else {TL.openDecision(S,'organization_interview'); return;}
    }
    if(S.orgInterviewResult) TL.openDecision(S,'organization_interview_result');
    else if(S.orgTransition && S.orgTransition.dissolved) TL.openDecision(S,'organization_transition');
  };
  TL.defaultOrganizationInterviewAdapter = function(S,a) {
    const pool=a.spec && pools[a.spec.questionPool];
    const available=pool ? pool.questionIds.map(id=>questions[id]).filter(q=>TL.interviewQuestionAvailable(S,q)) : [];
    // 选取与「题库不足则取消面谈」的规则在 src/model/interview-deck.ts。
    const selection = pool ? TL.selectInterviewQuestions(available, pool.draw) : {ok:false, kind:'organization'};
    if(!pool || !selection.ok) {
      S.orgApplication=null;
      record(S,a,{status:'unavailable',reason:'当前无法安排面谈，申请暂缓，原有工作不受影响。'});
      TL.continueOrganizationInterview(S); return {status:'unavailable'};
    }
    // 选项顺序也要打乱：每道题用自己的 n-1 次抽取。
    const questions_ = TL.prepareSessionQuestions(selection.selected);
    a.session={version:1,pack:TL.interviewPoolPack(pool && pool.id),pool:clone(pool),questions:questions_,answers:[]};
    TL.continueOrganizationInterview(S);
    return {status:'interview',token:a.token};
  };
  TL.setOrganizationInterviewAdapter(TL.defaultOrganizationInterviewAdapter);
  const previous=TL.afterDecision;
  TL.afterDecision=function(S,p,index) {
    if(previous) previous(S,p,index);
    TL.continueOrganizationInterview(S);
  };
})(window.TL = window.TL || {});
