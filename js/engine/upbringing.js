(function (TL) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  TL.ensureUpbringing = function (S) {
    // 兼容旧状态只补容器，不回填随机童年、身份或武器。
    return S.upbringing ||= { version: 1, background: null, history: [], skills: {}, contacts: [], offers: {}, lastYear: null };
  };
  TL.growthSkill = (S, key) => S.upbringing?.skills[key] || 0;
  TL.careLabel = S => ({ nursery: '公共养育所', extended: '家庭与社群共同照护', family: '原生家庭照护', transition: '迁居后的照护衔接', independent: '独立生活' })[S.fam.care?.mode] || '原生家庭照护';
  const person = (S, role, age, sex) => ({
    name: TL.givenName(S.nation, sex, S.race), role, age, sex, alive: true,
    nation: S.nation, race: S.race, job: age < 16 ? 'child' : 'teacher', bloodRelative: false
  });
  TL.initUpbringing = function (S) {
    const u = TL.ensureUpbringing(S);
    S.fam.care = { mode: 'family', birthParentContact: 'regular', placeId: S.residence.placeId,
      institution: null, caregivers: [], peers: [], history: [] };
    S.localStatus = { lateranoCitizen: S.nation === 'LAT' && ['sankta', 'liberi'].includes(S.race) };
    S.equipment = { guardianGun: null, launcher: null };
    const id = TL.placeHas(S, 'nursery') && TL.chance(0.25) ? 'AEG-01' :
      TL.placeHas(S, 'extendedFamily') && TL.chance(0.4) ? 'RMB-01' : null;
    if (id) {
      const bg = TL.GROWTH_BACKGROUNDS[id], care = S.fam.care;
      u.background = id;
      care.mode = id === 'AEG-01' ? 'nursery' : 'extended';
      care.institution = id === 'AEG-01' ? '生活区公共养育所' : '家庭所属社群';
      care.reason = id === 'AEG-01' ? '父母自愿交接抚养安排' : '家人与非血缘社群成员共同照护';
      care.caregivers.push(person(S, id === 'AEG-01' ? '养育者' : '社群长辈', 28 + Math.floor(TL.rnd() * 15), 'F'));
      care.peers.push(person(S, id === 'AEG-01' ? '同所伙伴' : '社群伙伴', 2, 'M'));
      care.history.push({ mode: care.mode, age: 0, year: S.year, placeId: care.placeId, reason: care.reason });
      u.history.push({ id, title: bg.title, age: 0, year: S.year, placeId: care.placeId,
        accepted: true, sourceType: 'adaptation', evidence: bg.evidence.slice() });
      TL.log(S, id === 'AEG-01' ?
        '父母将日常抚养交给了公共养育所。你有养育者和同所伙伴，亲生父母仍保留在你的家庭记录中。' :
        '你在一个大家庭社群中长大，除了亲人，也有非血缘的长辈和伙伴照应。', 'fam', { key: id });
    }
    // 正常海底城的职业渠道，不抽陆地矿奴、贵族与源石矿工。
    if (TL.placeHas(S, 'materialGuarantee')) {
      S.materialProvision = { type: 'public', source: 'user-premise', description: '公共生活保障；职业与声望仍可不同' };
      for (const key of ['mom', 'dad']) S.fam[key].job = TL.pick(['engineer', 'teacher', 'doctor', 'scholar', 'mechanic', 'clerk']);
    }
  };
  TL.guardianGunEligible = S => S.nation === 'LAT' && S.race === 'sankta' &&
    S.localStatus?.lateranoCitizen === true && S.age >= 16 && (S.eduLevel >= 1 || !!S.school) &&
    !S.traits.fallen && !S.flags.fallen;
  TL.growthEligible = function (S, g) {
    const u = TL.ensureUpbringing(S), p = TL.currentPlace(S);
    if (!p || S.nation !== g.nation || S.age < g.ages[0] || S.age > g.ages[1] ||
        (g.fromYear != null && S.year < g.fromYear) || (g.untilYear != null && S.year > g.untilYear)) return false;
    if (g.tags && !g.tags.every(t => p.tags.includes(t))) return false;
    if (g.placeIds && !g.placeIds.includes(p.id)) return false;
    if (g.regimes && !g.regimes.includes(p.regime)) return false;
    if (g.races && !g.races.includes(S.race)) return false;
    if (g.needsSchool && !S.school) return false;
    if (g.urban && !S.urban) return false;
    if (g.uninfected && S.ori) return false;
    if (g.requiresFlag && !u[g.requiresFlag]) return false;
    if (g.requiresBackground && u.background !== g.requiresBackground) return false;
    if (g.familyJobs && !['mom','dad'].some(k => S.fam[k]?.alive && g.familyJobs.includes(S.fam[k].job))) return false;
    if (g.needsTension && !(TL.tlMods(S.nation, S.year).war > 0 || S.flags.localTensionUntil >= S.year)) return false;
    if (g.id === 'LAT-02' && !TL.guardianGunEligible(S)) return false;
    return true;
  };
  function record(S, g, o, accepted) {
    const u = TL.ensureUpbringing(S);
    for (const [key, value] of Object.entries(o.skills || {})) u.skills[key] = TL.clamp((u.skills[key] || 0) + value, 0, 100);
    if (o.contact && !u.contacts.some(c => c.role === o.contact && c.placeId === S.residence.placeId)) {
      u.contacts.push({ role: o.contact, nation: S.nation, placeId: S.residence.placeId, metAt: S.age });
    }
    if (o.flag) u[o.flag] = true;
    let result = g.result;
    if (g.id === 'LAT-01' && accepted) {
      const score = Math.round(TL.clamp(25 + TL.growthSkill(S, 'shooting') * 2 + S.st.sm * 0.25 + S.artsProfile.control * 0.2, 0, 100));
      u.shootingScore = score;
      result = `这次考核得分 ${score}。成绩记录与守护铳资格分别办理。`;
    }
    if (o.action === 'guardianGun' || o.action === 'guardianDeferred') {
      if (!TL.guardianGunEligible(S)) return '资格发生变化，手续暂未完成。';
      S.equipment ||= {};
      S.equipment.guardianGun = { eligible: true, owner: S.fullName,
        custodian: o.action === 'guardianGun' ? S.fullName : '工坊（尚未领取）',
        received: o.action === 'guardianGun', operable: o.action === 'guardianGun', source: 'LAT-02', year: S.year };
      result = o.action === 'guardianGun' ? '你办理了自己的守护铳，记下维护和保管要求。' : '资格已登记，领取暂缓；这不会抹去你的训练经历。';
    }
    if (o.action === 'launcherTraining') {
      S.equipment ||= {};
      S.equipment.launcher = { type: 'grenadeLauncher', access: 'supervised-training', owned: false, source: 'LAT-03' };
      result = '你获得了受指导使用训练器材的渠道；这不赋予守护铳资格，也不等于获赠一件武器。';
    }
    if (o.action === 'schoolInterruption') {
      S.flags.schoolInterruptedUntil = S.age + 1;
      result = '这学年改为在住处自学，原有学籍与课程进度保留。';
    }
    u.history.push({ id: g.id, title: g.title, age: S.age, year: S.year, placeId: S.residence.placeId,
      choice: o.label, accepted, skills: Object.assign({}, o.skills), evidence: g.evidence.slice(), sourceType: g.sourceType });
    if (accepted) TL.eff(S, { h: 1, so: o.contact ? 1 : 0 });
    return accepted ? result : '你把这段时间留给了其他事情。';
  }
  for (const g of TL.GROWTH) {
    const options = g.options.map(o => ({ label: o.label,
      hint: Object.keys(o.skills).map(k => TL.GROWTH_SKILLS[k]).join('、') || '登记手续',
      run: S => record(S, g, o, true) }));
    if (!g.institutional) options.push({ label: '这次先不参加', hint: '保留自己的安排', run: S => record(S, g, { label: '这次先不参加' }, false) });
    TL.defDecision('growth_' + g.id, { once: true, growth: true, title: g.title, text: g.text,
      when: S => TL.growthEligible(S, g), options, fromYear: g.fromYear, untilYear: g.untilYear });
  }
  TL.scheduledGrowthDecisions = function (S) {
    TL.syncResidence(S);
    const u = TL.ensureUpbringing(S);
    if (u.lastYear === S.year) return [];
    const ordinaryCount = Object.keys(u.offers).filter(id => id !== 'LAT-02').length;
    const candidates = TL.GROWTH.filter(g => !u.offers[g.id] && S.flags['dec_growth_' + g.id] == null &&
      (g.institutional || ordinaryCount < 4) && TL.growthEligible(S, g));
    let g = candidates.find(x => x.institutional);
    if (!g) {
      // 一年最多一条；先抽是否有机会，再随机选取，避免数组顺序垄断。
      const chance = candidates.length ? Math.max(...candidates.map(x => x.chance)) : 0;
      if (!TL.chance(chance)) return [];
      g = TL.pick(candidates);
    }
    if (!g) return [];
    u.offers[g.id] = { age: S.age, year: S.year, placeId: S.residence.placeId };
    u.lastYear = S.year;
    return [{ id: 'growth_' + g.id, at: 0.62, p: { placeId: S.residence.placeId, revision: S.residence.revision } }];
  };
  TL.localContentAvailable = function (S, item) {
    const id = item.id;
    const p = TL.currentPlace(S);
    if (S.fam.care?.mode === 'nursery' && ['parent_fight','sibling_born'].includes(id)) return false;
    if (id === 'sibling_born' && (!S.fam.mom?.alive || S.fam.mom.age > 46 || !S.fam.dad?.alive)) return false;
    if (p?.kind === 'marine' || p?.kind === 'subterranean') {
      if (['cat_city','cat_migrate','cat_wild','cat_wild_mega','cat_warning','catastrophe_warn'].includes(id)) return false;
    }
    if (TL.placeHas(S, 'materialGuarantee')) {
      if (['child_work','school_fee','parent_fight','buy_home','wage_theft'].includes(id)) return false;
    }
    if (S.nation === 'BLV' && ['conscription','war_draft'].includes(id) && p?.regime !== 'singas') return false;
    if (id === 'war_end' && S.flags.serviceMinimumUntil > S.age) return false;
    return true;
  };
  // 按当前生活环境适配旧内容；不修改与地点无关的事件池结构。
  const oldSchool = TL.DECISIONS.first_school;
  const schoolText = oldSchool.text, schoolOptions = oldSchool.options;
  oldSchool.text = S => TL.placeHas(S, 'materialGuarantee') ? '生活区安排了入学。照护者和老师与你讨论怎样开始学习。' : schoolText(S);
  oldSchool.options = S => TL.placeHas(S, 'materialGuarantee') ? [
    { label: '参加集体课程', eff: { sm: 4, so: 2 }, run(S) { S.flags.noSchool = false; return '你按安排入学，基础教育由公共服务提供。'; } },
    { label: '和老师商量自己的兴趣项目', eff: { sm: 3, h: 2 }, run(S) { S.flags.noSchool = false; TL.ensureUpbringing(S).skills.creation = 2; return '你仍然参加基础课程，也为自己的兴趣留下时间。'; } }
  ] : schoolOptions;
  const kind = TL.EVMAP.parent_kind;
  kind.run = S => {
    TL.eff(S, { h: 8, so: 6 });
    const caregiver = S.fam.care?.caregivers.find(c => c.alive && !c.remote);
    if (S.fam.care?.mode === 'nursery' && caregiver) return `${caregiver.name}今天特意留了些时间，听你讲完自己的发现。`;
    const parent = S.fam.dad?.alive ? S.fam.dad : S.fam.mom?.alive ? S.fam.mom : caregiver;
    return parent ? `${parent.name}今天带来了一小块糖，安静地听你讲了一会儿。` : '一位熟悉的邻居听你说了很久，还带来了一小块糖。';
  };
  const sick = TL.EVMAP.child_sick, oldSick = sick.run;
  sick.run = S => {
    if (!TL.placeHas(S, 'materialGuarantee')) return oldSick(S);
    S.flags.hadChildSick = S.age;
    TL.eff(S, { hl: -6, h: -4 });
    return '你发起高烧，照护者联系了医疗服务。治疗和观察持续了几天，身体慢慢恢复。';
  };
  // 现有照护路线接入成长关系，不能把厂区自治写成必然存在的工会制度。
  TL.DECISIONS.ori_care_route.text = S => S.upbringing?.background === 'RMB-01' ?
    '一起长大的社群长辈和家人来商量照护安排。互助有容量限制，必要时仍需集中医疗监测。' :
    '家里和厂区的熟人来商量照护安排。确诊之后，需要考虑病情、家庭承受能力与医疗资源。';
  TL.DECISIONS.ori_care_route.options[0].hint = '家庭与邻里互助；需要有人照应';
  TL.DECISIONS.ori_care_route.options[0].require = S => !!(S.fam.mom?.alive || S.fam.dad?.alive ||
    S.fam.partner?.alive || S.fam.care?.caregivers.some(c => c.alive && !c.remote));

  // 辛嘉斯的最低服役年限与联合政府的职业招募分开。年龄窗口为游戏安排。
  const conscription = TL.DECISIONS.conscription, originalConscriptionText = conscription.text;
  conscription.text = S => TL.currentPlace(S)?.regime === 'singas' ?
    '辛嘉斯控制区要求不论性别履行至少三年的兵役。征召通知到了，家人与你商量如何应对。' : originalConscriptionText(S);
  for (const o of conscription.options) {
    const run = o.run;
    o.run = S => {
      const result = run(S);
      if (TL.currentPlace(S)?.regime === 'singas' && S.serveLeft > 0) {
        S.serveLeft = Math.max(3, S.serveLeft);
        S.flags.serviceMinimumUntil = S.age + 3;
      }
      return result;
    };
  }
  const draft = TL.EVMAP.war_draft, draftRun = draft.run;
  draft.run = S => {
    const result = draftRun(S);
    if (TL.currentPlace(S)?.regime === 'singas') {
      S.serveLeft = Math.max(3, S.serveLeft); S.flags.serviceMinimumUntil = S.age + 3;
    }
    return result;
  };
  const riot = TL.EVMAP.riot, riotRun = riot.run;
  riot.run = S => {
    const result = riotRun(S);
    if (S.nation === 'BLV' && TL.currentPlace(S)?.regime !== 'dossoles') S.flags.localTensionUntil = S.year + 2;
    return result;
  };
  TL.defDecision('blv_professional_army', {
    once: true, title: '职业军人的招募',
    when: S => S.age >= 20 && TL.currentPlace(S)?.regime === 'coalition' && !S.serveLeft,
    text: '联合政府控制区有人招募职业军人。这是一份带风险的雇用合同，你可以考虑，也可以继续平民生活。',
    options: [
      { label: '申请这份工作', run(S) { S.flags.lastJob = S.job; S.job = 'soldier'; S.serveLeft = 3; return '你签下了三年的雇用合同。合同期限是本次工作的约定。'; } },
      { label: '继续原来的生活', run() { return '你没有报名。'; } }
    ]
  });
  TL.growthJobWeight = function (S, id) {
    const map = { engineer: ['engineering'], mechanic: ['maintenance','engineering'], smith: ['maintenance'],
      artsmith: ['maintenance','creation'], guard: ['shooting','launcher','teamwork'], soldier: ['shooting','launcher'],
      farm: ['agriculture','botany'], agbiz: ['agriculture','commerce'], vendor: ['commerce','oral'],
      courier: ['travel','oral'], performer: ['expression'], teacher: ['literacy','expression'] };
    return 1 + Math.min(0.3, (map[id] || []).reduce((sum, key) => sum + TL.growthSkill(S, key), 0) / 100);
  };

  TL.EVMAP.aeg_equipment_fault = {
    id: 'aeg_equipment_fault', title: '生活区的设备警报', book: '生活', max: 2, cd: 12,
    when: S => S.age >= 10 && TL.placeHas(S, 'emergencyTerminal'),
    run(S) {
      const practiced = TL.growthSkill(S, 'emergency') >= 5;
      TL.eff(S, { hl: practiced ? -1 : -4, h: practiced ? -2 : -4 });
      return practiced ? '设备警报响起。你按练习过的流程使用终端，领取防护设备并沿指定路线撤离。' :
        '设备警报响起。你花了一些时间寻找公共终端，在工作人员引导下离开了故障区域。';
    }
  };

  TL.growthYear = function (S) {
    const u = TL.ensureUpbringing(S), care = S.fam.care;
    if (S.serveLeft > 0) {
      S.serveLeft--;
      if (S.serveLeft === 0) {
        S.job = S.flags.lastJob || 'seeking';
        TL.log(S, '这段服役或雇用期限结束了，你开始安排接下来的生活。', 'mil', { key: 'service_complete' });
      }
    }
    if (care) {
      for (const c of [...care.caregivers, ...care.peers]) {
        if (!c.alive) continue;
        c.age++;
        if (c.age === 7 || c.age === 16 || c.age === 67) c.job = TL.ageJob(c.nation, c.sex, c.age, c.race);
        const lt = TL.lifeTable(TL.NATION_BY_ID[c.nation], c.sex, c.race);
        if (TL.chance(c.age >= lt.maxAge ? 1 : lt.q[c.age])) { c.alive = false; c.diedAt = S.age; }
      }
      if (S.age >= 18 && care.mode !== 'independent') {
        care.history.push({ mode: care.mode, endedAt: S.age, placeId: care.placeId });
        care.mode = 'independent';
      }
    }
    // 继续投入对应活动才能进步；读书不能自动练熟榴弹发射器。
    const trainingFocus = { engineering: 'craft', maintenance: 'craft', creation: 'hobby', botany: 'hobby',
      expression: 'hobby', literacy: 'study', oral: 'family', teamwork: 'play',
      athletics: 'sport', protection: 'protection', travel: 'learn', agriculture: 'work', commerce: 'work',
      localKnowledge: 'learn', emergency: 'protection', shooting: 'train', launcher: 'train' };
    if (S.age >= 7 && S.age <= 18) {
      for (const key of Object.keys(u.skills)) {
        if (['shooting', 'launcher'].includes(key) && !TL.placeHas(S, 'shootingSchool')) continue;
        const share = S.focusW?.[trainingFocus[key]] || 0;
        u.skills[key] = Math.min(100, u.skills[key] + share * 0.8);
      }
    }
  };
  TL.upbringingReport = S => clone({ birthNation: S.birthNation || null, birthPlace: S.birthPlace || null,
    residence: S.residence || null, growth: S.upbringing || null, care: S.fam.care || null,
    equipment: S.equipment || null });
})(window.TL = window.TL || {});
