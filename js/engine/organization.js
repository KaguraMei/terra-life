/* 组织生命周期；不依赖抉择 UI。所有概率、服务等级和招募门槛均为游戏规则。 */
(function (TL) {
  'use strict';
  const activeHistory = S => (S.orgHistory || []).find(h => h.leftYear == null);
  function init(S) {
    S.orgHistory = S.orgHistory || [];
    S.orgContacts = S.orgContacts || {};
    S.orgCooldowns = S.orgCooldowns || {};
  }
  /**
   * 「能否被普通事件辞退」的唯一资格入口。只有真正在职且未进入退休身份的
   * 个体才会丢掉工作；学生、待业、服刑、持家与已退休状态不会因为事件被
   * 改写成待业，也不产生组织层面的辞退后果。
   */
  TL.organizationEmploymentModel = function (id) {
    const o = TL.organizationDef(id);
    const models = TL.EMPLOYMENT_MODELS || {};
    return models[o && o.employmentModel] || models.contract || null;
  };
  TL.canBeDismissed = function (S) {
    // 资格判定在 src/model/membership.ts：只有活着、在职、且没进入退休身份的人会被辞退。
    if (!S) return false;
    return TL.membershipDismissible(S);
  };
  /**
   * 失去工作的唯一提交点；不满足资格时不做任何修改。
   * 组织成员被辞退时必须同时结束组织身份：留着 affiliation 却没有对应岗位，
   * 是状态不变量禁止的组合，也会让后续的组织事件对着一个不存在的岗位结算。
   */
  TL.dismissFromJob = function (S, reason) {
    if (!TL.canBeDismissed(S)) return false;
    if (S.affiliation) return TL.leaveOrganization(S, reason || '被辞退');
    S.flags.lastJob = S.job;
    S.job = 'seeking';
    return true;
  };
  /**
   * 强制劳役（苦役/服刑）的唯一提交点。
   * 退休身份与强制劳役不能同时成立：被押走的人不再「已退休」，
   * 但原有职业要留给释放后回去（退休前提下的 lastJob 已由 retire 记录）。
   * 这不是普通事件的解雇，所以不复用 dismissFromJob。
   */
  TL.enterCoercedLabour = function (S, job) {
    // 阶段、岗位合法性、是否已在该岗位：三条守卫在 src/model/membership.ts。
    if (!S || !TL.coercedLabourGuard(S, job).ok) return false;
    if (S.flags.retired) {
      S.flags.retired = false;
      // 退休身份被劳役取代后，已挣得的退休金仍然留档，但明确标注为「停发」：
      // 记录不能凭空消失，也不能反过来假装此人仍在领取。
      if (S.retirementPension && S.retirementPension.suspendedAt == null) {
        S.retirementPension.suspendedAt = S.age;
      }
    } else if (TL.isWorking(S)) S.flags.lastJob = S.job;
    // 组织成员被押走时同样要结束组织身份：劳役岗位与原岗位不能并存。
    if (S.affiliation) TL.leaveOrganization(S, '被押走', {keepJob: true});
    S.job = job;
    S.flags.slaveAt = S.age;
    return true;
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
  /**
   * 准入判定：14 道检查在 src/model/admission.ts，这里只把选项翻译成 transfer 标志。
   * 判定顺序与返回的 code 与迁移前逐条一致（差分探针 28800 条判定零分歧）。
   */
  TL.organizationEligibility = function (S, id, routeId, options) {
    return TL.organizationAdmission(S, id, routeId, Boolean(options && options.transfer));
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
    // 退休金、冷却、岗位与职级重置的条件在 src/model/employment.ts，这里只按次写状态。
    const terms = TL.leaveTerms(S, id, reason || '离职', options);
    if (terms.pension) S.retirementPension = Object.assign({organization: id}, terms.pension);
    delete S.flags['org_' + id];
    if (id === 'reunion') { S.flags.reunion = false; S.flags.reunionLeft = S.age; }
    if (terms.clearsOperatorRank) { S.opClass = null; S.opRank = 0; }
    if (terms.resetsJob) {
      S.flags.lastJob = S.job; S.job = 'seeking';
    }
    S.orgCooldowns[id] = terms.cooldownYear;
    S.affiliation = null; S.orgRoute = null; S.orgRank = 0; S.orgService = 0;
    S.orgJoinedAt = null; S.orgJob = null; S.orgTransition = null;
    TL.log(S, '你离开了' + TL.organizationName(id) + '：' + (reason || '离职') + '。', 'org',
      { key: 'org_leave_' + id, organization: id });
    TL.computeIncome(S);
    return true;
  };
  TL.retire = function (S, options) {
    options = options || {};
    // 阶段 / 年龄 / 是否已退休：三条守卫在 src/model/membership.ts。
    if (!TL.retirementGuard(S).ok) return false;
    S.flags.retired = true;
    if (TL.isWorking(S)) S.flags.lastJob = S.job;
    S.job = 'retired';
    // 重新获得退休身份时，因劳役停发的退休金随之恢复；金额沿用当年核定的数字。
    if (S.retirementPension && S.retirementPension.suspendedAt != null) {
      S.retirementPension.resumedAt = S.age;
      delete S.retirementPension.suspendedAt;
    }
    // Annual simulation preserves its established timeline ordering. Organization
    // departure is finalized by syncOrganization after the year's timeline entry.
    if (options.deferOrganizationExit) return true;
    if (S.affiliation) {
      TL.leaveOrganization(S, '退休', { keepJob: true, retirement: true, preserveOperatorRank: true });
    }
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
    // 离职原因与优先级在 src/model/membership.ts：档案失效 > 旧编制瓦解 > 地区禁令
    // > 退休/应征服役/结束任职 > 转行 > 迁出辖区；否则只更新岗位记录。
    const verdict = TL.syncVerdict(S);
    if (verdict.kind === 'leave') {
      TL.leaveOrganization(S, verdict.reason, verdict.options);
      return;
    }
    if (verdict.kind === 'update') {
      S.orgJob = verdict.orgJob;
      if (verdict.orgRank != null) S.orgRank = verdict.orgRank;
    }
  };
  TL.promoteOrganization = function (S, options) {
    options = options || {};
    // 年度结算显式传入 annualSettlement；普通脚本调用仍保留旧接口，
    // 但组织随机事件不再调用此函数，避免快照与现金账本出现半年度工资。
    if (!TL.organizationPromotionReady(S)) return false;
    // 晋升只动一级；罗得岛同时把职级镜像给干员等级（src/model/employment.ts）。
    const terms = TL.promotionTerms(S);
    S.orgRank = terms.rank; S.orgLastPromotionYear = S.year;
    if (terms.mirrorsOperatorRank) S.opRank = S.orgRank;
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
    const h = activeHistory(S);
    if (h) h.serviceYears = S.orgService;
  };
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
  TL.organizationContact = function (S, id, contactId) {
    init(S);
    const c = ((TL.organizationDef(id) || {}).contacts || []).find(x => x.id === contactId);
    if (!c || !TL.organizationContactEligible(S, id, c)) return null;
    const prev = S.orgContacts[c.id];
    S.orgContacts[c.id] = TL.contactRecord(prev, c, id, S.year);
    TL.eff(S, { so: 3, h: 2 });
    TL.log(S, (prev ? '再次与' : '你在工作中认识了') + c.name + '。' +
      (c.interaction || '你们讨论了这次任务的安排。'), 'org',
      { key: 'org_contact_' + id + '_' + c.id });
    return c;
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
