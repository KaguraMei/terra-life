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
  TL.organizationScheduledDecisions = function (S) {
    TL.syncOrganization(S);
    TL.organizationTransitionYear(S);
    if (S.orgTransition) return [{ id: 'organization_transition', at: 0.02 }];
    if (S.affiliation && S.age - S.orgJoinedAt >= 3 &&
        (S.flags.dec_organization_career == null || S.age - S.flags.dec_organization_career >= 6))
      return [{ id: 'organization_career', at: 0.6 }];
    return [];
  };
  TL.pickOrganizationEvent = function (S) {
    if (!S.affiliation || S.orgTransition || !TL.isWorking(S)) return null;
    const ids = ['org_' + S.affiliation + '_training', 'org_' + S.affiliation + '_assignment'];
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
