/* 组织生命周期；不依赖抉择 UI。所有概率、服务等级和招募门槛均为游戏规则。 */
(function (TL) {
  'use strict';
  const activeHistory = S => (S.orgHistory || []).find(h => h.leftYear == null);
  function init(S) {
    S.orgHistory = S.orgHistory || [];
    S.orgContacts = S.orgContacts || {};
    S.orgCooldowns = S.orgCooldowns || {};
  }
  TL.organizationState = function (S, id) {
    const o = TL.organizationDef(id), year = S.year;
    const status = !o || !Number.isFinite(year) ? 'unknown'
      : year < o.fromYear ? 'not_yet'
      : o.untilYear != null && year > o.untilYear ? 'dissolved'
      : o.recruitUntil != null && year > o.recruitUntil ? 'reorganized' : 'active';
    return { id, status, available: status === 'active' || status === 'reorganized',
      recruitment: status === 'active' };
  };
  TL.organizationAvailable = (S, id) => TL.organizationState(S, id).available &&
    (!TL.organizationDef(id).locationAllowed || TL.organizationDef(id).locationAllowed(S));
  TL.organizationEmploymentModel = function (id) {
    const o = TL.organizationDef(id);
    const models = TL.EMPLOYMENT_MODELS || {};
    return models[o && o.employmentModel] || models.contract || null;
  };
  TL.organizationBlocksEvent = function (S, eventId) {
    if (!S || S.phase !== 'life' || !S.affiliation || S.job !== S.orgJob || !TL.isWorking(S) ||
        !TL.organizationAvailable(S, S.affiliation)) return false;
    const model = TL.organizationEmploymentModel(S.affiliation);
    return !!(model && (model.protectedEvents || []).includes(eventId));
  };
  TL.organizationAdmissionName = id => (TL.organizationDef(id) || {}).admission || '面试';
  TL.reunionContactCurrent = S => Number.isFinite(S.flags.reunionContactYear) &&
    S.year >= S.flags.reunionContactYear && S.year - S.flags.reunionContactYear <= 2;
  TL.reunionCanContact = S => S.phase === 'life' && S.nation === 'URS' &&
    TL.organizationState(S, 'reunion').recruitment && S.age >= 15 && S.age < 65 &&
    !S.affiliation && !S.school && !S.flags.retired && !S.serveLeft &&
    !['slave', 'prison', 'retired'].includes(S.job) &&
    !!(S.ori && S.ori.stage > 0) && TL.reunionLean(S) > 0.5;
  TL.organizationEligibility = function (S, id, routeId, options) {
    options = options || {};
    const o = TL.organizationDef(id), r = TL.organizationRouteDef(id, routeId);
    const fail = (code, reason) => ({ ok: false, code, reason });
    if (!o || !r) return fail('unknown', '组织或岗位不存在');
    if (S.phase !== 'life') return fail('ended', '人生已经结束');
    if (!TL.organizationState(S, id).recruitment) return fail('closed', '该组织当前不接受新成员');
    if (o.locationAllowed && !o.locationAllowed(S)) return fail('location', '当地不允许该组织活动');
    if (S.school || S.flags.retired || S.age >= 65 || S.serveLeft > 0 ||
        ['slave', 'prison', 'retired'].includes(S.job)) return fail('unavailable', '当前不能参加招募');
    if (S.affiliation && !options.transfer) return fail('affiliated', '需要先结束当前组织合同');
    if ((S.orgCooldowns || {})[id] > S.year) return fail('cooldown', '尚未到再次申请的时间');
    if (o.nations && !o.nations.includes(S.nation) &&
        !(id === 'lungmen_guard' && S.nation === 'YAN' && /龙门/.test(S.city))) return fail('nation', '所在地不符合');
    if (S.age < r.minAge || (r.maxAge != null && S.age > r.maxAge)) return fail('age', '年龄不符合');
    if (r.fromYear != null && S.year < r.fromYear) return fail('route_year', '该部门尚未开放');
    if (S.eduLevel < (r.edu || 0)) return fail('education', '学历不足');
    // 允许待业者申请，但必须满足目标职业本身的学历与技艺门槛。
    if (r.jobs && !r.jobs.includes(S.job)) {
      const j = TL.JOBS[r.entryJob || r.jobs[0]];
      if (S.job !== 'seeking' || !j || S.eduLevel < j.edu || S.arts < j.art * 100)
        return fail('profession', '需要相关职业经验或专业资格');
    }
    if (r.require && !r.require(S)) return fail('requirements', '尚未达到岗位要求');
    if (o.require && !o.require(S)) return fail('organization_requirements', '尚未达到组织要求');
    return { ok: true, organization: id, route: routeId,
      interview: TL.organizationInterviewSpec(id, routeId) };
  };
  TL.canJoinOrganization = (S, id, route) => TL.organizationEligibility(S, id, route).ok;

  TL.joinOrganization = function (S, id, routeId, options) {
    options = options || {};
    init(S);
    // 无 force 旁路：面试结果、剧情转职和调试调用都须重新检查世界状态。
    if (!TL.organizationEligibility(S, id, routeId, options).ok) return false;
    const r = TL.organizationRouteDef(id, routeId);
    const oldJob = S.job;
    if (S.affiliation) TL.leaveOrganization(S, '转入' + TL.organizationName(id), { keepJob: true });
    if (r.entryJob) S.job = r.entryJob;
    else if (r.jobs && !r.jobs.includes(oldJob)) S.job = r.jobs[0];
    if (id === 'rhodes') {
      const classes = TL.OP_CLASSES.filter(c => TL.JOBS['op_' + c.id].art * 100 <= S.arts);
      const previousClass = TL.JOBS[S.job] && TL.JOBS[S.job].cls;
      S.opClass = previousClass || TL.pick(classes).id;
      S.opRank = previousClass ? (S.opRank || 1) : 1;
      S.job = 'op_' + S.opClass;
    }
    S.affiliation = id; S.orgRoute = routeId; S.orgRank = 0;
    S.orgService = 0; S.orgJoinedAt = S.age; S.orgLastServiceYear = S.year;
    S.orgJob = S.job; S.orgTransition = null;
    if (id === 'sir_newcourt') { S.city = '新沃尔西尼'; S.cityName = S.city; }
    if (id === 'rhodes') S.orgRank = S.opRank || 0;
    if (id === 'reunion') {
      S.arts = TL.clamp(S.arts + 8, 0, 100);
      S.flags.reunion = true; S.flags.reunionJoined = S.age;
      S.flags.reunionAt = S.age; delete S.flags.reunionLeft;
    }
    S.flags['org_' + id] = routeId;
    S.flags.lastJob = S.job;
    S.orgHistory.push({ organization: id, route: routeId, joinedAt: S.age,
      joinedYear: S.year, leftAt: null, leftYear: null, ranks: [S.orgRank],
      promotions: [], serviceYears: 0, reason: null });
    TL.log(S, '你加入了' + TL.organizationName(id) + '，负责' + r.name + '。', 'org',
      { key: 'org_join_' + id, organization: id });
    TL.computeIncome(S);
    return true;
  };
  TL.leaveOrganization = function (S, reason, options) {
    options = options || {};
    init(S);
    if (!S.affiliation) return false;
    const id = S.affiliation, h = activeHistory(S);
    if (h) Object.assign(h, { leftAt: S.age, leftYear: S.year, reason: reason || '离职' });
    if ((options.retirement || reason === '退休') && !S.retirementPension) {
      const policy = TL.organizationEmploymentModel(id)?.retirement;
      if (policy && S.orgService >= policy.minServiceYears) {
        const finalMonthlyPay = Math.max(0, Number.isFinite(S.income) ? S.income : 0);
        const nation = TL.NATION_BY_ID[S.nation];
        S.retirementPension = {
          organization: id,
          serviceYears: S.orgService,
          rank: S.orgRank || 0,
          retiredAt: S.age,
          finalMonthlyPay,
          replacementRate: policy.replacementRate,
          minimumMonthlyAmount: nation.ppp * policy.minimumMonthlyRate,
          monthlyAmount: Math.max(finalMonthlyPay * policy.replacementRate,
            nation.ppp * policy.minimumMonthlyRate)
        };
      }
    }
    delete S.flags['org_' + id];
    if (id === 'reunion') { S.flags.reunion = false; S.flags.reunionLeft = S.age; }
    if (id === 'rhodes' && !options.preserveOperatorRank) { S.opClass = null; S.opRank = 0; }
    if (!options.keepJob && S.job === S.orgJob) {
      S.flags.lastJob = S.job; S.job = 'seeking';
    }
    S.orgCooldowns[id] = S.year + 3;
    S.affiliation = null; S.orgRoute = null; S.orgRank = 0; S.orgService = 0;
    S.orgJoinedAt = null; S.orgJob = null; S.orgTransition = null;
    TL.log(S, '你离开了' + TL.organizationName(id) + '：' + (reason || '离职') + '。', 'org',
      { key: 'org_leave_' + id, organization: id });
    TL.computeIncome(S);
    return true;
  };
  TL.syncOrganization = function (S) {
    init(S);
    // 只迁移确实带有旧身份的状态一次；退出后不会被旧旗标重新拉回组织。
    if (S.orgSchema !== 1) {
      S.orgSchema = 1;
      if (!S.affiliation && S.opClass && TL.JOBS[S.job] && TL.JOBS[S.job].cls) {
        TL.joinOrganization(S, 'rhodes', 'operator');
      } else if (!S.affiliation && S.flags.reunion && S.flags.reunionLeft == null) {
        // 旧存档身份只在有效窗口迁移；不能让过期旗标复活旧整合。
        S.flags.reunionContactYear = S.year;
        if (!TL.joinOrganization(S, 'reunion', 'infected')) {
          S.flags.reunion = false; S.flags.reunionLeft = S.age;
        }
      }
    }
    if (!S.affiliation || S.phase !== 'life') return;
    const id = S.affiliation, o = TL.organizationDef(id), r = TL.organizationRouteDef(id, S.orgRoute);
    if (!o || !r) { TL.leaveOrganization(S, '档案失效', { keepJob: true }); return; }
    if (id === 'reunion' && !TL.organizationAvailable(S, id)) {
      TL.leaveOrganization(S, '切城—龙门事件后旧编制瓦解，幸存者离散；九后来重组的整合运动另属一条路线');
      return;
    }
    if (o.locationAllowed && !o.locationAllowed(S)) {
      TL.leaveOrganization(S, '新沃尔西尼禁止家族入驻及介入'); return;
    }
    if (S.flags.retired || S.age >= 65 || !TL.isWorking(S) || S.school || S.serveLeft > 0) {
      const retirement = !!(S.flags.retired || S.age >= 65);
      const reason = retirement ? '退休' : S.serveLeft > 0 ? '应征服役' : '结束任职';
      TL.leaveOrganization(S, reason, {
        keepJob: true, retirement, preserveOperatorRank: retirement
      }); return;
    }
    if (S.job !== S.orgJob && !(r.jobs || []).includes(S.job)) {
      TL.leaveOrganization(S, '转行或应征服役', { keepJob: true }); return;
    }
    if (o.nations && !o.nations.includes(S.nation) &&
        !(id === 'lungmen_guard' && S.nation === 'YAN' && /龙门/.test(S.city))) {
      TL.leaveOrganization(S, '迁往组织辖区以外', { keepJob: false }); return;
    }
    S.orgJob = S.job;
    if (id === 'rhodes') S.orgRank = S.opRank || 0;
  };
  TL.organizationPromotionReady = function (S) {
    const r = TL.organizationRouteDef(S.affiliation, S.orgRoute);
    if (!r || S.phase !== 'life' || S.school || S.age >= 65 || S.serveLeft > 0 ||
        !TL.isWorking(S) || S.flags.retired || S.orgTransition ||
        !TL.organizationState(S, S.affiliation).recruitment || !TL.organizationAvailable(S, S.affiliation)) return false;
    const next = r.ranks[(S.orgRank || 0) + 1];
    return !!next && S.orgService >= next.needYears && S.orgLastPromotionYear !== S.year;
  };
  TL.promoteOrganization = function (S, options) {
    options = options || {};
    // 年度结算显式传入 annualSettlement；普通脚本调用仍保留旧接口，
    // 但组织随机事件不再调用此函数，避免快照与现金账本出现半年度工资。
    if (!TL.organizationPromotionReady(S)) return false;
    S.orgRank++; S.orgLastPromotionYear = S.year;
    if (S.affiliation === 'rhodes') S.opRank = S.orgRank;
    const h = activeHistory(S);
    if (h) { h.ranks.push(S.orgRank); h.promotions.push({ year: S.year, rank: S.orgRank }); }
    TL.log(S, '你在' + TL.organizationName(S.affiliation) + '晋升为' +
      TL.organizationRankName(S.affiliation, S.orgRoute, S.orgRank) + '。', 'org',
      { key: 'org_promote_' + S.affiliation });
    TL.computeIncome(S);
    return true;
  };
  TL.organizationYear = function (S) {
    TL.syncOrganization(S);
    if (!S.affiliation || S.phase !== 'life' || !TL.organizationAvailable(S, S.affiliation) ||
        S.orgLastServiceYear >= S.year || S.orgTransition) return;
    S.orgLastServiceYear = S.year;
    S.orgService++;
    // OCR 中黑钢有新兵中心、装备技术部门和专门的矿石病/生化响应单位；
    // 按路线授予相应训练，装备只能降低暴露，不能给绝对免疫。
    if (S.affiliation === 'blacksteel') {
      if (S.orgRoute === 'biosecurity') {
        S.flags.protectionPractice = TL.clamp((S.flags.protectionPractice || 0) + 0.12, 0, 0.35);
        S.flags.protectiveGear = TL.clamp((S.flags.protectiveGear || 0) + 0.06, 0, 0.25);
        if (TL.trainArts) TL.trainArts(S, S.artsProfile && S.artsProfile.primary, 0.8);
      } else if (S.orgRoute === 'security') {
        S.flags.protectionPractice = TL.clamp((S.flags.protectionPractice || 0) + 0.08, 0, 0.35);
        S.flags.protectiveGear = TL.clamp((S.flags.protectiveGear || 0) + 0.04, 0, 0.25);
        if (TL.trainArts) TL.trainArts(S, S.artsProfile && S.artsProfile.primary, 0.6);
      } else if (S.orgRoute === 'engineering') {
        S.flags.protectionPractice = TL.clamp((S.flags.protectionPractice || 0) + 0.04, 0, 0.35);
        S.flags.protectiveGear = TL.clamp((S.flags.protectiveGear || 0) + 0.06, 0, 0.25);
      }
    } else if (S.affiliation === 'rhodes') {
      S.flags.protectionPractice = TL.clamp((S.flags.protectionPractice || 0) + 0.03, 0, 0.35);
      // 外勤部负责能力评估与作战训练，适应性仍是先天值，成长的是具体方向熟练度。
      if (TL.trainArts) TL.trainArts(S, S.artsProfile && S.artsProfile.primary, 1.1);
    }
    const h = activeHistory(S);
    if (h) h.serviceYears = S.orgService;
  };
  TL.organizationPayMultiplier = function (S) {
    if (TL.organizationUnpaid(S)) return 0;
    if (!S.affiliation || !TL.isWorking(S) || S.flags.retired || S.job !== S.orgJob) return 1;
    const payroll = (TL.organizationEmploymentModel(S.affiliation) || {}).payroll || {};
    if (payroll.scale !== 'service-rank') return 1;
    const steps = Math.min(payroll.maxRankSteps || 0, Math.max(0, S.orgRank || 0));
    return 1 + steps * (payroll.rankStep || 0);
  };
  TL.organizationUnpaid = S => !!(S.affiliation && TL.organizationDef(S.affiliation)?.unpaid &&
    TL.organizationAvailable(S, S.affiliation) && S.job === S.orgJob && TL.isWorking(S) &&
    !S.school && !S.flags.retired && !S.serveLeft);
  TL.organizationSubsistence = S => TL.organizationUnpaid(S) ?
    TL.NATION_BY_ID[S.nation].ppp * (TL.organizationDef(S.affiliation).subsistence || 0) : 0;

  TL.organizationContactEligible = function (S, id, c) {
    if (S.phase !== 'life' || S.school || S.age >= 65 || S.flags.retired || S.serveLeft > 0 || S.orgTransition ||
        S.affiliation !== id || !TL.isWorking(S) || !TL.organizationAvailable(S, id) ||
        (S.orgRank || 0) < (c.minRank || 0)) return false;
    if (S.year < c.fromYear || S.year > c.untilYear) return false;
    const record = (S.orgContacts || {})[c.id];
    return !record || (record.count < 3 && S.year - record.lastYear >= 4);
  };
  TL.organizationContact = function (S, id, contactId) {
    init(S);
    const c = ((TL.organizationDef(id) || {}).contacts || []).find(x => x.id === contactId);
    if (!c || !TL.organizationContactEligible(S, id, c)) return null;
    const prev = S.orgContacts[c.id];
    S.orgContacts[c.id] = { name: c.name, organization: id,
      firstYear: prev ? prev.firstYear : S.year, lastYear: S.year,
      count: (prev ? prev.count : 0) + 1 };
    TL.eff(S, { so: 3, h: 2 });
    TL.log(S, (prev ? '再次与' : '你在工作中认识了') + c.name + '。' +
      (c.interaction || '你们讨论了这次任务的安排。'), 'org',
      { key: 'org_contact_' + id + '_' + c.id });
    return c;
  };

  // 申请 token -> adapter -> complete。录用只兑现一次。
  TL.organizationInterviewAdapter = null;
  TL.setOrganizationInterviewAdapter = adapter => { TL.organizationInterviewAdapter = adapter || null; };
  TL.beginOrganizationInterview = function (S, id, route, context) {
    const check = TL.organizationEligibility(S, id, route, context || {});
    if (!check.ok) return { status: 'ineligible', reason: check.reason };
    if ((S.orgApplication && S.orgApplication.status === 'interview') || S.orgInterviewResult) return { status: 'busy' };
    S.orgApplicationSerial = (S.orgApplicationSerial || 0) + 1;
    const application = { token: S.orgApplicationSerial, organization: id, route,
      status: 'interview', year: S.year, spec: check.interview, context: context || null,
      priorOrganization: S.affiliation || null, priorRoute: S.orgRoute || null };
    S.orgApplication = application;
    if (TL.organizationInterviewAdapter) return TL.organizationInterviewAdapter(S, application);
    return Object.assign({ mode: 'legacy' }, application);
  };
  TL.organizationApplicationEligibility = function(S,a) {
    if(a.year !== S.year) return {ok:false,reason:'申请已跨年，请重新申请。'};
    if(a.priorOrganization !== (S.affiliation || null) || a.priorRoute !== (S.orgRoute || null))
      return {ok:false,reason:'面谈期间任职关系已变化，请重新申请。'};
    return TL.organizationEligibility(S,a.organization,a.route,a.context || {});
  };
  TL.completeOrganizationInterview = function (S, result) {
    const a = S.orgApplication;
    if (!a || a.status !== 'interview' || !result || a.token !== result.token ||
        !['passed', 'rejected', 'withdrawn', 'waitlisted'].includes(result.status)) return false;
    if (a.session && result.status !== 'withdrawn' &&
        TL.evaluateOrganizationInterview(a).status !== result.status) return false;
    S.orgApplication = null;
    // 问答期间应暂停时间；跨年返回的旧结果不能再兑现。
    if (!TL.organizationApplicationEligibility(S,a).ok) return false;
    if (result.status === 'passed') {
      const joined = TL.joinOrganization(S, a.organization, a.route, a.context || {});
      if (joined && a.context && a.context.transitionId) S.flags['org_transition_' + a.context.transitionId] = 1;
      return joined;
    }
    init(S); S.orgCooldowns[a.organization] = S.year + (result.status === 'waitlisted' ? 1 : 3);
    TL.log(S, TL.organizationName(a.organization) +
      ({ rejected: '暂不接纳你，三年后可重新联系。', withdrawn: '的本次接洽已由你撤回。',
        waitlisted: '仍需考虑，一年后可以重新联系。' })[result.status], 'org',
      { key: 'org_application_' + result.status });
    return false;
  };
  TL.tryJoinOrganization = function (S, id, route, context) {
    const a = TL.beginOrganizationInterview(S, id, route, context || { source: 'recruitment' });
    if (a.status !== 'interview' || a.mode !== 'legacy') return a;
    const p = TL.clamp(0.42 + (S.st.sm - 45) / 260 + (S.st.so - 45) / 320, 0.2, 0.8);
    const passed = TL.chance(p);
    return { ok: TL.completeOrganizationInterview(S, { token: a.token,
      status: passed ? 'passed' : 'rejected' }), status: passed ? 'passed' : 'rejected' };
  };
})(window.TL = window.TL || {});
