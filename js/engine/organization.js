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
      // 每次入职重新选岗位方向；老履历不动。
      S.rhodesTrack = null;
      S.rhodesPost = null;
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
    // 罗德岛先定岗位方向（外勤／内勤），再进入正常结算。
    if (id === 'rhodes' && TL.queueEvent) TL.queueEvent(S, 0, 'dec', 'rhodes_track');
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
    if (id === 'rhodes' && !options.preserveOperatorRank) {
      S.opClass = null; S.opRank = 0; S.rhodesTrack = null; S.rhodesPost = null;
    }
    if (id === 'rhodes') S.station = null;
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
    if (!next) return false;
    // 有些职阶不是熬年头就能上：精英干员必须先通过考核。
    if (next.assessment && !S.flags['assess_' + next.assessment]) return false;
    return S.orgService >= next.needYears && S.orgLastPromotionYear !== S.year;
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
    // 任务期结束：津贴与履历在归来时结算。
    if (S.station && S.station.kind === 'deploy' && S.year >= S.station.returnYear) TL.endRhodesDeployment(S);
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
      // 外勤：跟着行动队出舰，练的是技艺和现场处置；内勤：留在舰上，练的是业务与协作。
      if (S.rhodesTrack === 'support') {
        S.flags.protectionPractice = TL.clamp((S.flags.protectionPractice || 0) + 0.02, 0, 0.35);
        if (TL.knowAdd) TL.knowAdd(S, 0.9);
      } else {
        S.flags.protectionPractice = TL.clamp((S.flags.protectionPractice || 0) + 0.04, 0, 0.35);
        if (TL.trainArts) TL.trainArts(S, S.artsProfile && S.artsProfile.primary, 1.2);
      }
    }
    const h = activeHistory(S);
    if (h) h.serviceYears = S.orgService;
  };
  TL.organizationPayMultiplier = function (S) {
    if (TL.organizationUnpaid(S)) return 0;
    if (!S.affiliation || !TL.isWorking(S) || S.flags.retired || S.job !== S.orgJob) return 1;
    // 外勤有出勤补贴；内勤略低，但风险和作息都更稳。
    if (S.affiliation === 'rhodes' && S.rhodesTrack) return S.rhodesTrack === 'field' ? 1.16 : 1.06;
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

  /* ---------------------------------------------------------------------- */
  /* 罗德岛：岗位方向（外勤／内勤）与精英考核                                  */
  /* ---------------------------------------------------------------------- */
  const RHODES_POSTS = {
    field: '外勤', medical: '医疗与康复', engineering: '工程与设施', personnel: '人事与后勤'
  };
  TL.rhodesPostName = post => RHODES_POSTS[post] || '';
  TL.rhodesTrackName = S => (S && S.rhodesTrack) ? (S.rhodesTrack === 'field' ? '外勤' : '内勤') : '';

  /** 入职后的方向选择。field 保留战斗分支；support 留在舰上做部门工作。 */
  TL.setRhodesTrack = function (S, track, post) {
    if (!S || S.affiliation !== 'rhodes') return false;
    S.rhodesTrack = track === 'support' ? 'support' : 'field';
    S.rhodesPost = S.rhodesTrack === 'field' ? 'field' : (RHODES_POSTS[post] ? post : 'personnel');
    // 内勤住舰上；外勤没有固定驻地，任务期之外住在自己的住处。
    S.station = S.rhodesTrack === 'support'
      ? { kind: 'ship', name: '罗德岛本舰', sinceYear: S.year }
      : null;
    S.flags.rhodesTrackDecided = S.age;
    TL.log(S, S.rhodesTrack === 'field'
      ? '你被编入外勤队，跟着行动小组出舰。'
      : '你被编入' + TL.rhodesPostName(S.rhodesPost) + '，住进了舰上的铺位。', 'org',
      { key: 'rhodes_track_' + S.rhodesPost });
    return true;
  };

  /** 统一的干员头衔：外勤带战斗分支，内勤带部门。 */
  TL.operatorTitle = function (o) {
    if (!o || !o.opClass) return '';
    const head = TL.opRankName(o.opRank);
    if (!o.rhodesTrack) return head + ' · ' + TL.opClassName(o.opClass);
    if (o.rhodesTrack === 'support') return head + ' · 内勤 · ' + TL.rhodesPostName(o.rhodesPost);
    return head + ' · 外勤 · ' + TL.opClassName(o.opClass);
  };

  /** 精英考核是否可以申报：资深干员、服满年限、没考过也没放弃。 */
  TL.rhodesEliteReviewReady = function (S) {
    if (!S || S.affiliation !== 'rhodes' || S.phase !== 'life') return false;
    if ((S.orgRank || 0) !== 2) return false;
    if (S.flags.assess_rhodes_elite || S.flags.rhodesEliteDeclined) return false;
    if ((S.flags.rhodesEliteCooldown || 0) > S.age) return false;
    if (S.school || S.flags.retired || S.age >= 65 || S.serveLeft > 0 || S.orgTransition ||
        !TL.isWorking(S) || !TL.organizationAvailable(S, 'rhodes')) return false;
    const r = TL.organizationRouteDef('rhodes', S.orgRoute);
    const next = r && r.ranks[(S.orgRank || 0) + 1];
    if (!next || !next.assessment) return false;
    return (S.orgService || 0) >= next.needYears;
  };

  /** 考核判定：外勤看实战，内勤看业务。成功只发资格，职级仍在年度评审兑现。 */
  TL.rhodesEliteExam = function (S) {
    const field = S.rhodesTrack !== 'support';
    const p = field
      ? TL.clamp(0.30 + (TL.combatValue(S) - 75) / 150 + (S.st.hl - 65) / 220 + (S.arts - 50) / 320, 0.12, 0.86)
      : TL.clamp(0.32 + (S.st.sm - 65) / 150 + (S.st.so - 60) / 260 + (S.orgService || 0) / 160, 0.12, 0.88);
    if (TL.chance(p)) {
      S.flags.assess_rhodes_elite = S.year;
      TL.eff(S, { h: 6, so: 4 });
      return '你通过了考核。名单上，你的名字后面多了一个「精英」。';
    }
    S.flags.rhodesEliteCooldown = S.age + 2;
    TL.eff(S, { h: -6 });
    return field
      ? '实战考核的最后一轮，你的判断慢了一拍。评语写着：下一轮再来。'
      : '答辩时，有位评审问起你经手的一桩旧案。你答得含糊。';
  };

  /* ---------------------------------------------------------------------- */
  /* 罗德岛：驻地与外勤部署                                                   */
  /* ---------------------------------------------------------------------- */
  /* 内勤常驻本舰；外勤平时住在自己的地方，接到任务才临时换驻地。
     驻地只影响「此刻在哪里」，不搬家、不改户籍，也不动家人的位置。 */
  const RHODES_MISSIONS = {
    escort: { name: '护送物资' },
    rescue: { name: '灾区救援' },
    scout: { name: '前沿侦察' }
  };
  /* 驻扎类任务：时间更长、地点固定，日常也不同。风险与津贴都是玩法数值。 */
  const RHODES_POSTINGS = {
    liaison: { name: '联络处', risk: 1.12, pay: 1.0,
      text: '一间临街的办公室，门口挂着不起眼的牌子。你要和地方的人打交道，也要把名单送回去。' },
    safehouse: { name: '安全屋', risk: 1.32, pay: 1.6,
      text: '一套不登记在任何人名下的公寓。接头、换证件、等消息，多数时候只能坐着。' },
    outpost: { name: '前哨', risk: 1.52, pay: 2.0,
      text: '城外的一处据点，补给靠车队，夜里要轮岗。这里离交火线比离城市近。' }
  };
  TL.rhodesMissionName = id => (RHODES_MISSIONS[id] || {}).name || '';
  TL.rhodesPostingName = id => (RHODES_POSTINGS[id] || {}).name || '';
  TL.stationNation = S => (S && S.station && S.station.kind === 'deploy' && S.station.nation) || null;
  TL.isAwayFromHome = S => !!(S && S.station && (S.station.kind === 'deploy' || S.station.kind === 'ship'));
  TL.rhodesStationLabel = function (S) {
    const st = S && S.station;
    if (!st) return '';
    return st.kind === 'ship' ? '罗德岛本舰' : (st.name || '在外执行任务');
  };
  /** 外勤是否可以接新任务：入职满一年、没在任务中、冷却已过。 */
  TL.rhodesDeployReady = function (S) {
    if (!S || S.affiliation !== 'rhodes' || S.rhodesTrack !== 'field' || S.phase !== 'life') return false;
    if (S.station || S.school || S.serveLeft > 0 || S.flags.retired || S.age >= 65 || S.orgTransition) return false;
    if (!TL.isWorking(S) || !TL.organizationAvailable(S, 'rhodes')) return false;
    if ((S.flags.deployCooldown || 0) > S.year) return false;
    return (S.orgService || 0) >= 1;
  };

  /** 短期任务：不改驻地，当场结算。适合「今天出勤、明天回舰」的那一类。 */
  TL.runRhodesShortMission = function (S) {
    if (!TL.rhodesDeployReady(S)) return false;
    const kind = TL.wpickArr([{ id: 'escort', w: 4 }, { id: 'rescue', w: 3 }, { id: 'scout', w: 2 }]).id;
    const score = TL.combatValue(S) * 0.5 + S.st.hl * 0.3 + S.st.so * 0.2;
    const ok = TL.chance(TL.clamp(0.35 + (score - 55) / 110, 0.15, 0.9));
    S.flags.deployCooldown = S.year + 1;
    S.flags.deployments = (S.flags.deployments || 0) + 1;
    S.flags.deployLog = (S.flags.deployLog || []).concat([{
      year: S.year, name: '短期任务', mission: kind, short: true
    }]);
    if (ok) {
      S.money += Math.max(0, Number.isFinite(S.income) ? S.income : 0) * 0.8;
      TL.eff(S, { so: 2, h: 1 });
      TL.log(S, '你完成了一次短期任务（' + TL.rhodesMissionName(kind) + '），当天回到舰上。', 'org',
        { key: 'rhodes_short_ok' });
    } else {
      TL.eff(S, { hl: -4, h: -2 });
      TL.log(S, '短期任务出了岔子（' + TL.rhodesMissionName(kind) + '），你带着伤回到舰上。', 'org',
        { key: 'rhodes_short_bad' });
    }
    return true;
  };

  /** 驻扎：联络处／安全屋／前哨，两年一期，驻地随任务地改变。 */
  TL.startRhodesPosting = function (S, posting) {
    if (!TL.rhodesDeployReady(S) || !RHODES_POSTINGS[posting]) return false;
    const pool = TL.NATIONS.filter(x => x.id !== S.nation && !['AEG', 'DUR'].includes(x.id));
    // 未来两年有大事的国家更容易被派去，驻扎期正好撞上。
    const upcoming = (TL.TIMELINE || []).filter(e => !e.legend && e.year >= S.year && e.year <= S.year + 2);
    const target = TL.wpickArr(pool.map(x => ({
      x: x,
      w: 0.6 + x.war * 2 + x.cat +
        (upcoming.some(e => ((e.scope && e.scope.nations) || []).includes(x.id)) ? 3 : 0)
    }))).x;
    const place = TL.drawPlace(target.id, S.year, TL.rnd);
    const def = RHODES_POSTINGS[posting];
    S.station = {
      kind: 'deploy', posting: posting, nation: target.id, placeId: place.id,
      name: def.name + ' · ' + target.name + ' · ' + TL.placeName(place, S.year),
      risk: def.risk, pay: def.pay, sinceYear: S.year, returnYear: S.year + 2
    };
    S.flags.deployments = (S.flags.deployments || 0) + 1;
    S.flags.deployCooldown = S.year + 4;
    S.flags.deployLog = (S.flags.deployLog || []).concat([{
      year: S.year, name: S.station.name, mission: posting, posting: true
    }]);
    TL.log(S, '你被派往' + S.station.name + '，开始为期两年的驻扎。', 'org',
      { key: 'rhodes_posting_start' });
    return true;
  };

  /** 归来：结算津贴、记录履历，驻地回到自己的住处。 */
  TL.endRhodesDeployment = function (S) {
    const st = S.station;
    if (!st || st.kind !== 'deploy') return false;
    S.station = null;
    // 驻扎之后有两三年的调整期，不会连着被派出。
    S.flags.deployCooldown = S.year + 3;
    const months = st.pay || 1.5;
    S.money += Math.max(0, Number.isFinite(S.income) ? S.income : 0) * months;
    TL.eff(S, { h: 2, so: 2 });
    TL.log(S, '你在' + st.name + '的驻扎结束，回到罗德岛。', 'org', { key: 'rhodes_deploy_end' });
    return true;
  };

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
