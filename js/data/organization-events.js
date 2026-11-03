/* 组织事件共用年度事件预算；任务文本为二次创作，年份边界见组织实现说明。 */
(function (TL) {
  'use strict';
  const tasks = {
    rhodes: ['移动诊疗站', '你随罗德岛建立临时诊疗点，将重症患者优先送上医疗车。', '撤离演练', '你把演练中漏掉的联络环节写进了行动手册。'],
    reunion: ['营地互助', '你给新来的感染者分配床位和生活物资，听他们讲来时的路。', '路线勘察', '你们避开纠察队，把一条更安全的迁移路线标在地图上。'],
    rhine_life: ['实验复核', '你发现了重复试验中的偏差，科室决定重做这批记录。', '研究边界', '受试者的同意书并不完整，你把问题递交复核，项目暂缓了一周。'],
    melander: ['资助核查', '你对照基金会拨款与现场记录，找到了迟迟未送达的物资。', '项目分歧', '资助方希望你改写结论，你保留原始记录，要求把异议附在报告后。'],
    blacksteel: ['护送合同', '你按照黑钢的撤离规程护送客户离开交火区。', '行动复盘', '你们逐分钟复盘一次失联，重新约定了无线电中断后的集合地点。'],
    penguin_logistics: ['加急订单', '企鹅物流的包裹准时到了，签收人却多等了一会儿才肯开门。', '备用路线', '原定街道被封锁，你和同伴把货物转交下一段运输队。'],
    raythean: ['装备试验', '你记录雷神工业样机的失效条件，让工程组在交付前修正了缺陷。', '验收标准', '客户想省掉一次安全测试，你坚持补齐验证记录再签字。'],
    karlan_trade: ['山路贸易', '喀兰贸易的新订单要穿过雪线，你重新核算了商队的补给。', '地方协商', '你与沿途村落协商货物停靠地点，把双方的要求写进新的商路协议。'],
    sarkaz_mercs: ['护送契约', '雇主要求临时加单，你们重新谈妥撤离条件才动身。', '战场互救', '你背着受伤的同伴回到集合点，队里的人替你分担了装备。'],
    kazdel_military: ['外勤调令', '你收到军事委员会的外勤调令，负责核对补给队伍的到达情况。', '军需复核', '你发现前线清单少了伤员用的药，把缺额报了上去。'],
    babel: ['荒原救助', '你把巴别塔的补给送到荒原营地，留下了能用的通讯器。', '撤离名单', '你在撤离前反复核对伤员名单，最后一辆车终于装下了所有人。'],
    laterano_gunknights: ['铳械维护', '你在维护中发现一处故障，教官要求整队重新检查装备。', '警戒轮值', '你守完庆典的警戒岗，把未用完的弹药逐一登记归库。'],
    laterano_guard: ['街区巡查', '你协助戍卫队疏通街区，让一场冲突停在了争吵的阶段。', '外派协作', '你和不同出身的协作者核对通行手续，学会把规定讲得更清楚。'],
    kaz_knights: ['资格赛', '你完成了一场资格赛，赞助方开始认真看你的比赛记录。', '赞助条件', '赞助商想干预你的赛程，你和经纪人重新谈了合同。'],
    lungmen_guard: ['夜班巡逻', '你接手近卫局的夜班，先疏散围观者，再为伤者联系救护车。', '证物交接', '你复核了证物交接记录，把含糊的口供退回补查。'],
    yan_sishuitai: ['异象巡查', '你沿司岁台标注的路线查看异象，将传闻与亲见分别入档。', '封存卷宗', '卷宗里有些内容不能流传，你先完成复核，再按规程封存。'],
    sir_family: ['家族委托', '你替家族交接一批货物，收条上没有写姓氏。', '人情账', '旧日人情被重新拿来讨价还价，你开始计算脱身需要付出的代价。'],
    sir_newcourt: ['市政听证', '你记录新城居民的诉求，争执第一次在公开会议里得到回应。', '独立取证', '你拒绝了熟人递来的名单，按新城的程序重新收集证据。']
  };
  for (const [id, o] of Object.entries(TL.ORGANIZATIONS)) {
    const t = tasks[id];
    for (let k = 0; k < 2; k++) {
      const key = 'org_' + id + '_' + (k ? 'assignment' : 'training');
      TL.EVMAP[key] = {
        id: key, organization: id, allowLegacy: true, title: t[k * 2],
        book: '组织', max: 6, cd: 3, w: k ? 1.5 : 1,
        when: S => S.affiliation === id && TL.isWorking(S) && !S.orgTransition,
        run(S) {
          TL.eff(S, k ? { so: 2, h: 1 } : { sm: 2, h: 1 });
          return t[k * 2 + 1];
        }
      };
      TL.SUPPLEMENTAL_EVENTS.push(key);
    }
  }
  // 用特定组织的任务替代早期通用占位事件。
  TL.EVMAP.organization_contact = {
    id: 'organization_contact', title: '组织中的人', book: '组织', max: 20, cd: 3, w: 0.45
  };
  TL.EVMAP.organization_contact.when = S => !!S.affiliation &&
    (TL.organizationDef(S.affiliation).contacts || []).some(c => TL.organizationContactEligible(S, S.affiliation, c));
  TL.EVMAP.organization_contact.run = function (S) {
    const candidates = (TL.organizationDef(S.affiliation).contacts || [])
      .filter(c => TL.organizationContactEligible(S, S.affiliation, c));
    if (!candidates.length) return null;
    const c = TL.wpickArr(candidates.map(c => ({ c, w: c.chance }))).c;
    TL.organizationContact(S, S.affiliation, c.id);
    return null; // 联系函数记录带人物 ID 的完整互动日志。
  };

  const changes = [
    { id: 'rhine_ifrit', org: 'rhine_life', year: 1095, text: '炎魔事件后，塞雷娅离开莱茵生命。防卫与研究流程面临复核。' },
    { id: 'rhine_arc', org: 'rhine_life', year: 1097, text: '地平弧光计划启动，新的任务也带来了对研究用途的疑问。' },
    { id: 'rhine_lonestar', org: 'rhine_life', year: 1099, text: '359号基地与特里蒙弧光事件之后，科室重新安排项目；克丽斯腾已不再参与地面工作。' },
    { id: 'lungmen_after', org: 'lungmen_guard', year: 1097, text: '切尔诺伯格事件后，陈离开近卫局；诗怀雅承担更多工作，局内重新安排人手。' },
    { id: 'merc_babel', org: 'sarkaz_mercs', year: 1086, text: '巴别塔的出现让佣兵营地开始讨论新的雇主和立场。' },
    { id: 'merc_decap', org: 'sarkaz_mercs', year: 1094, text: '斩首行动改变了卡兹戴尔的合同与阵营，你需要重新决定下一段去向。' },
    { id: 'babel_end', org: 'babel', year: 1094, text: '巴别塔遭受重创，原有行动编制无法继续维持。你必须另寻去向。', dissolved: true },
    { id: 'military_londinium', org: 'kazdel_military', year: 1098, text: '伦蒂尼姆战事让外勤合同发生变化，你收到新的去留通知。' },
    { id: 'knight_exile', org: 'kaz_knights', year: 1094, text: '耀骑士流放的消息传来，竞技场上的荣誉和商业规则之间露出裂隙。' },
    { id: 'knight_uprising', org: 'kaz_knights', year: 1097, text: '感染者起义改变了赛场外的秩序。感染者骑士开始寻找互助的同伴。' },
    { id: 'yan_shangshu_org', org: 'yan_sishuitai', year: 1097, text: '尚蜀器物活化事件后，司岁台增加了外勤巡查和卷宗核验。' },
    { id: 'lat_summit_org', org: 'laterano_guard', year: 1099, text: '万国峰会带来新的外派协作任务，戍卫与联络工作需要重新安排。' },
    { id: 'lat_gun_summit', org: 'laterano_gunknights', year: 1099, text: '万国峰会的警戒任务结束，你需要决定下一阶段是否继续服役。' },
    { id: 'karlan_open', org: 'karlan_trade', year: 1097, text: '雪山局势变化，喀兰贸易的商路与外部联络继续扩大。' },
    { id: 'sir_transition', org: 'sir_family', year: 1099, text: '新沃尔西尼禁止家族入驻和介入，但其他城市的家族仍在活动。你可以留在原城继续家族事务，或脱离家族、申请转入新城市政。' }
  ];
  TL.organizationTransitions = changes;
  TL.organizationTransitionYear = function (S) {
    if (!S.affiliation || S.orgTransition || S.phase !== 'life') return;
    const h = (S.orgHistory || []).find(h => h.leftYear == null);
    const c = changes.find(c => c.org === S.affiliation && c.year <= S.year &&
      h && h.joinedYear <= c.year && !S.flags['org_transition_' + c.id]);
    if (!c) return;
    S.orgTransition = c;
  };
  const transfers = {
    sarkaz_mercs: [['babel', 'sarkaz'], ['kazdel_military', 'field']],
    babel: [['kazdel_military', 'field'], ['sarkaz_mercs', 'contract']],
    kazdel_military: [['sarkaz_mercs', 'contract']],
    sir_family: [['sir_newcourt', 'security'], ['sir_newcourt', 'civic']],
    kaz_knights: [['kaz_knights', 'infected']],
    lungmen_guard: [['lungmen_guard', 'special']]
  };
  function candidates(S) {
    return (transfers[S.affiliation] || []).filter(([id, r]) =>
      TL.organizationEligibility(Object.assign({}, S, { affiliation: null }), id, r).ok &&
      !(S.affiliation === id && S.orgRoute === r));
  }
  function resolveTransition(S) {
    if (S.orgTransition) S.flags['org_transition_' + S.orgTransition.id] = 1;
    S.orgTransition = null;
  }
  TL.defDecision('organization_transition', {
    title: '组织中的转折',
    when: S => !!S.affiliation && !!S.orgTransition,
    text: S => S.orgTransition.text,
    options: [
      { label: '继续留任', hint: '接受调整，继续当前路线', eff: { so: 2 },
        require: S => !S.orgTransition.dissolved,
        run(S) { resolveTransition(S); return '你选择继续留下，重新确认了自己的职责。'; } },
      { label: S => { const [id, r] = candidates(S)[0] || []; return '转入' + TL.organizationName(id) + ' · ' + TL.organizationRouteName(id, r); },
        hint: '重新开始新路线的履历', require: S => candidates(S).length > 0, eff: { h: 2 },
        run(S) {
          const [id, r] = candidates(S)[0];
          const change = S.orgTransition;
          const result = TL.tryJoinOrganization(S, id, r, { transfer: true, source: 'transition', transitionId: change.id });
          return result.status === 'interview' ? '你开始参加新岗位的面谈，通过后再交接旧职。' : '转任条件已发生变化，你仍保留原有身份。';
        } },
      { label: '退出，寻找新的工作', hint: '结束旧合同，保留过往履历', eff: { h: 1, so: -2 },
        run(S) { resolveTransition(S); TL.leaveOrganization(S, '历史变局后退出'); return '旧合同结束了。你准备寻找新的工作。'; } }
    ]
  });
  TL.defDecision('organization_career', {
    title: '下一段职业生涯', cd: 6,
    when: S => !!S.affiliation && !S.orgTransition,
    text: S => '你已在' + TL.organizationName(S.affiliation) + '积累了一段经历，接下来准备怎样走？',
    options: [
      { label: '继续任职', eff: { h: 2, so: 1 }, run() { return '你决定继续做好手头的工作。'; } },
      { label: '申请转到另一条路线', require: S => candidates(S).length > 0, eff: { sm: 1 },
        run(S) {
          const [id, r] = candidates(S)[0];
          const result = TL.tryJoinOrganization(S, id, r, { transfer: true, source: 'career' });
          return result.status === 'interview' ? '你申请参加新岗位面谈，当前合同暂时保留。' : '目前还不能转任。';
        } },
      { label: '离职后重新求职', eff: { h: 1, so: -2 },
        run(S) { TL.leaveOrganization(S, '主动离职'); return '你交接完工作，准备寻找新的机会。'; } }
    ]
  });

  /* ---------------------------------------------------------------------- */
  /* 罗德岛：岗位方向                                                         */
  /* ---------------------------------------------------------------------- */
  TL.defDecision('rhodes_track', {
    title: '罗德岛的岗位方向',
    when: S => S.affiliation === 'rhodes' && !S.rhodesTrack && S.phase === 'life',
    text: S => '报到那天，负责分配的人把两份表推到你面前。\n外勤跟行动队出舰，补贴高，也可能回不来；内勤留在舰上，做医疗、工程或人事，升得慢些，但每天都能回到自己的铺位。\n\n你打算在哪一栏签字？',
    options: [
      { label: '外勤 · 跟随行动队', hint: '收入更高，受伤与阵亡风险也更高', eff: { h: 2, hl: -1 },
        run(S) { TL.setRhodesTrack(S, 'field'); return '你签了外勤的表。'; } },
      { label: '内勤 · 医疗与康复', hint: '诊疗与康复，收入平稳', eff: { sm: 2 },
        run(S) { TL.setRhodesTrack(S, 'support', 'medical'); return '你被分到医疗与康复部门。'; } },
      { label: '内勤 · 工程与设施', hint: '维护舰船与设备，按规程接触源石', eff: { sm: 1, h: 1 },
        run(S) { TL.setRhodesTrack(S, 'support', 'engineering'); return '你被分到工程与设施部门。'; } },
      { label: '内勤 · 人事与后勤', hint: '入职培训、档案与生活支持，认识的人最多', eff: { so: 2 },
        run(S) { TL.setRhodesTrack(S, 'support', 'personnel'); return '你被分到人事与后勤部门。'; } }
    ]
  });

  /* ---------------------------------------------------------------------- */
  /* 罗德岛：精英干员考核                                                     */
  /* ---------------------------------------------------------------------- */
  TL.defDecision('rhodes_elite_review', {
    title: '精英干员考核',
    when: S => TL.rhodesEliteReviewReady(S),
    text: S => S.rhodesTrack === 'support'
      ? '内勤的年度评审到了。精英资格要过一次业务考核：病例与流程、部门协作，还有你对这条舰的了解。\n资历只是入场券，评语不看年限。'
      : '外勤队的年度评审到了。想拿到精英干员的资格，要通过一次实战考核：战术判断、现场处置，还有身体。\n评审不会因为资历放你过去。',
    options: [
      { label: '参加考核', hint: '通过后由年度评审确认职级', eff: { h: 3, so: 3 },
        run(S) { return TL.rhodesEliteExam(S); } },
      { label: '再准备一年', hint: '今年不申报，明年再说', eff: { h: 1, sm: 1 },
        run(S) { S.flags.rhodesEliteCooldown = S.age + 1; return '你把申报表收了回来，决定再练一年。'; } },
      { label: '不再申报精英资格', hint: '留在当前职级，评审不再询问', eff: { h: 3 },
        run(S) { S.flags.rhodesEliteDeclined = true; return '你决定不再往上报。'; } }
    ]
  });

  /* 方向不同，日常任务也不同：外勤出舰，内勤守舰。 */
  const rhodesTrackEvents = {
    field: [
      { id: 'rhodes_field_patrol', title: '外勤巡逻', w: 1.4, eff: { hl: -2, so: 2 },
        text: '你随队进入封锁区做例行搜查。回到舰上时，靴子上还带着灰。' },
      { id: 'rhodes_field_evac', title: '撤离行动', w: 1.2, eff: { so: 3, h: -2 },
        text: '撤离名单比预计的长。你和队友把最后一批人送上车，自己的伤留到回舰才处理。' }
    ],
    support: [
      { id: 'rhodes_support_ward', title: '病房夜班', w: 1.4, eff: { sm: 2, h: -1 },
        text: '夜班的病房很安静。你按顺序查房、换药，把一位病人的话记进了交班本。' },
      { id: 'rhodes_support_gear', title: '设备验收', w: 1.2, eff: { sm: 2 },
        text: '新到的一批滤网与隔离壳要逐件验收。你把不合格的挑出来，退回重做。' }
    ]
  };
  for (const [track, list] of Object.entries(rhodesTrackEvents)) {
    for (const e of list) {
      TL.EVMAP[e.id] = {
        id: e.id, title: e.title, book: '组织', max: 6, cd: 4, w: e.w,
        when: S => S.affiliation === 'rhodes' && S.rhodesTrack === track &&
          TL.isWorking(S) && !S.orgTransition,
        run(S) { TL.eff(S, e.eff); return e.text; }
      };
      TL.SUPPLEMENTAL_EVENTS.push(e.id);
    }
  }
  /* ---------------------------------------------------------------------- */
  /* 罗德岛：短期任务与驻扎                                                   */
  /* ---------------------------------------------------------------------- */
  TL.defDecision('rhodes_deploy', {
    title: '外勤安排',
    when: S => TL.rhodesDeployReady(S),
    text: S => '任务处把几份安排摊在桌上：一份当天的短期出勤，几份两年期的驻扎。\n短期任务不换驻地；驻扎会离开本舰，去别的国家住下来。没有人替你挑。',
    options: [
      { label: '接一份短期任务', hint: '当天出勤，不改驻地', eff: { h: 1 },
        run(S) { return TL.runRhodesShortMission(S) ? '你领了装备，跟着车队出了门。' : '这次任务没有成行。'; } },
      { label: '驻扎 · 联络处', hint: '两年，和地方打交道，风险较低', eff: { so: 2 },
        run(S) { return TL.startRhodesPosting(S, 'liaison') ? '你被派去联络处常驻。' : '这次任务没有成行。'; } },
      { label: '驻扎 · 安全屋', hint: '两年，接头与情报，风险中等', eff: { sm: 1 },
        run(S) { return TL.startRhodesPosting(S, 'safehouse') ? '你带着一份新证件离开了本舰。' : '这次任务没有成行。'; } },
      { label: '驻扎 · 前哨', hint: '两年，靠近交火线，津贴最高', eff: { so: 1 },
        run(S) { return TL.startRhodesPosting(S, 'outpost') ? '你登上运输机，前往城外的前哨。' : '这次任务没有成行。'; } },
      { label: '这次留守', hint: '留在舰上，过一阵再接任务', eff: { h: 1 },
        run(S) { S.flags.deployCooldown = S.year + 2; return '你没有接这次安排。'; } }
    ]
  });

  /* 驻地专属的日常：任务中遇到的人与事、驻扎点的工作、或靠港时下船的那半天。 */
  const stationEvents = [
    { id: 'rhodes_mission_help', kind: 'deploy', title: '任务中的人', w: 1.5, eff: { so: 3, h: 1 },
      text: '任务间隙，一个当地孩子把家里仅剩的水递给你的队友。你们把随车的干粮留了一半。' },
    { id: 'rhodes_mission_trouble', kind: 'deploy', title: '突发交火', w: 1.1, eff: { hl: -4, h: -2 },
      text: '撤离路线上出现了没有标识的武装。你们边打边退，回到集合点时少了一个人。' },
    { id: 'rhodes_liaison_talk', kind: 'deploy', posting: 'liaison', title: '地方交涉', w: 1.4, eff: { so: 3, sm: 1 },
      text: '联络处的门被推开了三次。第三次来的是一位不愿留下姓名的中间人，你给他倒了茶。' },
    { id: 'rhodes_safehouse_contact', kind: 'deploy', posting: 'safehouse', title: '接头', w: 1.3, eff: { sm: 2, h: -1 },
      text: '约定是下午四点、红色雨伞。四点二十人才到，你确认了三遍他没有被跟。' },
    { id: 'rhodes_outpost_watch', kind: 'deploy', posting: 'outpost', title: '前哨夜岗', w: 1.4, eff: { hl: -2, so: 2 },
      text: '轮到你守后半夜。探照灯扫过荒地，风里有金属味，天亮前什么都没有发生。' },
    { id: 'rhodes_ship_dock', kind: 'ship', title: '靠港', w: 1.3, eff: { so: 2, h: 1 },
      text: '舰船靠港补给。你请了半天假下船，在码头边的小店坐了很久。' },
    { id: 'rhodes_ship_mess', kind: 'ship', title: '舰上食堂', w: 1.4, eff: { so: 2, h: 1 },
      text: '食堂今晚多了一道菜，是有人过生日。你被拉去分蛋糕，名字被写在纸盘边上。' },
    { id: 'rhodes_ship_drill', kind: 'ship', title: '舰内演练', w: 1.3, eff: { sm: 1, hl: 1 },
      text: '全舰演练，你负责的那一段通道要在三分钟内清空。第二次跑的时候，你们做到了。' },
    { id: 'rhodes_ship_ward_round', kind: 'ship', post: 'medical', title: '查房', w: 1.4, eff: { sm: 2, so: 1 },
      text: '查房到第七间，病人问起出院以后能去哪里。你把能写的都写进了转介单。' },
    { id: 'rhodes_ship_refit', kind: 'ship', post: 'engineering', title: '舱段改装', w: 1.3, eff: { sm: 2 },
      text: '医疗舱要加装一组滤网。你在图纸上改了三处，施工时一直在场。' },
    { id: 'rhodes_ship_roster', kind: 'ship', post: 'personnel', title: '排班', w: 1.3, eff: { so: 2 },
      text: '这周的排班表改了四遍。你把两个人的夜班调开，让他们能赶上家里的信。' }
  ];
  for (const e of stationEvents) {
    TL.EVMAP[e.id] = {
      id: e.id, title: e.title, book: '组织', max: 6, cd: 4, w: e.w,
      when: S => S.affiliation === 'rhodes' && !!S.station && S.station.kind === e.kind &&
        (!e.posting || S.station.posting === e.posting) &&
        (!e.post || S.rhodesPost === e.post) &&
        TL.isWorking(S) && !S.orgTransition,
      run(S) { TL.eff(S, e.eff); return e.text; }
    };
    TL.SUPPLEMENTAL_EVENTS.push(e.id);
  }

  /* 不在家时也能发生的事：路上、家书、驻地傍晚。 */
  const awayEvents = [
    { id: 'away_road', title: '路上', w: 1.3, eff: { sm: 1, hl: -1 },
      text: '换乘了两次车，第三次是卡车后斗。你把外套垫在背包下面，睡着了半小时。' },
    { id: 'away_letter', title: '家书', w: 1.4, eff: { so: 2, h: 1 },
      text: '信比人走得慢。你收到时已经是两个月前写的，家里一切都好，只是问你什么时候回来。' },
    { id: 'away_local', title: '驻地的傍晚', w: 1.2, eff: { so: 1, sm: 1 },
      text: '收工后你沿着驻地外的路走了一段。这里的人说话有口音，但菜市场的规矩和家里差不多。' }
  ];
  for (const e of awayEvents) {
    TL.EVMAP[e.id] = {
      id: e.id, title: e.title, book: '组织', max: 5, cd: 4, w: e.w,
      when: S => TL.isAwayFromHome(S) && TL.isWorking(S) && !S.orgTransition,
      run(S) { TL.eff(S, e.eff); return e.text; }
    };
    TL.SUPPLEMENTAL_EVENTS.push(e.id);
  }

  TL.organizationScheduledDecisions = function (S) {
    TL.syncOrganization(S);
    TL.organizationTransitionYear(S);
    if (S.orgTransition) return [{ id: 'organization_transition', at: 0.02 }];
    const out = [];
    // 精英考核先于职业去留；外勤任务再排在后面，避免同一年挤在一起。
    if (TL.rhodesEliteReviewReady(S)) out.push({ id: 'rhodes_elite_review', at: 0.45 });
    if (S.affiliation && S.age - S.orgJoinedAt >= 3 &&
        (S.flags.dec_organization_career == null || S.age - S.flags.dec_organization_career >= 6))
      out.push({ id: 'organization_career', at: 0.3 });
    if (TL.rhodesDeployReady && TL.rhodesDeployReady(S)) out.push({ id: 'rhodes_deploy', at: 0.7 });
    return out;
  };
  TL.pickOrganizationEvent = function (S) {
    if (!S.affiliation || S.orgTransition || !TL.isWorking(S)) return null;
    const ids = ['org_' + S.affiliation + '_training', 'org_' + S.affiliation + '_assignment'];
    // 罗德岛的日常任务按岗位方向分开，外勤与内勤不再共用同一套文案。
    if (S.affiliation === 'rhodes' && S.rhodesTrack) {
      ids.push(S.rhodesTrack === 'field' ? 'rhodes_field_patrol' : 'rhodes_support_ward');
      ids.push(S.rhodesTrack === 'field' ? 'rhodes_field_evac' : 'rhodes_support_gear');
    }
    // 驻地不同，遇到的事也不同：任务中在异地，内勤在舰上或靠港。
    if (S.affiliation === 'rhodes' && S.station) {
      if (S.station.kind === 'deploy') {
        ids.push('rhodes_mission_help', 'rhodes_mission_trouble');
        const postingEvent = {
          liaison: 'rhodes_liaison_talk', safehouse: 'rhodes_safehouse_contact', outpost: 'rhodes_outpost_watch'
        }[S.station.posting];
        if (postingEvent) ids.push(postingEvent);
      } else if (S.station.kind === 'ship') {
        ids.push('rhodes_ship_dock', 'rhodes_ship_mess', 'rhodes_ship_drill');
        const postEvent = {
          medical: 'rhodes_ship_ward_round', engineering: 'rhodes_ship_refit', personnel: 'rhodes_ship_roster'
        }[S.rhodesPost];
        if (postEvent) ids.push(postEvent);
      }
    }
    // 每年最多抽一次人物机会，使用人物概率之和，事件仍经 pickEvent/fire 的冷却和次数校验。
    const contacts = (TL.organizationDef(S.affiliation).contacts || [])
      .filter(c => TL.organizationContactEligible(S, S.affiliation, c));
    if (contacts.length && TL.chance(Math.min(0.2, contacts.reduce((s, c) => s + c.chance, 0)))) {
      const contact = TL.pickEvent(S, ['organization_contact']);
      if (contact) return contact;
    }
    return TL.pickEvent(S, ids);
  };
})(window.TL = window.TL || {});
