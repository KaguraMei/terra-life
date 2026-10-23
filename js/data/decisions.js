/* ==========================================================================
 * TERRA LIFE SIM — 抉择库
 * --------------------------------------------------------------------------
 * 对应原作的抉择定义。每个抉择是人生里的一个岔路口。
 *
 * 设计原则（来自原作）：
 *   · 选项之间不是「好/坏」，而是「代价不同」
 *   · 有些选项的信息是不完整的（hint 只给方向，不给数字）
 *   · 感染者身份会改写选项的形状 —— 同一个岔路口，你的走法不一样
 * ========================================================================== */
(function (TL) {
  'use strict';

  const D = TL.defDecision;

  /* ====================================================================== */
  /* 求学路线                                                                */
  /* ====================================================================== */
  D('first_school', {
    once: true,
    title: '该不该去学堂',
    text: S => TL.L`${S.city}的学堂在招人。学费不算贵，但对家里来说也不是小数目。`,
    options: [
      {
        label: '去上学', hint: '学识↑ 家里负担↑',
        eff: { sm: 4, so: 2, h: -2 },
        run(S) { S.flags.schoolDebt = 1; S.st.sm += 3; return TL.L`你去了。母亲把攒下的钱数了三遍才交上去。`; }
      },
      {
        label: '留在家里帮忙', hint: '羁绊↑ 学识↓',
        eff: { so: 4, hl: 2, sm: -3 },
        run(S) { S.flags.noSchool = 1; return TL.L`你没去。家里确实需要人手。`; }
      },
      {
        label: '自己找书看', hint: '学识↑ 慢',
        require: S => S.st.sm > 25,
        eff: { sm: 2, h: 1, so: -1 },
        run(S) { return TL.L`你从废纸堆里捡回来半本书。看不懂的地方就跳过。`; }
      }
    ]
  });

  D('middle_path', {
    once: true,
    title: '中等学堂的方向',
    text: () => TL.L`学堂要分科了。教习让你自己选。`,
    options: [
      { label: '继续读书', hint: '学识↑↑', eff: { sm: 6, h: -1 }, run(S) { S.flags.track = 'academic'; return TL.L`你选了继续读。`; } },
      { label: '学一门手艺', hint: '技艺↑ 早就业', eff: { sm: 2, hl: 3 }, run(S) { S.flags.track = 'trade'; return TL.L`你选了学手艺。师傅说手比脑子记得牢。`; } },
      { label: '不读了，去干活', hint: '收入↑ 学识↓', eff: { sm: -4, hl: 2, money: 1 }, run(S) { S.school = null; S.job = 'seeking'; return TL.L`你把书还给了学堂。`; } }
    ]
  });

  D('teen_fork', {
    once: true,
    title: '十五岁',
    text: S => TL.L`你十五岁了。在${TL.NATION_BY_ID[S.nation].name}，这个年纪已经可以做很多决定。`,
    options: [
      { label: '读下去', hint: '学识↑ 家境门槛', eff: { sm: 5, so: -2 }, run(S) { TL.startSchool(S, 'high'); return TL.L`你继续读。班里的人一年比一年少。`; } },
      { label: '进工厂/矿上', hint: '钱快 风险高', eff: { hl: -3, money: 2 }, run(S) { S.job = S.nation === 'RMB' || S.nation === 'KDZ' ? 'miner' : 'factory'; return TL.L`你进了厂。第一个月手上全是口子。`; } },
      {
        label: '跟着商队走', hint: '见识↑ 但从此在路上',
        eff: { sm: 3, so: 1, hl: -3 },
        run(S) {
          S.job = 'courier';
          // 行商的路很长，认识的人一路换
          if (TL.chance(0.35)) { S.flags.migrations = (S.flags.migrations || 0) + 1; S.city = TL.cityOf(S.nation); }
          return TL.L`你跟着一支商队上了路。原来世界比${S.city}大得多，也比它危险得多。`;
        }
      },
      {
        label: '去考干员', hint: '改变一生的机会，也可能白跑一趟',
        require: S => TL.canJoinOrganization(S, 'rhodes', 'operator'),
        eff: { hl: 2, h: 3, so: -3, sm: 1 },
        run(S) {
          return TL.tryJoinRhodes(S) ? '你递交了申请，开始参加罗德岛的面谈。' : '你还不符合当前招募条件，可以积累经验后再试。';
        }
      }
    ]
  });

  D('arts_path', {
    once: true,
    title: '源石技艺',
    text: S => TL.L`有人告诉你，你的源石技艺适应性不算低（当前 ${Math.round(S.arts)}）。`,
    options: [
      {
        label: '专门去学', hint: '技艺↑↑ 感染风险↑',
        eff: { arts: 6, h: 3, hl: -3 },
        run(S) {
          S.flags.artsPath = 1;
          if (TL.chance(0.14)) { TL.infect(S); return TL.L`你进了术师学堂。第二年体检，医生在你的肺部看到了不该有的东西。`; }
          return TL.L`你进了术师学堂。手指上的老茧换了个位置。`;
        }
      },
      {
        label: '只当个爱好', hint: '稳妥',
        eff: { arts: 2, h: 2 },
        run(S) { return TL.L`你没有专门去学，但偶尔会练一练。`; }
      },
      {
        label: '压住它，不碰', hint: '安全 但放弃天赋',
        require: S => S.nation === 'URS' || S.nation === 'IBE' || S.nation === 'LAT',
        eff: { h: -4, hl: 2 },
        run(S) {
          S.flags.artsSuppressed = 1;
          if (S.nation === 'IBE') return TL.L`审判庭的人找过你一次。之后你再没有在别人面前用过。`;
          if (S.nation === 'LAT') return TL.L`律法对未登记的术式有明确的规定。你把它收了起来。`;
          return TL.L`在乌萨斯，会施术的平民不是好事。你把它压了下去。`;
        }
      }
    ]
  });

  D('after_school', {
    once: true,
    title: '毕业之后',
    text: () => TL.L`学业结束了。接下来要去哪里？`,
    options: [
      {
        label: '去大城市', hint: '机会多 歧视也可能更重',
        eff: { sm: 3, so: -4, h: 2 },
        run(S) {
          const big = { YAN: 'LMN', VIC: 'VIC', CLB: 'CLB', LEI: 'LEI', URS: 'URS' }[S.nation] || S.nation;
          S.flags.migratedTo = big;
          S.city = TL.cityOf(big);
          S.flags.migrations = (S.flags.migrations || 0) + 1;
          return TL.L`你去了${TL.cityOf(big)}。房租比想象中贵。`;
        }
      },
      {
        label: '留在本地', hint: '人脉保住',
        eff: { so: 5, h: 1 },
        run(S) { return TL.L`你留下了。认识的人都在这里。`; }
      },
      {
        label: '试着进罗德岛',
        hint: '参加招募考核',
        require: S => TL.canJoinOrganization(S, 'rhodes', 'operator'),
        eff: { h: 3, so: -2 },
        run(S) {
          if (TL.tryJoinRhodes(S)) return '你递交了申请，开始参加罗德岛的面谈。';
          return TL.L`你投了简历，没有回音。`;
        }
      }
    ]
  });

  /* ====================================================================== */
  /* 组织招募（面试题库接口）                                                */
  /* ====================================================================== */
  D('organization_offer', {
    when: S => !!S.orgApplication && !S.affiliation,
    title: S => {
      const a = S.orgApplication;
      return a ? TL.organizationName(a.organization) + '·' + TL.organizationAdmissionName(a.organization) : '组织招募';
    },
    text: S => {
      const a = S.orgApplication;
      if (!a) return '你收到了一份组织招募信息。';
      if (a.organization === 'sir_family') return '中间人把你带到家族联络人面前。对方会试探你能否守密、认清指令来源并承担人情。加入并不保证安全，更不意味着家族的命令都正当。';
      return TL.organizationName(a.organization) + '向你开放了「' +
        TL.organizationRouteName(a.organization, a.route) +
        '」路线。对方邀请你提交材料并参加招募考核。';
    },
    options: [
      {
        label: S => S.orgApplication?.organization === 'sir_family' ? '随引荐人赴约' : '接受招募考核', hint: '通过后加入组织',
        eff: { h: 4, so: 2 },
        run(S) {
          const a = S.orgApplication;
          S.orgApplication = null;
          if (!a) return '招募信息已经失效了。';
          const result = TL.tryJoinOrganization(S, a.organization, a.route);
          if (result.status === 'interview' || result.status === 'pending') return TL.organizationAdmissionName(a.organization) + '已经开始。';
          if (result.status === 'unavailable') return '这次面谈暂缓，等待新的安排。';
          if (result.ok) {
            return '你通过了' + TL.organizationName(a.organization) + '的初步考核，加入了' +
              TL.organizationRouteName(a.organization, a.route) + '路线。';
          }
          return '考核没有通过。' + TL.organizationName(a.organization) + '暂时不会再次联系你。';
        }
      },
      {
        label: '先了解再说', hint: '保留机会，暂不加入',
        eff: { sm: 2, h: 1 },
        run(S) {
          const a = S.orgApplication;
          S.orgApplication = null;
          if (a) {
            if (!S.orgCooldowns) S.orgCooldowns = {};
            S.orgCooldowns[a.organization] = (S.year || 0) + 2;
          }
          return '你没有立刻答应，决定想清楚之后再联系。';
        }
      },
      {
        label: '拒绝', hint: '短期内不会再次收到同一邀请',
        eff: { h: -1, so: 1 },
        run(S) {
          const a = S.orgApplication;
          S.orgApplication = null;
          if (a) {
            if (!S.orgCooldowns) S.orgCooldowns = {};
            S.orgCooldowns[a.organization] = (S.year || 0) + 8;
          }
          return '你把招募信折好，放回了信封。';
        }
      }
    ]
  });

  D('career_pick', {
    once: true,
    title: '二十二岁',
    text: () => TL.L`到了该定下来的时候。你想做什么样的人？`,
    options: [
      { label: '把一件事做到极致', hint: '学识·技艺↑ 羁绊↓', eff: { sm: 6, so: -4, h: -1 }, run(S) { S.flags.careerPath = 'master'; return TL.L`你决定把时间都花在这一件事上。`; } },
      { label: '广交朋友', hint: '羁绊↑↑', eff: { so: 8, sm: -2, h: 2 }, run(S) { S.flags.careerPath = 'social'; return TL.L`你开始认真经营认识的人。`; } },
      { label: '先把钱攒够', hint: '收入↑ 其他↓', eff: { hl: -3, h: -3, so: -2, money: 3 }, run(S) { S.flags.careerPath = 'money'; return TL.L`你只想着攒钱。别的事以后再说。`; } },
      { label: '没想好，走一步看一步', hint: '均衡', eff: { h: 1, so: 1 }, run(S) { return TL.L`你没有特别想做的事。`; } }
    ]
  });

  /* ====================================================================== */
  /* 婚育                                                                    */
  /* ====================================================================== */
  D('marriage', {
    once: true,
    title: '要不要在一起',
    text: S => {
      const p = S.fam.partner;
      return p ? TL.L`你和${p.name}已经来往了一段时间。` : TL.L`有人给你介绍了对象。`;
    },
    options: [
      {
        label: '结婚', hint: '羁绊↑↑ 开销↑',
        eff: { so: 14, h: 10 },
        run(S) {
          if (!S.fam.partner) {
            const sex = S.sex === 'M' ? 'F' : 'M';
            const nm = TL.makeName(S.nation, sex, S.race);
            S.fam.partner = { name: nm.given, sex: sex, age: S.age + Math.round(TL.range(-4, 4)), alive: true, ori: null, job: TL.npcJobOf(S.nation, sex, S.race) };
          }
          S.fam.married = true;
          S.fam.marriedAt = S.age;
          S.stats.partnerCount = (S.stats.partnerCount || 0) + 1;
          const cost = TL.NATION_BY_ID[S.nation].ppp * 1.6;
          S.money = Math.max(0, S.money - cost);
          return TL.L`你们办了酒。来的人不多，但都来了。`;
        }
      },
      {
        label: '再等等', hint: '保持现状',
        eff: { h: -2, so: -2 },
        run(S) { return TL.L`你说再等等。对方说好。然后就没有下文了。`; }
      },
      {
        label: '算了', hint: '独身 心境↓ 自由↑',
        eff: { h: -6, so: -6, sm: 2 },
        run(S) { S.flags.single = 1; return TL.L`你婉拒了。之后也没有人再提。`; }
      },
      {
        label: '坦白自己的身份',
        hint: '感染者才有的选项',
        require: S => S.ori && S.ori.stage > 0,
        eff: { h: -6, so: 6 },
        run(S) {
          if (!S.fam.partner) {
            const sex = S.sex === 'M' ? 'F' : 'M';
            const nm = TL.makeName(S.nation, sex, S.race);
            S.fam.partner = { name: nm.given, sex: sex, age: S.age + Math.round(TL.range(-4, 4)), alive: true, ori: null, job: TL.npcJobOf(S.nation, sex, S.race) };
          }
          if (TL.chance(0.55)) {
            S.fam.married = true; S.fam.marriedAt = S.age;
            S.ori.known = true;
            TL.eff(S, { so: 10, h: 8 });
            return TL.L`你把袖子掀开给他看。他看了很久，然后说：「我知道。我早就知道了。」`;
          }
          S.fam.partner = null;
          TL.eff(S, { h: -14 });
          return TL.L`你说了。他站起来，说要去买包烟。他没有回来。`;
        }
      }
    ]
  });

  D('have_kid', {
    title: '要不要孩子',
    text: () => TL.L`你们谈到了孩子。`,
    options: [
      {
        label: '要', hint: '羁绊↑ 开销↑',
        eff: { so: 8, h: 6 },
        run(S) {
          // 直接触发一次生育判定，提高概率
          const old = S.fam.kids.length;
          for (let i = 0; i < 3; i++) { if (S.fam.kids.length > old) break; TL.tryBirth(S); }
          if (S.fam.kids.length === old) return TL.L`你们试了，但一直没有消息。`;
          return TL.L`家里多了一个人。`;
        }
      },
      {
        label: '不要', hint: '省下资源',
        eff: { h: -2, money: 2 },
        run(S) { S.flags.noKids = 1; return TL.L`你们决定不要。这个决定后来被反复提起。`; }
      },
      {
        label: '先看看再说',
        hint: '感染者会犹豫',
        require: S => S.ori && S.ori.stage > 0,
        eff: { h: -4 },
        run(S) { return TL.L`你查过：矿石病有可能传给孩子。你把这件事说了，两个人都没再说话。`; }
      }
    ]
  });

  /* ====================================================================== */
  /* 矿石病核心抉择                                                          */
  /* ====================================================================== */
  D('ori_disclose', {
    once: true,
    title: '要不要说出来',
    text: () => TL.L`只有你自己知道。现在你需要决定，要不要让别人也知道。`,
    options: [
      {
        label: '去登记', hint: '合法 但从此有标签',
        eff: { h: -10, so: -4 },
        run(S) { S.ori.known = true; return TL.L`你去登记了。工作人员很客气，填完表递给你一张卡片。卡片是红色的。`; }
      },
      {
        label: '瞒着', hint: '心境压力↑ 风险↑',
        eff: { h: -6, sm: 3 },
        run(S) { S.flags.hidingOri = 1; return TL.L`你把袖子放下来。这个动作你后来做了很多年。`; }
      },
      {
        label: '只告诉最亲近的人', hint: '羁绊 分担',
        eff: { so: 6, h: 4 },
        run(S) { return TL.L`你只告诉了一个人。他听完点了点头，说：「那以后我帮你记着吃药。」`; }
      }
    ]
  });

  D('ori_treatment', {
    title: '治不治',
    text: S => TL.L`抑制药剂能让结晶慢下来。但它很贵，而且要一直用下去。`,
    options: [
      {
        label: '去罗德岛', hint: '效果最好 最贵',
        require: S => TL.organizationAvailable(S, 'rhodes') && (S.money >= TL.NATION_BY_ID[S.nation].ppp * 5 || S.q >= 4),
        eff: { h: 8, hl: 3 },
        run(S) {
          S.money -= TL.NATION_BY_ID[S.nation].ppp * 5;
          S.ori.treated = true; S.ori.provider = 'rhodes';
          return TL.L`罗德岛收下了你。他们说得很清楚：这不能治好，只能让你多活很多年。`;
        }
      },
      {
        label: '找便宜的路子', hint: '便宜 有风险',
        eff: { h: 2 },
        run(S) {
          const cost = TL.NATION_BY_ID[S.nation].ppp * 0.8;
          if (S.money < cost) { TL.eff(S, { h: -6 }); return TL.L`你连黑市的钱都不够。`; }
          S.money -= cost;
          if (TL.chance(0.45)) { S.ori.treated = true; S.ori.provider = 'clinic'; return TL.L`巷子里的诊所。药是灰的，但有用。`; }
          TL.eff(S, { hl: -8 });
          return TL.L`药是假的。你打完烧了两天，之后不敢再买。`;
        }
      },
      {
        label: '不治了', hint: '省钱 加速',
        eff: { hl: -4, h: -6, money: 2 },
        run(S) { S.flags.oriGaveUp = S.age; return TL.L`你把药停了。钱留给家里。`; }
      }
    ]
  });

  D('reunion_invite', {
    organization: 'reunion',
    when: S => !S.flags.reunion && TL.canJoinOrganization(S, 'reunion', 'infected'),
    title: '他们邀请你',
    text: S => TL.L`此前接触过的感染者把你带到一处整合运动营地。他们要确认你的来意和同行的底线。这里没有固定工资，只有有限口粮；加入武装团体也意味着冲突和牵连。此处接纳仅代表这个营地，不代表所有整合派系。`,
    options: [
      {
        label: '商量同行与分工', hint: '确认能否被营地接纳；无固定工资',
        run(S) {
          const result = TL.tryJoinOrganization(S, 'reunion', 'infected');
          return result.status === 'interview' ? '你坐下来，和营地的人谈起接下来的打算。' : '当前还不能开始面谈。';
        }
      },
      {
        label: '拒绝', hint: '保持自己',
        eff: { h: -3, so: -3, sm: 2 },
        run(S) { return TL.L`你说不去。他们没为难你，只是说：「以后你还会来找我们的。」`; }
      },
      {
        label: '举报他们', hint: '可能换来一点点接纳',
        eff: { h: -8, so: -10, money: 2 },
        run(S) {
          S.flags.informer = true;
          if (TL.chance(0.5)) { S.ori.known = false; return TL.L`你去了治安局。作为交换，他们答应把你的登记记录销掉。`; }
          TL.eff(S, { hl: -10 });
          return TL.L`你去了治安局。三天后有人在你家门口等你。`;
        }
      },
      {
        label: '反过来问他们一件事',
        hint: '看清这条路',
        eff: { sm: 4, h: 2 },
        run(S) { return TL.L`你问：「加入之后，我们打的是谁？」领头的想了很久，说：「打那些不把我们当人的。」你问：「那打完之后呢？」他没回答。`; }
      }
    ]
  });

  D('ori_despair', {
    title: 'Ⅱ期之后',
    text: () => TL.L`医生说得很直接：接下来会越来越疼。`,
    options: [
      { label: '把想做的事做完', hiden: false, eff: { h: 6, sm: 3, hl: -3 }, run(S) { S.flags.bucketList = 1; return TL.L`你列了一张单子。上面第一件事是回一趟老家。`; } },
      { label: '继续照常上工', eff: { hl: -6, so: 2, money: 2 }, run(S) { return TL.L`你什么也没改。工还是要上，饭还是要吃。`; } },
      { label: '把自己关起来', eff: { h: -12, so: -12, hl: -2 }, run(S) { S.flags.withdrawn = 1; return TL.L`你开始少见人。反正见不见都一样。`; } },
      { label: '去找罗德岛', require: S => TL.organizationAvailable(S, 'rhodes') && !S.ori.treated, eff: { h: 6 }, run(S) { S.flags.seekRhodes = 1; return TL.L`你收拾了一个包，往南走。听说他们的医疗车每个月会来一次。`; } }
    ]
  });

  D('ori_last', {
    title: 'Ⅲ期',
    text: () => TL.L`结晶已经侵入主要脏器。医生说，剩下的是时间问题。`,
    options: [
      { label: '回家', eff: { so: 10, h: 8, hl: -3 }, run(S) { S.flags.wentHome = 1; return TL.L`你回了${S.city}。街还是那条街，认识你的人还剩几个。`; } },
      { label: '留在医院', eff: { hl: 4, h: -2, money: -2 }, run(S) { return TL.L`你住进了病房。至少疼的时候有人管。`; } },
      { label: '去做最后一件事', eff: { h: 10, so: 4, hl: -6 }, run(S) { return TL.L`你从医院走了出来。有一件事你一直想做，再不做就没机会了。`; } },
      { label: '把自己的经历写下来', eff: { sm: 6, so: 6, h: 6 }, run(S) { S.flags.wroteMemoir = 1; return TL.L`你开始写。写完一页撕一页，最后留下的那些，你交给了隔壁的孩子。`; } }
    ]
  });

  D('hide_blood', {
    once: true,
    title: '把角藏起来',
    text: () => TL.L`在这个国家，萨卡兹的身份会让很多事情变得困难。你可以把它藏起来。`,
    options: [
      { label: '藏', eff: { h: -6, sm: 3 }, run(S) { S.flags.hidingBlood = 1; return TL.L`你开始戴帽子。冬天可以，夏天很热。`; } },
      { label: '不藏', eff: { so: 6, h: 4, hl: -2 }, run(S) { S.flags.proud = 1; return TL.L`你照旧出门。被看就被看。`; } },
      { label: '只对自己人露出角', eff: { so: 8, h: 5 }, run(S) { return TL.L`你找到了一小群和你一样的人。在他们面前，你不戴帽子。`; } }
    ]
  });

  /* ====================================================================== */
  /* 天灾                                                                    */
  /* ====================================================================== */
  D('catastrophe_warn', {
    once: false,
    title: '警报',
    text: S => TL.L`天灾信使敲响了钟。整座移动城市开始预热。`,
    options: [
      {
        label: '立刻撤到安置区', hint: '安全 但可能失去家当',
        eff: { hl: -2, h: -4 },
        run(S) {
          S.flags.drill = 1;
          S.flags.postCatastrophe = 1;
          TL.eff(S, { so: 2 });
          return TL.L`你带着能拿的东西走了。回头看的时候，那片街区正在被划进红线。`;
        }
      },
      {
        label: '回去拿东西', hint: '可能保住财产 风险极高',
        eff: {},
        run(S) {
          if (TL.chance(0.55)) {
            const save = TL.NATION_BY_ID[S.nation].ppp * 2;
            S.money += save;
            TL.eff(S, { hl: -12, h: -8 });
            return TL.L`你冲回去了。东西抢出来了，但你在粉尘里待了太久。`;
          }
          TL.eff(S, { hl: -28, h: -14 });
          if (TL.chance(0.3)) { TL.die(S, 'cat'); return TL.L`你没能出来。`; }
          return TL.L`你被埋在下面两个小时才被挖出来。`;
        }
      },
      {
        label: '去帮别人', hint: '羁绊↑↑ 危险↑',
        eff: { so: 10, h: 5 },
        run(S) {
          TL.eff(S, { hl: -10 });
          S.flags.hero = (S.flags.hero || 0) + 1;
          if (TL.tryInfect(S, 7)) return TL.L`你把三个人背了出来。第四趟的时候，你踩到了一块亮晶晶的石头。`;
          return TL.L`你帮着抬了一夜的人。天亮的时候手指已经没有知觉了。`;
        }
      }
    ]
  });

  /* ====================================================================== */
  /* 职业与财务                                                              */
  /* ====================================================================== */
  D('job_offer', {
    title: '别的机会',
    text: S => TL.L`有人来找你，说换一份工作能挣得更多——但要离开${S.city}。`,
    options: [
      {
        label: '去', hint: '收入↑ 羁绊↓',
        eff: { so: -6, sm: 2, money: 2 },
        run(S) {
          S.city = TL.cityOf(S.nation);
          S.flags.migrations = (S.flags.migrations || 0) + 1;
          const j = TL.rollJob(S);
          if (j) S.job = j;
          return TL.L`你去了${S.city}。新工钱确实高了一些。`;
        }
      },
      { label: '留下', hint: '稳定', eff: { so: 4, h: 2 }, run(S) { return TL.L`你没去。这边虽然钱少，但认识的人都在。`; } },
      {
        label: '谈条件', hint: '学识决定成败',
        eff: {},
        run(S) {
          if (TL.chance(TL.clamp(S.st.sm / 130, 0.1, 0.7))) {
            TL.eff(S, { money: 3, h: 6 });
            return TL.L`你把条件摆了出来。对方愣了一下，然后答应了。`;
          }
          TL.eff(S, { h: -4 });
          return TL.L`你谈了。对方笑着说「那我们再找别人」。`;
        }
      }
    ]
  });

  D('buy_home', {
    title: '买房子',
    text: S => TL.L`你攒下了一笔钱。有人劝你买下来，别再租了。`,
    options: [
      {
        label: '买', hint: '资产↑ 负债↑',
        eff: { h: 6, so: 3 },
        run(S) {
          const price = TL.NATION_BY_ID[S.nation].ppp * 12;
          if (S.money >= price) { S.money -= price; S.flags.homeValue = price; return TL.L`你买下了一间小屋子。钥匙拿到手那天，你在门口站了很久。`; }
          S.debt += price * 0.7; S.flags.homeValue = price;
          return TL.L`你付了首付，剩下的分二十年还。`;
        }
      },
      { label: '继续租', hint: '灵活 无资产', eff: { h: -2 }, run(S) { return TL.L`你继续租房。房东说下个月要涨。`; } }
    ]
  });

  D('burnout', {
    title: '撑不住了',
    text: () => TL.L`你已经很久没有睡过一个整觉。`,
    options: [
      { label: '请一段时间假', eff: { hl: 8, h: 8, money: -2 }, run(S) { return TL.L`你停了两个月。刚开始很不习惯，后来就习惯了。`; } },
      { label: '硬撑', eff: { hl: -10, h: -8, money: 2 }, run(S) { return TL.L`你继续。反正停下来也没人替你。`; } },
      { label: '换个活法', eff: { h: 6, so: -4, money: -3 }, run(S) { const j = TL.rollJob(S); if (j) S.job = j; return TL.L`你把工作辞了。新活钱少，但天黑了就是天黑了。`; } }
    ]
  });

  D('migrate_chance', {
    title: '离开这里',
    text: S => TL.L`有人说，在别的地方，像你这样的人过得会好一些。`,
    options: [
      {
        label: '走', hint: '环境变 一切重来',
        eff: { so: -10, sm: 3, h: 4 },
        run(S) {
          const opts = S.race === 'sarkaz' ? ['KDZ', 'CLB', 'LEI'] : ['CLB', 'VIC', 'YAN', 'LMN', 'LEI', 'KAZ', 'SST'];
          const dest = TL.pick(opts.filter(x => x !== S.nation)) || 'CLB';
          S.nation = dest;
          S.city = TL.cityOf(dest);
          S.flags.migrations = (S.flags.migrations || 0) + 1;
          TL.applyPace(S, S.paceKey);
          return TL.L`你去了${TL.NATION_BY_ID[dest].name}。语言不太一样，别的都得重新学。`;
        }
      },
      { label: '留下', hint: '守住已有的', eff: { so: 5, h: -2 }, run(S) { return TL.L`你没走。这里再不好，也是你认识的唯一一个地方。`; } }
    ]
  });

  D('elder_legacy', {
    title: '留下什么',
    text: S => TL.L`你已经不年轻了。有些事得开始想。`,
    options: [
      { label: '把东西留给家人', eff: { so: 8, h: 6 }, run(S) { S.flags.will = 'family'; return TL.L`你把能留的都留给了他们。`; } },
      { label: '捐出去', eff: { so: 4, h: 10 }, run(S) { S.flags.will = 'charity'; S.money = Math.max(0, S.money - TL.NATION_BY_ID[S.nation].ppp * 4); return TL.L`你捐给了一家收治感染者的诊所。`; } },
      { label: '写下来', eff: { sm: 5, h: 8, so: 4 }, run(S) { S.flags.will = 'memoir'; S.flags.wroteMemoir = 1; return TL.L`你开始写自己的一生。写得很慢，因为很多事你已经记不清了。`; } },
      { label: '什么也不留', eff: { h: -4 }, run(S) { return TL.L`你没做任何安排。`; } }
    ]
  });

  D('conscription', {
    title: '征兵令',
    text: S => TL.L`${TL.NATION_BY_ID[S.nation].name}在征兵。`,
    options: [
      {
        label: '去', eff: { hl: 4, h: -8, so: -4 },
        run(S) { S.serveLeft = Math.round(TL.range(3, 8)); S.flags.lastJob = S.job; S.job = 'soldier'; return TL.L`你报了名。发下来的军装有点大。`; }
      },
      {
        label: '想办法不去', eff: { money: -3, h: -4, sm: 2 },
        run(S) {
          if (TL.chance(TL.clamp(0.3 + S.st.sm / 200 + (S.q - 3) * 0.12, 0.1, 0.85))) {
            return TL.L`你花钱找了门路。名单上没有你。`;
          }
          S.serveLeft = Math.round(TL.range(3, 8)); S.flags.lastJob = S.job; S.job = 'soldier';
          TL.eff(S, { hl: -4 });
          return TL.L`你没躲过去。而且因为「态度问题」，被分到了最前面。`;
        }
      },
      {
        label: '逃', eff: { h: -10, so: -6, hl: -4 },
        run(S) { S.refugee = true; S.job = 'seeking'; return TL.L`你连夜走了。从此不能回去。`; }
      }
    ]
  });

  D('ori_job_loss', {
    title: '他们知道了',
    text: () => TL.L`你的感染状态被公开了。`,
    // 只有真正在职的感染者才会被「撤下岗位」；退休与未就业者不会被这个抉择辞退。
    when: S => TL.canBeDismissed(S) && !TL.organizationBlocksEvent?.(S, 'ori_job_loss'),
    options: [
      {
        label: '接受处理', eff: { h: -12, so: -6 },
        run(S) { TL.dismissFromJob(S); return TL.L`你被从岗位上撤了下来。`;
        }
      },
      {
        label: '申诉', require: S => S.st.sm > 50,
        eff: { h: -4 },
        run(S) {
          if (TL.chance(TL.clamp(S.st.sm / 180, 0.1, 0.6))) { TL.eff(S, { money: 2 }); return TL.L`你写了申诉。三个月后，他们同意让你回去——但换了个岗位。`; }
          TL.dismissFromJob(S);
          return TL.L`申诉被驳回了。理由只有一行字。`;
        }
      },
      {
        label: '自己走', eff: { h: -6, so: 2, sm: 2 },
        run(S) { TL.dismissFromJob(S); return TL.L`你没等他们动手，自己递了辞呈。`;
        }
      }
    ]
  });

  /* ====================================================================== */
  /* 重复节奏：once / cd                                                     */
  /* ====================================================================== */
  /**
   * 哪些抉择一生只问一次，哪些可以重复但要隔几年。
   * 没有这张表时，「要不要孩子」会在 26~42 岁每年弹一次，
   * 一生被问十几遍同样的问题，日志里全是同一行。
   */
  const ONCE = [
    'buy_home', 'elder_legacy', 'ori_job_loss', 'reunion_invite',
    'ori_despair', 'ori_last'
  ];
  const CD = {
    have_kid: 5,
    job_offer: 12,
    burnout: 10,
    migrate_chance: 12,
    conscription: 6,
    catastrophe_warn: 9,
    ori_treatment: 6
  };
  for (const id of ONCE) if (TL.DECISIONS[id]) TL.DECISIONS[id].once = true;
  for (const id in CD) if (TL.DECISIONS[id]) TL.DECISIONS[id].cd = CD[id];

})(window.TL = window.TL || {});
