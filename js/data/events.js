/* ==========================================================================
 * TERRA LIFE SIM — 事件库
 * --------------------------------------------------------------------------
 * 对应原作的 EVMAP。每个事件是一个 { title, book, when, run } 对象：
 *   when(S) → 是否允许触发
 *   run(S, p) → 返回叙事字符串，或 {t:文本, k:类别, f:数据}
 *
 * 事件按主题分八组：
 *   ① 童年与家庭  ② 求学  ③ 职业  ④ 疾病与身体
 *   ⑤ 矿石病（核心）⑥ 天灾  ⑦ 战争与动荡  ⑧ 迁徙与身份
 * ========================================================================== */
(function (TL) {
  'use strict';

  TL.EVMAP = {};

  /** 注册事件。w = 被抽中的相对权重（默认 1；日常事件给高权重以稀释伤害类事件） */
  function def(id, o) { o.id = id; if (o.w == null) o.w = 1; TL.EVMAP[id] = o; return o; }

  /** 便捷：按权重取一个可用事件 id（对应原作的事件抽取，但带权重、冷却与次数上限） */
  function pickFrom(S, ids) {
    const ok = [];
    for (const id of ids) {
      const e = TL.EVMAP[id];
      if (!TL.contentAvailable(S, e)) continue;
      // 次数上限：一个人一生中同一件事最多发生几次。
      // 这一条是控制「日志读起来像卡带」最有效的机制 ——
      // 光靠冷却不够，因为人生可以很长（60~80 年），
      // 冷若 3 年的事件在一局里仍会出现十几次。
      const maxN = e.max == null ? 2 : e.max;
      const n = (S.evCount && S.evCount[id]) || 0;
      if (n >= maxN) continue;
      if (e.when && !e.when(S)) continue;
      const cd = e.cd == null ? 4 : e.cd;
      const last = S.flags['ev_' + id];
      if (cd > 0 && last != null && S.age - last < cd) continue;
      // 已经发生过的事件权重衰减，新鲜事件优先
      let w = e.w;
      if (n > 0) w *= Math.pow(0.45, n);
      if (last != null) {
        const since = S.age - last;
        if (since < 12) w *= 0.3 + 0.06 * since;
      }
      ok.push({ id: id, w: w });
    }
    if (!ok.length) return null;
    return TL.wpickArr(ok, 'w').id;
  }
  TL.pickEvent = pickFrom;

  /* ====================================================================== */
  /* ① 童年与家庭                                                            */
  /* ====================================================================== */
  def('child_play', {
    title: '街上的孩子', book: '童年',
    when: S => S.age >= 4 && S.age <= 12,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      if (S.urban) {
        TL.eff(S, { so: 4, h: 4 });
        return TL.L`你和巷子里的孩子们玩到天黑。没有人问你是哪个种族的。`;
      }
      TL.eff(S, { so: 3, h: 4, hl: 2 });
      return TL.L`你在${S.city}外的野地里跑了一整天，回家时鞋上全是泥。`;
    }
  });

  def('child_work', {
    title: '第一份活计', book: '童年',
    when: S => S.age >= 7 && S.age <= 14 && (S.q <= 2 || TL.NATION_BY_ID[S.nation].ppp < 0.6),
    run(S) {
      const earn = TL.NATION_BY_ID[S.nation].ppp * 0.8;
      S.money += earn;
      TL.eff(S, { hl: -3, sm: -1, so: 2, h: -2 });
      const jobs = ['在矿口筛石子', '替人看摊', '给铁匠拉风箱', '在码头搬货', '跟着大人下地'];
      return TL.L`你${TL.pick(jobs)}，一天挣了几个铜板。回家时母亲把钱数了两遍。`;
    }
  });

  def('child_sick', {
    title: '一场高烧', book: '童年',
    // 每个童年只生一次大病，否则体质永远追不上同龄基准
    when: S => S.age >= 1 && S.age <= 10 && !S.flags.hadChildSick,
    run(S) {
      S.flags.hadChildSick = S.age;
      const n = TL.NATION_BY_ID[S.nation];
      // 医疗水平决定这次是「一场病」还是「一道坎」
      if (TL.chance(n.med)) {
        TL.eff(S, { hl: -6, h: -4 });
        return TL.L`你烧了三天。医生开的药很苦，但第四天你退了烧。`;
      }
      TL.eff(S, { hl: -13, h: -8 });
      S.flags.weakChild = 1;
      if (TL.chance(0.18)) {
        TL.eff(S, { hl: -6 });
        return TL.L`烧退下去之后，你的左耳再也听不清了。家里没有钱再请一次医生。`;
      }
      return TL.L`你烧了很久。没有人请医生——请不起。你自己挺了过来。`;
    }
  });

  def('parent_fight', {
    title: '夜里的争吵', book: '家庭',
    when: S => S.age >= 4 && S.age <= 16 && S.fam.mom.alive && S.fam.dad.alive,
    run(S) {
      TL.eff(S, { h: -7, so: -3 });
      const lines = [
        TL.L`他们在隔壁房间吵。你听得清每一个字，但假装睡着了。`,
        TL.L`母亲说钱不够，父亲说他知道。然后两个人都不说话了。`,
        TL.L`争吵到一半突然停下——他们想起来你还在屋里。`
      ];
      return TL.pick(lines);
    }
  });

  def('parent_kind', {
    title: '少见的温柔', book: '家庭',
    when: S => S.age >= 4 && S.age <= 18,
    run(S) {
      TL.eff(S, { h: 8, so: 6 });
      return TL.L`父亲今天回来得很早，还带了一小块糖。他没说什么，放在你桌上就走了。`;
    }
  });

  def('sibling_born', {
    title: '多了个人', book: '家庭',
    when: S => S.age >= 2 && S.age <= 14 && S.fam.sibs.length < 5,
    run(S) {
      const sex = TL.chance(0.512) ? 'M' : 'F';
      const nm = TL.makeName(S.nation, sex, S.race);
      S.fam.sibs.push({ name: nm.given, sex: sex, age: 0, alive: true });
      TL.eff(S, { h: 3, so: 4 });
      return TL.L`家里多了个${sex === 'M' ? '弟弟' : '妹妹'}，叫${nm.given}。从此你不再是屋里最小的那个。`;
    }
  });

  def('discriminated_child', {
    title: '不该在这里玩', book: '歧视',
    when: S => S.age >= 5 && S.age <= 14 && TL.discrimination(S) > 0.35,
    run(S) {
      const d = TL.discrimination(S);
      TL.eff(S, { h: -9, so: -4 });
      if (S.race === 'sarkaz') {
        return TL.L`一个大人在巷口拦住你，看清你的角之后，把手里的面包收了回去。「萨卡兹。」他说。就这两个字。`;
      }
      if (S.race === 'oni') {
        return TL.L`孩子们本来在玩，看见你就散了。有个小的跑之前回头看了你一眼——不是害怕，是好奇。那更难受。`;
      }
      return TL.L`你被从游戏里赶了出来。理由说得很客气，但意思很明白。`;
    }
  });

  /* ====================================================================== */
  /* ② 求学                                                                  */
  /* ====================================================================== */
  def('school_good', {
    title: '被看见', book: '求学',
    when: S => S.school && S.st.sm > 55,
    run(S) {
      TL.eff(S, { sm: 4, h: 6, so: 2 });
      return TL.L`教习在你的作业本上写了一行字，还念给全班听。你把那一页留了很多年。`;
    }
  });

  def('school_bad', {
    title: '跟不上', book: '求学',
    when: S => S.school && S.st.sm < 40,
    run(S) {
      TL.eff(S, { h: -7, sm: -1 });
      return TL.L`你又一次没答上来。教习没有骂你，只是让你坐下。这比骂更让人想消失。`;
    }
  });

  def('school_fee', {
    title: '学费', book: '求学',
    when: S => S.school && S.q <= 2 && S.age >= 10,
    run(S) {
      TL.eff(S, { h: -8, so: -2 });
      S.flags.schoolDebt = 1;
      return TL.L`学费又涨了。母亲把柜子底下的布包翻了三遍，然后说「再读一年」。`;
    }
  });

  def('teacher_notice', {
    title: '有人替你说话', book: '求学',
    when: S => S.school && TL.totalDiscrimination(S) > 0.3,
    run(S) {
      TL.eff(S, { h: 10, sm: 3, so: 4 });
      return TL.L`教习当着全班的面说：「他的成绩比你们都高。谁再拿他的角说事，就站到外面去。」`;
    }
  });

  def('arts_awaken', {
    title: '第一次施术', book: '技艺',
    when: S => S.age >= 8 && S.age <= 20 && S.arts >= 45 && !S.flags.artsAwake,
    run(S) {
      S.flags.artsAwake = S.age;
      TL.eff(S, { arts: 5, h: 8, hl: -2 });
      const forms = [
        TL.L`你盯着桌上的杯子，它动了。只有一点点，但你看见了。`,
        TL.L`你伸手去接落下的碗，碗在半空停了一瞬。你自己吓了一跳。`,
        TL.L`源石碎片在你掌心发热，然后浮起来，绕着你转了一圈。`
      ];
      return TL.pick(forms);
    }
  });

  def('arts_accident', {
    title: '收不住手', book: '技艺',
    when: S => S.age >= 12 && TL.artRank(S) >= 2 && TL.chance(0.5),
    run(S) {
      const bad = TL.chance(0.55);
      if (bad) {
        TL.eff(S, { hl: -10, h: -4 });
        // 施术事故是一次高强度暴露，但结果仍由统一的感染模型裁定
        if (TL.expose(S, 'active_dust')) return TL.L`术式反噬得很快。你的手臂上留下了一道疤——以及疤下面一点点黑色的东西。`;
        return TL.L`术式在你手里炸开了。没人受伤，除了你自己。`;
      }
      TL.eff(S, { arts: 4, sm: 2 });
      return TL.L`你第一次完整地走完了一整套术式。手指在抖，但那是兴奋。`;
    }
  });

  /* ====================================================================== */
  /* ③ 职业                                                                  */
  /* ====================================================================== */
  def('job_found', {
    title: '找到活干', book: '职业',
    when: S => S.job === 'seeking' || (S.age >= 16 && !TL.isWorking(S) && !S.school),
    run(S) {
      const j = TL.rollJob(S);
      if (!j) return TL.L`你跑了三天，没有人招工。`;
      S.job = j;
      TL.eff(S, { h: 5, so: 2 });
      return TL.L`你在${S.city}找到了活：${TL.JOBS[j].name}。`;
    }
  });

  def('job_promote', {
    title: '被提拔', book: '职业',
    when: S => TL.isWorking(S) && S.age >= 20 && S.st.sm > 60 && TL.chance(0.5),
    run(S) {
      TL.eff(S, { h: 8, sm: 2 });
      S.flags.promoted = (S.flags.promoted || 0) + 1;
      if (S.affiliation) {
        // 组织晋升在年末合同结算后统一生效；事件只记录绩效，避免
        // 当年现金账本按旧工资结算而快照却显示新工资。
        return '你的组织履历记录了这次表现，晋升将在年度评审时处理。';
      }
      if (S.opClass) S.opRank = Math.min(4, S.opRank + 1);
      const J = TL.JOBS[S.job];
      if (J && J.cls) return TL.L`你的档案上多了一行字。${TL.OP_RANKS[S.opRank].name}——从今天起，别人这样叫你。`;
      return TL.L`工头把你叫到一边，说下个月起你的工钱加两成。`;
    }
  });

  def('job_lost', {
    title: '没了', book: '职业',
    when: S => TL.isWorking(S) && S.age >= 18 && !TL.organizationBlocksEvent?.(S, 'job_lost') && TL.chance(0.5),
    run(S) {
      // 歧视与感染者身份显著抬高被裁概率
      const d = TL.totalDiscrimination(S);
      if (TL.chance(d * 0.8 + 0.2)) {
        S.flags.lastJob = S.job;
        S.job = 'seeking';
        TL.eff(S, { h: -12, so: -3 });
        if (S.ori && S.ori.known) {
          return TL.L`厂里统一体检。三天后你收到一张纸，上面写着「因健康原因不再续用」。`;
        }
        if (S.race === 'sarkaz') return TL.L`裁员名单上有你。你问为什么，对方说「你心里清楚」。`;
        return TL.L`活没了。理由说了一堆，你只听懂最后一句「明天不用来了」。`;
      }
      TL.eff(S, { h: -4 });
      return TL.L`这个月工钱少了一半。老板说行情不好，让大家一起扛。`;
    }
  });

  def('work_injury', {
    title: '工伤', book: '职业',
    // 重伤不该每几年就来一次。加冷却，让体质有机会恢复。
    when: S => TL.isWorking(S) && TL.JOBS[S.job] && Object.keys(TL.JOBS[S.job].risk || {}).length > 0
                && (S.flags.lastInjury == null || S.age - S.flags.lastInjury >= 6),
    run(S) {
      S.flags.lastInjury = S.age;
      const J = TL.JOBS[S.job];
      const risk = J.risk || {};
      const cause = Object.keys(risk)[0] || 'inj';
      const sev = TL.chance(0.25) ? 2 : 1;
      TL.eff(S, { hl: -6 * sev, h: -4 });
      const comp = TL.chance(TL.NATION_BY_ID[S.nation].med) ? TL.NATION_BY_ID[S.nation].ppp * 1.5 : 0;
      if (comp) S.money += comp;
      const lines = {
        inj: TL.L`机器夹住了你的手。工友把你送到医馆，指头保住了，但不太听使唤。`,
        fall: TL.L`脚手架断了一根。你从两层高的地方摔下来，醒来时人在医馆。`,
        ori: TL.L`爆破后的粉尘没散，你们就被叫下去清渣。那天晚上你咳出的痰是灰的。`,
        cat: TL.L`天灾预警来得太晚。你们往外跑的时候，头顶的钢架塌了。`
      };
      return lines[cause] || TL.L`你在干活的时候受了伤。`;
    }
  });

  def('wage_theft', {
    title: '扣工钱', book: '职业',
    when: S => TL.isWorking(S) && S.q <= 3 && !TL.organizationBlocksEvent?.(S, 'wage_theft') && TL.chance(0.5),
    run(S) {
      TL.eff(S, { h: -6, so: -2 });
      return TL.L`月底结账，数目对不上。你去问，对方说「规矩就是这样」。`;
    }
  });

  def('biz_chance', {
    title: '一个机会', book: '职业',
    when: S => TL.isWorking(S) && S.age >= 25 && S.money > TL.NATION_BY_ID[S.nation].ppp * 3,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      const cost = n.ppp * 2.5;
      S.money -= cost;
      if (TL.chance(0.38 + S.st.sm / 300 + (S.q - 3) * 0.05)) {
        const gain = cost * TL.range(2.2, 6.0);
        S.money += gain;
        TL.eff(S, { h: 10, so: 3 });
        return TL.L`你把这几年攒下的钱全押了进去。半年后，账上多了一笔你从没见过的数目。`;
      }
      TL.eff(S, { h: -14, so: -4 });
      return TL.L`钱赔光了。对方连夜搬走了，只留下一间空铺子。`;
    }
  });

  /* ====================================================================== */
  /* ④ 疾病与身体                                                            */
  /* ====================================================================== */
  def('illness', {
    title: '身体出问题', book: '健康',
    when: S => S.age >= 25 && Object.keys(S.conds).length < 3,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      const keys = ['htn', 'dm', 'heart', 'copd', 'kid'];
      const names = { htn: '高血压', dm: '代谢病', heart: '心脏问题', copd: '慢性肺病', kid: '肾脏问题' };
      // 只挑还没得的病，避免同一个病反复「首次确诊」
      const free = keys.filter(k => !S.conds[k]);
      if (!free.length) return TL.L`复查结果和上次一样。医生让你按时吃药。`;
      const k = TL.pick(free);
      S.conds[k] = { since: S.age, treated: TL.chance(n.med * 0.8) };
      TL.eff(S, { hl: -6, h: -4 });
      if (S.conds[k].treated) return TL.L`体检查出了${names[k]}。医生开了药，说控制住就没事。`;
      return TL.L`体检查出了${names[k]}。医生开了药，你算了算价钱，说下次再来。`;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 慢病发病：对应原作的 ncdYear                                             */
  /* ---------------------------------------------------------------------- */
  /**
   * 慢性病不能靠「事件池」抽，否则一个人一辈子会得五六种病。
   * 这里改成独立的年发病风险：随年龄上升，受吸烟/饮酒/贫困/体质影响，
   * 且总数封顶 3 种。这样体质才能长期稳定在同龄基准附近。
   */
  TL.ncdRisk = function (S) {
    const a = S.age;
    if (a < 30) return 0;
    const n = TL.NATION_BY_ID[S.nation];
    // 年龄基线：30 岁起步，每 10 年翻一倍多一点
    let p = 0.0035 * Math.pow(1.085, a - 30);
    if (S.smoker) p *= 2.2;
    if (S.alc) p *= 1.5;
    p *= 1 + (3 - S.q) * 0.18;                 // 贫困
    p *= 1.35 - S.st.hl / 260;                 // 体质好则少
    p *= 1.25 - n.med * 0.35;                  // 医疗可及性（体检能早发现）
    if (S.ori && S.ori.stage >= 2) p *= 1.4;
    return TL.clamp(p, 0, 0.14);
  };

  TL.ncdYear = function (S) {
    if (S.age < 30) return;
    if (Object.keys(S.conds).length >= 3) return;
    if (!TL.chance(TL.ncdRisk(S))) return;
    const e = TL.EVMAP['illness'];
    if (e && e.run) {
      const r = e.run(S);
      if (typeof r === 'string') TL.log(S, r, 'ev', { key: 'illness' });
    }
  };


  def('injury_accident', {
    title: '意外', book: '健康',
    when: S => S.age >= 6 && (S.flags.lastAccident == null || S.age - S.flags.lastAccident >= 5),
    run(S) {
      S.flags.lastAccident = S.age;
      const r = TL.rnd();
      if (r < 0.3) { TL.eff(S, { hl: -9 }); return TL.L`你从台阶上摔了下来，断了一根肋骨。`; }
      if (r < 0.55) { TL.eff(S, { hl: -5, h: -3 }); return TL.L`一辆车擦着你过去。你在地上坐了很久才站起来。`; }
      if (r < 0.75) { TL.eff(S, { hl: -3 }); return TL.L`你被开水烫了半条胳膊。疼了一个月。`; }
      TL.eff(S, { hl: -2 }); return TL.L`没什么大事，只是扭了脚。`;
    }
  });

  def('mental_low', {
    title: '提不起劲', book: '心理',
    when: S => S.age >= 14 && S.st.h < 40,
    run(S) {
      TL.eff(S, { h: -6, hl: -3, so: -2 });
      const lines = [
        TL.L`你开始记不清上一次觉得高兴是什么时候。`,
        TL.L`你躺着，看着天花板。天从黑变亮，你一动没动。`,
        TL.L`有人跟你说话，你听见了，但隔着一层什么东西。`
      ];
      return TL.pick(lines);
    }
  });

  def('smoke_start', {
    title: '第一支烟', book: '习惯',
    // 一生只「开始」一次；是否上瘾按该国的成人吸烟率决定。
    // 否则事件池会反复抽中它，把终生吸烟率推到 80% 以上，寿命被凭空压低十几岁。
    when: S => !S.smoker && !S.flags.smokeTried && S.age >= 14 && S.age <= 40,
    run(S) {
      S.flags.smokeTried = S.age;
      const n = TL.NATION_BY_ID[S.nation];
      let p = n.smk / 100 * 0.92;
      if (S.st.h < 45) p += 0.10;
      if (S.q <= 2) p += 0.06;
      if (S.ori && S.ori.stage > 0) p += 0.05;
      if (TL.chance(TL.clamp(p, 0.02, 0.85))) {
        S.smoker = true;
        TL.eff(S, { h: 3 });
        return TL.L`工友递过来一支。你接了过去。以后就戒不掉了。`;
      }
      return TL.L`有人递烟给你，你摆手说不会。`;
    }
  });

  def('drink_start', {
    title: '酒', book: '习惯',
    when: S => !S.alc && !S.flags.drinkTried && S.age >= 16,
    run(S) {
      S.flags.drinkTried = S.age;
      const n = TL.NATION_BY_ID[S.nation];
      // 泰拉大多数地方都喝酒；这里判定的是「喝到成瘾」
      const p = TL.clamp(n.alc * 0.34 + (S.st.h < 40 ? 0.08 : 0), 0.03, 0.60);
      if (TL.chance(p)) {
        S.alc = true;
        TL.eff(S, { h: 3, so: 3, hl: -2 });
        return TL.L`你开始喝。一开始是为了暖身子，后来就不是了。`;
      }
      return TL.L`你喝了两杯就停了。旁边的人笑你不像个大人。`;
    }
  });

  def('quit_smoke', {
    title: '戒了', book: '习惯',
    when: S => S.smoker && S.st.hl < 55 && S.age >= 25,
    run(S) {
      S.smoker = false;
      S.flags.exSmoker = 1;
      TL.eff(S, { h: -4, hl: 4 });
      return TL.L`你把剩下的半包扔了。头一个月很难熬，之后就好了。`;
    }
  });

  /* ====================================================================== */
  /* ⑤ 矿石病（核心）                                                        */
  /* ====================================================================== */
  def('ori_expose', {
    title: '尘', book: '矿石病',
    when: S => !S.ori && S.age >= 6,
    run(S, p) {
      const type = p && p.type ? p.type : TL.exposureTypeFor(S);
      TL.expose(S, type, { guaranteed: true });
      const route = type === 'active_dust' ? '天灾过后，你们被派去清理废墟。地上的源石碎得像玻璃。'
        : type === 'refinery_leak' ? '精炼炉的密封圈爆了。你们戴着布口罩往外跑，白色的粉尘糊了一脸。'
        : type === 'mine_contact' ? '爆破面刚刚清完，粉尘还没落，你们就下去了。'
        : type === 'stable_crystal' ? '你加工了一批已经固化的源石。结晶本身没有动，搬运时却有一片碎屑划开了手套。'
        : '你在路边捡到一块漂亮的黑色石头，揣在兜里揣了一整天。';
      return TL.L`${route} 手上的那块黑斑洗不掉。`;
    }
  });

  /* 急性暴露：一次高强度的源石接触。它不直接判定感染，
     而是把当年的感染风险大幅抬高 —— 由 oriRisk 的随机判定决定结果。 */
  def('ori_acute', {
    title: '一次暴露', book: '矿石病',
    when: S => !S.ori && S.age >= 6,
    run(S) {
      const type = TL.exposureTypeFor(S);
      const infected = TL.expose(S, type);
      TL.eff(S, { hl: -4, h: -3 });
      const lines = [
        TL.L`井下塌方，你被困在渗出源石的岩层里六个小时。出来的时候，你觉得嘴里有铁锈味。`,
        TL.L`精炼炉的密封圈爆了。你们戴着布口罩往外跑，白色的粉尘糊了一脸。`,
        TL.L`你徒手搬了一整天的源石原矿。晚上洗手的时候，指甲缝里的黑洗不掉。`
      ];
      const line = TL.pick(lines);
      return infected ? line : line + ' 这次你及时离开了现场，检查结果暂时没有显示感染。';
    }
  });

  def('ori_diagnosis', {
    title: '体检结果', book: '矿石病',
    when: S => S.ori && !S.ori.known && S.age >= 8,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      // 医疗水平高的地方更容易被发现，也更容易被登记
      if (!TL.chance(0.35 + n.med * 0.4)) {
        return TL.L`你躲过了这次体检，把袖子一直拉到手背。`;
      }
      S.ori.known = true;
      TL.eff(S, { h: -12, so: -6 });
      if (S.nation === 'URS') return TL.L`体检报告递上去的第二天，你就被通知去「专门的居住区」报到。`;
      if (S.nation === 'RMB') return TL.L`医生看了一眼就把本子合上了，压低声音说：「别去厂医院，去工会那家。」`;
      return TL.L`体检单上盖了一个红章。从此你的档案里多了一栏。`;
    }
  });

  def('ori_pain', {
    title: '疼', book: '矿石病',
    when: S => S.ori && S.ori.stage >= 2,
    run(S) {
      TL.eff(S, { hl: -5, h: -7 });
      const lines = [
        TL.L`结晶顶到了骨缝。疼起来的时候，你只能蹲下来等它过去。`,
        TL.L`夜里疼醒了。你摸黑坐着，数自己还能动的手指。`,
        TL.L`左手已经不太听使唤了。你开始练习用右手做所有事。`
      ];
      return TL.pick(lines);
    }
  });

  def('ori_kindness', {
    title: '有人不躲', book: '矿石病',
    when: S => S.ori && S.ori.known && S.age >= 10,
    run(S) {
      TL.eff(S, { h: 14, so: 8 });
      const lines = [
        TL.L`卖饼的老板娘照旧把饼递给你，还多给了一个。「别多想。」她说。`,
        TL.L`一个孩子跑过来问你手上的石头会不会发光。他母亲远远喊他，他没动。`,
        TL.L`诊所的老医师给你看完病，没收钱，只说「下次早点来」。`
      ];
      return TL.pick(lines);
    }
  });

  def('ori_work_ban', {
    title: '不能干了', book: '矿石病',
    when: S => S.ori && S.ori.known && TL.isWorking(S) && S.age >= 16,
    run(S) {
      const employment = S.affiliation && TL.organizationEmploymentModel?.(S.affiliation);
      if (employment?.medicalAccommodation && S.job === S.orgJob) {
        TL.eff(S, { h: -3, so: -1 });
        return TL.L`组织启动了医疗安置流程，为你调整了工作区域并保留合同。`;
      }
      const d = TL.oriStigma(S);
      if (TL.chance(d + 0.25)) {
        S.flags.lastJob = S.job;
        S.job = 'seeking';
        TL.eff(S, { h: -16, so: -4 });
        const lines = [
          TL.L`厂门口的告示换了新的：禁止感染者入内。你站在那儿看了一会儿，然后回去了。`,
          TL.L`工头把你的工牌收走，塞了两天工钱在手里。「不是我要赶你。」他说。`,
          TL.L`商会的规定下来了——感染者不得从事本行。你做了十几年的手艺，一夜之间不能做了。`
        ];
        return TL.pick(lines);
      }
      TL.eff(S, { h: -3 });
      return TL.L`老板装作没看见你袖子下的手。你知道这份工做不长了。`;
    }
  });

  def('ori_rhodes', {
    title: '罗德岛', book: '矿石病',
    when: S => S.ori && S.ori.stage >= 1 && !S.ori.treated,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      // 罗德岛的药品昂贵，但确实有效
      const cost = n.ppp * 3.2;
      if (S.money >= cost * 2 || S.q >= 4) {
        S.money -= cost;
        S.ori.treated = true;
        S.ori.provider = 'rhodes';
        TL.eff(S, { h: 12, hl: 4 });
        return TL.L`罗德岛的医疗车停在城外。他们给你做了检查，开了抑制药剂，还教你怎么自己注射。药很贵。但这是第一次有人告诉你：你还能活很久。`;
      }
      TL.eff(S, { h: -4 });
      return TL.L`罗德岛的医疗车来过，但药要钱。你在车外站了很久，然后走了。`;
    }
  });

  def('ori_clinic', {
    title: '黑市药', book: '矿石病',
    when: S => S.ori && !S.ori.treated,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      const cost = n.ppp * 0.8;
      if (S.money < cost) return TL.L`你连黑市的价钱都付不起。`;
      S.money -= cost;
      if (TL.chance(0.62)) {
        S.ori.treated = true;
        S.ori.provider = 'clinic';
        TL.eff(S, { h: 5 });
        return TL.L`巷子深处的小诊所。药来路不明，但确实压住了疼痛。`;
      }
      TL.eff(S, { hl: -7, h: -5 });
      return TL.L`药是假的。你打完之后烧了两天。`;
    }
  });

  def('reunion_recruit', {
    title: '整合运动', book: '矿石病',
    when: S => TL.reunionCanContact(S),
    run(S) {
      TL.eff(S, { h: 9, so: 6 });
      S.flags.reunionTouched = S.age;
      S.flags.reunionContactYear = S.year;
      const lines = [
        TL.L`有人在墙上画了一个符号。第二天你又路过，符号还在，下面多了几个字：「你不必道歉。」`,
        TL.L`一个和你一样手上有结晶的人递给你一张传单。上面写：为我们的身份感到骄傲。`,
        TL.L`他们围住你的时候你以为是来打你的。结果领头的那个掀开袖子——和你一样。`
      ];
      return TL.pick(lines);
    }
  });

  def('ori_crystal_visible', {
    title: '藏不住了', book: '矿石病',
    when: S => S.ori && S.ori.stage >= 2 && !S.flags.visibleCrystal,
    run(S) {
      S.flags.visibleCrystal = 1;
      TL.eff(S, { h: -9, so: -8 });
      return TL.L`结晶已经长到了脸颊。从今天起，你不需要告诉任何人你的身份。`;
    }
  });

  // ========== 整合运动事件链扩展 ==========

  def('reunion_choice', {
    title: '整合运动 · 抉择', book: '矿石病',
    when: S => TL.canJoinOrganization(S, 'reunion', 'infected') &&
      S.flags.dec_reunion_invite == null,
    max: 1,
    cd: 0,
    run(S) {
      TL.openDecision(S, 'reunion_invite');
      return TL.L`营地的人邀请你留下。你需要作出自己的选择。`;
    }
  });

  def('reunion_life', {
    title: '整合运动 · 营地生活', book: '矿石病',
    when: S => S.affiliation === 'reunion' && TL.organizationAvailable(S, 'reunion'),
    cd: 2,
    run(S) {
      TL.eff(S, { so: 5, h: 3, hl: -2 });
      return TL.pick([
        TL.L`营地里的人来自各个国家。有人教你他们的语言，你也教他们你的。`,
        TL.L`训练时有人倒下了。结晶率太高。大家把他抬到帐篷里，但没有药。`,
        TL.L`篝火旁有人在讲他是怎么被赶出城的。你听着，想起了自己的经历。`,
        TL.L`有人谈起其他队伍对平民的报复。你所在的小营地仍在分发口粮，但互助不能掩盖队伍中的暴力与分歧。`
      ]);
    }
  });

  def('reunion_conflict', {
    title: '整合运动 · 冲突', book: '矿石病',
    when: S => S.affiliation === 'reunion' && TL.organizationAvailable(S, 'reunion') && S.age - S.flags.reunionJoined >= 1,
    max: 2,
    cd: 3,
    run(S) {
      if (TL.chance(0.15)) {
        TL.eff(S, { hl: -15, h: -10 });
        return TL.L`纠察队找到了营地。你们撤得很狼狈，有人没跟上来。`;
      }
      TL.eff(S, { h: -5, hl: -3 });
      return TL.pick([
        TL.L`有人提议去袭击城市的源石运输车。队长说：那样我们就真的变成他们口中的暴徒了。`,
        TL.L`营地里有人吵了起来。一派说要反抗，一派说要藏起来。最后不欢而散。`,
        TL.L`你听说有个营地被军队剿灭了。所有人都被就地处决，包括孩子。`
      ]);
    }
  });

  // ========== 感染者隐藏身份系统 ==========

  def('ori_hide_identity', {
    title: '隐藏', book: '矿石病',
    when: S => S.age >= 12 && S.ori && !S.ori.known && S.ori.stage >= 1 && !S.flags.oriExposed && !S.flags.oriHiding,
    max: 1,
    cd: 0,
    run(S) {
      const tol = TL.tolOf(S.nation, S.year);
      if (tol < 40 && TL.chance(0.6)) {
        S.flags.oriHiding = true;
        TL.eff(S, { h: -8, so: -5 });
        return TL.L`你开始穿长袖。结晶主要在手臂上，遮住就看不出来。你告诉自己：只要小心一点，没人会知道。`;
      }
      TL.eff(S, { h: -4 });
      return TL.L`你看着手臂上的结晶，想知道还能瞒多久。`;
    }
  });

  def('ori_hiding_stress', {
    title: '隐藏的代价', book: '矿石病',
    when: S => S.ori && !S.ori.known && S.flags.oriHiding && !S.flags.oriExposed,
    cd: 2,
    run(S) {
      TL.eff(S, { h: -5, so: -3 });
      return TL.pick([
        TL.L`有人问你为什么一直戴着手套。你说习惯了。对方笑了笑，没再问。`,
        TL.L`体检的日子快到了。你开始考虑要不要辞职。`,
        TL.L`你在公共浴室外站了很久，最后还是回去了。`,
        TL.L`每次有人盯着你看，你都会紧张。即使他们可能什么都没发现。`
      ]);
    }
  });

  def('ori_identity_exposed', {
    title: '暴露', book: '矿石病',
    when: S => S.ori && !S.ori.known && S.flags.oriHiding && !S.flags.oriExposed && S.ori.stage >= 2,
    max: 1,
    cd: 0,
    run(S) {
      if (TL.chance(0.3 + S.ori.stage * 0.15)) {
        S.flags.oriExposed = true;
        S.ori.known = true;
        S.flags.oriHiding = false;
        const tol = TL.tolOf(S.nation, S.year);
        TL.eff(S, { h: -15, so: -10 });

        if (tol < 20) {
          S.job = 'seeking';
          return TL.L`你倒在了工作的地方。醒来时周围围了一圈人。有人看到了你手臂上的结晶。第二天你被开除了。没有人跟你说再见。`;
        } else if (tol < 40) {
          return TL.L`袖子在工作时被勾住了，撕开了一条口子。结晶暴露在阳光下。同事们后退了一步。你听到有人说：感染者。`;
        } else {
          TL.eff(S, { h: 5 });
          return TL.L`你的秘密被发现了。预想中的驱逐没有发生。主管说：以后记得戴护具，对你对大家都好。`;
        }
      }
      TL.eff(S, { h: -3 });
      return TL.L`有人盯着你的衣袖看了好一会儿。你不确定他有没有看到什么。`;
    }
  });

  /* ====================================================================== */
  /* ⑥ 天灾                                                                  */
  /* ====================================================================== */
  def('cat_warning', {
    title: '天灾警报', book: '天灾',
    when: S => TL.NATION_BY_ID[S.nation].cat >= 0.6 && S.age >= 6,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      S.flags.postCatastrophe = 1;
      const hit = S.flags.drill ? 0.55 : 0.72;   // 演练过的人活下来的概率更高
      if (TL.chance(hit)) {
        TL.eff(S, { h: -8, hl: -4, so: -3 });
        return TL.L`警报响了三天。整座城市开始移动。你在安置区挤了一夜，天亮时从窗口看出去——原来那片地已经没了。`;
      }
      const sev = 1 - n.med * 0.3;
      TL.eff(S, { hl: -18 * sev, h: -14, so: -6 });
      if (TL.chance(0.2)) {
        S.flags.homeLost = 1;
        S.money = Math.max(0, S.money - n.ppp * 3);
        return TL.L`你家的那片街区被划进了灾区。房子没了，邻居也没了几个。你从瓦砾里翻出来一只碗。`;
      }
      return TL.L`天灾擦着城市边缘过去。你活下来了，但街道已经不是原来那条街。`;
    }
  });

  def('cat_aftermath', {
    title: '灾后', book: '天灾',
    when: S => S.flags.postCatastrophe && !S.ori,
    run(S) {
      TL.eff(S, { hl: -5, h: -4, so: 3 });
      if (TL.tryInfect(S, 4)) {
        return TL.L`灾后清理持续了两个月。源石粉尘混在灰里，谁也分不清。你咳嗽的时候，痰里有亮晶晶的东西。`;
      }
      return TL.L`灾后重建人手不够。你跟着搬了半个月的石头。`;
    }
  });

  /* ====================================================================== */
  /* ⑤c 阶层日常：荒野与核心区的日子不是同一种日子                            */
  /* ====================================================================== */
  def('wild_beast', {
    title: '野兽', book: '荒野', max: 8, w: 1.0,
    when: S => !TL.stratum(S.stratum).urban && S.age >= 6,
    run(S) {
      if (TL.chance(0.10)) {
        S.flags.crippled = (S.flags.crippled || 0) + 1;
        TL.eff(S, { hl: -14, h: -10 });
        return TL.L`你们把它赶走了，但你的腿留在了那天晚上。`;
      }
      TL.eff(S, { hl: -3, h: -5, so: 2 });
      return TL.pick([
        TL.L`夜里围栏外有东西在走。你们点了一整夜的火。`,
        TL.L`它叼走了两只羊。追出去的人天亮才回来，什么也没带回来。`,
        TL.L`猎到一头。分肉的时候没人说话，都在看别人手里的刀。`
      ]);
    }
  });

  def('wild_water', {
    title: '水', book: '荒野', max: 6, w: 0.9,
    when: S => !TL.stratum(S.stratum).urban,
    run(S) {
      TL.eff(S, { hl: -3, h: -4 });
      if (TL.chance(0.22)) {
        TL.eff(S, { hl: -8 });
        return TL.L`井里的水今年是苦的。喝了的人都在拉肚子，小孩拉得最厉害。`;
      }
      return TL.pick([
        TL.L`挑水要走两里地。你从小就记得这条路，闭着眼也能走。`,
        TL.L`下了雨，你们把能接的东西都摆到了外面。`
      ]);
    }
  });

  def('core_service', {
    title: '城内', book: '城市', max: 8, w: 1.0,
    when: S => TL.stratum(S.stratum).urban && S.age >= 16,
    run(S) {
      TL.eff(S, { so: 3, h: 2 });
      return TL.pick([
        TL.L`电梯停了一次，卡在四十七层。你在里面站了二十分钟，没有人说话。`,
        TL.L`市政厅贴出告示，说下个季度的过滤芯会按时更换。上一次这么说是在三年前。`,
        TL.L`你在报纸上读到城墙外的事。读完你把报纸折好，放进了抽屉。`,
        TL.L`地铁新开了一站。车厢里的人都在看自己的终端。`
      ]);
    }
  });

  def('core_screen', {
    title: '体检', book: '城市', max: 6, w: 1.1,
    when: S => TL.stratum(S.stratum).urban && S.age >= 12 && S.age % 4 === 0,
    run(S) {
      if (S.ori && S.ori.stage > 0 && !S.ori.known) {
        const ti = TL.tolInfo(S.nation, S.year);
        if (TL.chance(0.35 + ti.arrest * 0.4)) {
          S.ori.known = true;
          TL.eff(S, { h: -18, so: -10 });
          return TL.L`例行体检。机器在你手腕上停了很久，然后叫来了第二个人。`;
        }
        TL.eff(S, { h: -6 });
        return TL.L`例行体检。你把袖子拉下来的时候，手是稳的。`;
      }
      TL.eff(S, { h: 1 });
      return TL.pick([
        TL.L`例行体检。各项指标都在范围内，医生说下一年再来。`,
        TL.L`例行体检。抽了三管血，排了两个小时的队。`,
        TL.L`体检报告上盖了个章。你把它夹进了证件袋。`,
        TL.L`体检的人问你最近睡得好不好。你说了谎。`
      ]);
    }
  });

  /* ====================================================================== */
  /* ⑥b 阶层天灾：移动城市 vs 荒野                                            */
  /* ====================================================================== */
  /* 移动城市每年平均 3~6 次预警，其中约 1~2 次需要主引擎偏航规避；
     荒野不能移动，每 5~8 年一次中型天灾、每 20~30 年一次毁灭级源石风暴，
     毁灭级的天灾致死致残率可达 20%。 */

  def('cat_city', {
    title: '城市偏航', book: '天灾', max: 14, w: 1.5,
    when: S => TL.stratum(S.stratum).urban && S.age >= 3,
    run(S) {
      const st = TL.stratum(S.stratum);
      const hit = TL.chance(st.catHit * 0.32);
      if (hit) {
        TL.eff(S, { hl: -14, h: -12, so: -4 });
        S.flags.homeLost = 1;
        if (TL.tryInfect(S, 2)) return TL.L`这次偏航慢了半拍。你所在的那块地块被擦到了，废墟里的粉尘是亮的。`;
        return TL.L`这次偏航慢了半拍。你所在的那块地块被擦到了。`;
      }
      TL.eff(S, { h: -3, so: 1 });
      return TL.pick([
        TL.L`警报响了四遍。城市启动主引擎，整块地在夜里挪了个位置。`,
        TL.L`你在安置区待了三天。回来的时候，窗台上的灰有半指厚。`,
        TL.L`这次躲过去了。有人说是天灾信使提前了半天敲钟。`,
        TL.L`城市换了个位置停下。你走出去，发现外面的土是新的，上面什么都没有。`
      ]);
    }
  });

  def('cat_migrate', {
    title: '大迁徙', book: '天灾', max: 8, w: 1.1,
    when: S => TL.stratum(S.stratum).urban && S.age >= 5,
    run(S) {
      TL.eff(S, { h: -6, so: -5 });
      S.money = Math.max(0, S.money - TL.NATION_BY_ID[S.nation].ppp * 0.8);
      return TL.pick([
        TL.L`整座城市迁了三百公里。路上走了两个月，你换了三次住处。`,
        TL.L`迁徙途中城市停了一次，据说是前面的地块脱钩了。`,
        TL.L`你从旧城区的名单上被划掉，又在新城区被登记了一次。`
      ]);
    }
  });

  def('cat_wild', {
    title: '天灾（荒野）', book: '天灾', max: 10, w: 1.2,
    when: S => !TL.stratum(S.stratum).urban && S.age >= 3,
    run(S) {
      const sev = TL.rnd();
      // 注意：生命表里的荒野外部风险已经包含了天灾死亡率。
      // 这里只是「被正面命中」的那一部分，所以致死率必须压低，否则双重计数。
      if (sev < 0.15) {
        // 致死 / 致残合计 15%，其中真正死亡的是少数
        if (TL.chance(0.15)) { if (TL.die(S, 'cat') !== false) return TL.L`它来得比风还快。你没有跑出去。`; return TL.L`它来得比风还快。你在最后一秒找到了施术的角度。`; }
        S.flags.crippled = (S.flags.crippled || 0) + 1;
        TL.eff(S, { hl: -30, h: -18, so: -6 });
        if (TL.tryInfect(S, 3)) return TL.L`你活下来了，但腿上留下了治不好的伤。后来伤口边上长出了一些硬的东西。`;
        return TL.L`你活下来了，但腿上留下了治不好的伤，从此走不快了。`;
      }
      if (sev < 0.55) {
        TL.eff(S, { hl: -14, h: -12, so: -4 });
        S.flags.homeLost = 1;
        S.money = Math.max(0, S.money - TL.NATION_BY_ID[S.nation].ppp * 2);
        if (TL.tryInfect(S, 2)) return TL.L`聚落没了。你在废墟里扒了两天，扒出来半袋粮和一身粉尘。`;
        return TL.L`聚落没了。你在废墟里扒了两天，只扒出来半袋粮。`;
      }
      TL.eff(S, { hl: -5, h: -8, so: 2 });
      return TL.pick([
        TL.L`你们往南跑了三天。回来的时候，原来的地方已经认不出来了。`,
        TL.L`天灾擦着山脊过去。你们在地窖里蹲了一夜，出来时天上还是灰的。`,
        TL.L`预警来得太晚。跑的时候你回头看了一眼——房子像纸一样被掀走了。`
      ]);
    }
  });

  def('cat_mega', {
    title: '毁灭级源石风暴', book: '天灾', max: 3, w: 1.0,
    when: S => !TL.stratum(S.stratum).urban && S.age >= 8,
    run(S) {
      if (TL.chance(0.12)) { if (TL.die(S, 'cat') !== false) return TL.L`风暴的边缘扫过时，连影子都被撕开了。`; return TL.L`风暴的边缘扫过时，你用技艺撑住了几秒钟，躲进了裂隙。`; }
      TL.eff(S, { hl: -26, h: -24, so: -10 });
      S.flags.homeLost = 1;
      S.flags.displaced = (S.flags.displaced || 0) + 1;
      S.refugee = true;
      if (TL.tryInfect(S, 4)) return TL.L`源石风暴过后，整片地区都在发光。你活下来了，但你吸进去的东西不会出来。`;
      return TL.L`源石风暴过后，整片地区都在发光。活下来的人不多了，你们开始往别处走。`;
    }
  });

  /* ====================================================================== */
  /* ⑤b 感染者迫害：容忍度越低的国家，纠察队越常来                             */
  /* ====================================================================== */
  def('ori_arrest', {
    title: '纠察队', book: '矿石病', max: 5, w: 1.2,
    when: S => S.ori && S.ori.stage > 0 && S.age >= 10 && TL.tolInfo(S.nation, S.year).arrest > 0,
    run(S) {
      const ti = TL.tolInfo(S.nation, S.year);
      if (!S.ori.known && TL.chance(0.55)) {
        TL.eff(S, { h: -6 });
        return TL.L`纠察队从巷口过去。你把手插在口袋里，一直站着没动。`;
      }
      S.ori.known = true;
      if (TL.chance(ti.arrest)) {
        if (TL.chance(0.42)) { if (TL.die(S, 'exec') !== false) return TL.L`他们把你按在墙上，看了你的手腕。之后的事你没能记住。`; return TL.L`他们把你按在墙上。你抓住了那一瞬间的空隙，从巷子的另一头逃了出去。`; }
        S.flags.lastJob = S.job;
        S.job = 'slave';
        S.flags.slaveAt = S.age;
        TL.eff(S, { hl: -20, h: -22, so: -8 });
        return TL.L`你被押上了北去的列车。车门关上之前，你看见站台上有人在数人头。`;
      }
      TL.eff(S, { h: -12, so: -6 });
      return TL.pick([
        TL.L`纠察队挨家挨户查。你从后窗翻出去，在排水沟里趴了半天。`,
        TL.L`名单上有你的名字。你花钱把它划掉了一半——剩下的那一半还在。`,
        TL.L`他们砸了门，带走了一个邻居。你在屋里没出声。`
      ]);
    }
  });

  def('slave_life', {
    title: '矿坑', book: '矿石病', max: 10, w: 1.3,
    when: S => S.job === 'slave',
    run(S) {
      TL.eff(S, { hl: -9, h: -6, so: -2 });
      if (TL.chance(0.10)) { if (TL.die(S, 'slave') !== false) return TL.L`坑道塌了。你在最里面。`; return TL.L`坑道塌了。你用重力与屏障撑出一条缝，和另外两个人一起爬了出来。`; }
      return TL.pick([
        TL.L`井下没有白天。你们按铃上下工，铃声一天响十二次。`,
        TL.L`同棚的一个人昨夜没了。天亮时有人把床板抬走，铺上了新的草。`,
        TL.L`你学会了不抬头。抬头会看见别人眼里的东西，那比矿尘更伤。`,
        TL.L`矿石粉尘在灯下像雪。你们管它叫雪。`
      ]);
    }
  });

  /**
   * 出矿。
   * 没有这一段，一次 ori_arrest 判定就等于无期徒刑 —— 玩家从此没有任何
   * 可做的事，只能看着日志重复到死。泰拉确实有这种结局，但它应该是
   * 一个低概率的坏运气，而不是一条没有出口的走廊。
   */
  def('slave_out', {
    title: '出矿', book: '矿石病', max: 1, w: 1.0,
    when: S => S.job === 'slave' && S.age >= 14,
    run(S) {
      const r = TL.rnd();
      S.job = (S.flags.lastJob && S.flags.lastJob !== 'slave') ? S.flags.lastJob : 'seeking';
      S.flags.slaveOut = S.age;
      if (r < 0.22) {
        // 家里凑钱赎人
        S.money = Math.max(0, S.money - TL.NATION_BY_ID[S.nation].ppp * 6);
        TL.eff(S, { h: 14, so: 8, hl: -6 });
        return TL.L`有人替你交了一笔钱。数目你这辈子没算清过，也没敢问是谁出的。`;
      }
      if (r < 0.50) {
        // 换防 / 特赦 / 名单出错
        TL.eff(S, { h: 8, so: 4, hl: -8 });
        return TL.L`换防那天名册上少了一页。你就那么走出来了，没有人拦你。`;
      }
      if (r < 0.78) {
        // 逃
        TL.eff(S, { hl: -12, h: 6, so: -4 });
        S.flags.fugitive = 1;
        return TL.L`你沿着运矿的轨道走了十一天。第十一天之后，没有人再问过你是谁。`;
      }
      // 病到挖不动，被扔出来
      TL.eff(S, { hl: -18, h: -4 });
      return TL.L`你病到举不起镐。他们把你抬到矿区外面的路边，放下一壶水，然后回去了。`;
    }
  });

  /* ====================================================================== */
  /* ⑦ 战争与动荡                                                           */
  /* ====================================================================== */
  def('war_draft', {
    title: '征召', book: '战争',
    when: S => S.age >= 17 && S.age <= 45 && S.serveLeft === 0 && TL.NATION_BY_ID[S.nation].war > 0.3,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      S.serveLeft = Math.round(TL.range(2, 6));
      S.flags.lastJob = S.job;
      S.job = 'soldier';
      TL.eff(S, { hl: 4, h: -10, so: -4 });
      if (n.war > 0.7) return TL.L`征兵令贴到了巷口。你家在名单上。第二天你就换上了那身衣服。`;
      return TL.L`你被征召了。训练了三个月，然后被送上去。`;
    }
  });

  def('war_battle', {
    title: '前线', book: '战争',
    when: S => S.serveLeft > 0,
    run(S) {
      const cv = TL.combatValue(S);
      const survive = TL.clamp(0.55 + cv / 260 - TL.NATION_BY_ID[S.nation].war * 0.2, 0.2, 0.94);
      if (TL.chance(survive)) {
        TL.eff(S, { hl: -8, h: -10, so: -5, sm: 2 });
        S.flags.battles = (S.flags.battles || 0) + 1;
        const lines = [
          TL.L`你在战壕里蹲了两天。出来的时候，认识的人少了三个。`,
          TL.L`炮击停下之后，你听见有人在哭，但找不到是谁。`,
          TL.L`你活下来了。你不知道为什么是你。`
        ];
        return TL.pick(lines);
      }
      // 阵亡：这里不直接 die()，交给当年的死亡判定，但显著抬高当年风险
      TL.eff(S, { hl: -30, h: -20 });
      S.flags.wounded = (S.flags.wounded || 0) + 1;
      if (TL.chance(0.4)) { if (TL.die(S, 'war') !== false) return TL.L`你倒在了阵地上。`; return TL.L`你倒在了阵地上，却用最后的力气挡开了下一轮冲击。`; }
      return TL.L`你受了重伤，被抬了回来。军医说能保住命已经是运气。`;
    }
  });

  def('war_reunion', {
    title: '感染者前线', book: '战争',
    when: S => S.ori && S.ori.known && S.serveLeft > 0,
    run(S) {
      TL.eff(S, { hl: -6, h: -12, so: -4 });
      S.flags.oriSuicideSquad = 1;
      return TL.L`感染者在军队里的位置在最前面。这是不成文的规定，没有人写下来。`;
    }
  });

  def('war_end', {
    title: '停战', book: '战争',
    when: S => S.serveLeft > 0 && TL.chance(0.5),
    run(S) {
      S.serveLeft = 0;
      S.job = S.flags.lastJob || 'seeking';
      TL.eff(S, { h: 8, so: 4 });
      return TL.L`停战的消息是在夜里传到的。有人在营地外面唱歌，唱到一半就哭了。`;
    }
  });

  def('riot', {
    title: '街上乱了', book: '动荡',
    when: S => TL.NATION_BY_ID[S.nation].war > 0.4 && S.age >= 12,
    run(S) {
      const r = TL.rnd();
      if (r < 0.4) { TL.eff(S, { h: -8, so: -4 }); return TL.L`城里戒严了。你隔着窗看外面，路灯一盏一盏地灭。`; }
      if (r < 0.7) { TL.eff(S, { hl: -8, h: -6 }); return TL.L`街上有人打起来了。你只是想回家，结果被卷了进去。`; }
      TL.eff(S, { so: 5, h: 3 }); return TL.L`邻居们把巷口堵了起来，轮流守夜。你也去了。`;
    }
  });

  /* ====================================================================== */
  /* ⑧ 迁徙与身份                                                           */
  /* ====================================================================== */
  def('move_city', {
    title: '搬家', book: '迁徙',
    when: S => S.age >= 16 && S.age <= 45,
    run(S) {
      // 不要把「搬到 A」写成「搬到 A」—— 换一个和当前不同的城市
      const pool = (TL.CITIES[S.nation] || []).filter(c => c !== S.city);
      S.city = pool.length ? TL.pick(pool) : TL.cityOf(S.nation);
      S.flags.migrations = (S.flags.migrations || 0) + 1;
      TL.eff(S, { h: -5, so: -8, sm: 2 });
      const why = TL.pick([
        '房东把房子卖了',
        '原来那条街要拆',
        '有一份活在这边',
        '跟着认识的人一起走',
        '只是不想再待在那个地方'
      ]);
      return TL.L`${why}。你搬到了${S.city}，行李只有一只箱子。`;
    }
  });

  def('sarkaz_pass', {
    title: '过关', book: '歧视',
    when: S => S.race === 'sarkaz' && S.nation !== 'KDZ' && S.age >= 14,
    run(S) {
      const d = TL.discrimination(S);
      if (TL.chance(1 - d - 0.2)) {
        TL.eff(S, { h: 6, so: 2 });
        return TL.L`检查站的人看了你的证件很久，最后挥手放行。「过去吧。」`;
      }
      TL.eff(S, { h: -10, so: -3, money: -TL.NATION_BY_ID[S.nation].ppp * 0.5 });
      return TL.L`「萨卡兹走另一条通道。」他们说。另一条通道排了六个小时，还要交一笔钱。`;
    }
  });

  def('aegir_outsider', {
    title: '海里来的', book: '身份',
    when: S => S.race === 'aegir' && S.nation !== 'AEG' && S.age >= 8,
    run(S) {
      TL.eff(S, { h: -7, so: -4, sm: 3 });
      return TL.L`他们问你海底下是什么样子。你说了，他们不信。后来你就不说了。`;
    }
  });

  def('infected_march', {
    title: '游行', book: '矿石病',
    when: S => S.ori && S.ori.known && S.age >= 15,
    run(S) {
      const r = TL.rnd();
      if (r < 0.35) { TL.eff(S, { so: 10, h: 8 }); return TL.L`感染者上街了。你走在队伍中间，第一次不用把手藏起来。`; }
      if (r < 0.65) { TL.eff(S, { hl: -10, h: -8 }); return TL.L`队伍被冲散了。你跑回巷子里，蹲了很久才敢出来。`; }
      TL.eff(S, { so: 6, h: 4, hl: -3 }); return TL.L`你们在广场上站了一整夜。没有人来驱散，也没有人来回应。`;
    }
  });

  def('quiet_year', {
    title: '这一年', book: '日常',
    when: S => true,
    run(S) {
      const a = S.age;
      // 按人生阶段给不同的「平淡」写法，避免同一句话反复出现
      let lines;
      if (a < 12) {
        lines = [
          TL.L`这一年你长高了一截。裤脚又短了。`,
          TL.L`日子过得很慢。你记得每一场雨。`,
          TL.L`没什么大事。你学会了用左手写字，又被先生纠正回来。`,
          TL.L`这一年你多半时间在街上。回家晚了会挨骂。`
        ];
      } else if (a < 25) {
        lines = [
          TL.L`这一年没什么大事。你照旧起床上工，照旧回来。`,
          TL.L`日子过得很快，你说不上来都干了什么。`,
          TL.L`你攒下了一点钱，不多，但比去年多一点。`,
          TL.L`认识的人里有人走了，也有人来了。你没太在意。`,
          TL.L`你开始觉得时间不够用，虽然也没什么非做不可的事。`
        ];
      } else if (a < 55) {
        lines = [
          TL.L`这一年过得很快。回头想的时候，只剩下几件事记得住。`,
          TL.L`没什么值得写下来的。你把大部分时间给了活计。`,
          TL.L`院子里的那棵树又高了一截。你记得它刚种下去的时候只到你腰。`,
          TL.L`你算了一下账，发现今年的结余和去年差不多。`,
          TL.L`有几次你想过要改变什么，后来都算了。`
        ];
      } else {
        lines = [
          TL.L`这一年很安静。你开始早睡。`,
          TL.L`你发现自己走路比去年慢了，但没有别的毛病。`,
          TL.L`没什么大事。你把这些日子一天一天地过掉了。`,
          TL.L`有人来看过你一次，坐了一会儿就走了。`,
          TL.L`你把屋子收拾了一遍，扔掉了一些留了很久的东西。`
        ];
      }
      return TL.pick(lines);
    }
  });

  /* ====================================================================== */
  /* ⑨ 扩充事件库 —— 让漫长人生里的每一句尽量不重样                          */
  /* ====================================================================== */
  def('child_market', {
    title: '集市', book: '童年',
    when: S => S.age >= 5 && S.age <= 14,
    run(S) {
      TL.eff(S, { sm: 2, so: 2, h: 2 });
      return TL.pick([
        TL.L`你跟着大人去赶集。第一次见到那么多不认识的人挤在一条街上。`,
        TL.L`集市上有人卖一种很甜的糕。你站在摊子前面看了很久，最后没买。`,
        TL.L`你在集市上走丢了两个小时，最后是自己找回来的。`
      ]);
    }
  });

  def('child_pet', {
    title: '一只小东西', book: '童年',
    when: S => S.age >= 5 && S.age <= 16 && !S.flags.hadPet,
    run(S) {
      S.flags.hadPet = 1;
      TL.eff(S, { h: 8, so: 3 });
      return TL.pick([
        TL.L`你捡回来一只瘦得只剩骨架的小兽。母亲说养不活，但它活下来了。`,
        TL.L`院子里来了一只野猫，你偷偷分了一半的饭给它。它后来每天都来。`
      ]);
    }
  });

  def('child_lesson', {
    title: '一句记住的话', book: '童年',
    when: S => S.age >= 7 && S.age <= 18,
    run(S) {
      TL.eff(S, { sm: 3, h: 3 });
      return TL.pick([
        TL.L`先生说过一句话你一直记着：「先看清楚，再动手。」`,
        TL.L`父亲只教过你一件事：答应别人的事，做不到就别答应。`,
        TL.L`有人跟你说，这个世界不会因为你是个好人就对你手下留情。你当时不信。`
      ]);
    }
  });

  def('teen_friend', {
    title: '一个朋友', book: '少年',
    when: S => S.age >= 10 && S.age <= 25,
    run(S) {
      TL.eff(S, { so: 8, h: 6 });
      const nm = TL.makeName(S.nation, TL.chance(0.5) ? 'M' : 'F', S.race).given;
      S.flags.friendName = nm;
      return TL.pick([
        TL.L`你认识了${nm}。你们什么都说，包括那些不该说的。`,
        TL.L`${nm}是第一个不问你出身的人。你们一起干了不少蠢事。`,
        TL.L`你和${nm}打了一架，然后又和好了。之后就更好了。`
      ]);
    }
  });

  def('teen_fight', {
    title: '动手', book: '少年',
    when: S => S.age >= 11 && S.age <= 22,
    run(S) {
      const win = TL.chance(TL.clamp(0.45 + S.st.hl / 200, 0.2, 0.8));
      if (win) { TL.eff(S, { hl: -3, so: 2, h: -2 }); return TL.L`有人先动的手。你还手了，而且赢了。之后没人再找你麻烦。`; }
      TL.eff(S, { hl: -8, h: -6, so: -2 });
      return TL.L`你打输了。躺在地上的时候，你听见有人在笑。`;
    }
  });

  def('teen_love', {
    title: '第一次心动', book: '少年',
    when: S => S.age >= 14 && S.age <= 28 && !S.fam.married,
    run(S) {
      TL.eff(S, { h: 9, so: 3 });
      const nm = TL.makeName(S.nation, S.sex === 'M' ? 'F' : 'M', S.race).given;
      return TL.pick([
        TL.L`你喜欢上了${nm}。你没有说，但每次见到都会心跳得很快。`,
        TL.L`${nm}给你留了一张纸条。你把它叠好放在口袋里，一直没舍得扔。`,
        TL.L`你和${nm}一起走了一段路。谁也没说话，但那段路走得很慢。`
      ]);
    }
  });

  def('teen_breakup', {
    title: '散了', book: '少年',
    when: S => S.age >= 16 && S.age <= 35,
    run(S) {
      TL.eff(S, { h: -11, so: -4, sm: 2 });
      return TL.pick([
        TL.L`你们分开了。理由说了很多，其实只有一个。`,
        TL.L`他/她走了，没有留地址。你把能扔的都扔了，只留下一件。`,
        TL.L`你说算了。说完之后一个人在街上走到很晚。`
      ]);
    }
  });

  def('exam', {
    title: '一场考试', book: '求学',
    when: S => S.school && S.age >= 12,
    run(S) {
      const pass = TL.chance(TL.clamp(0.25 + S.st.sm / 130, 0.15, 0.9));
      if (pass) { TL.eff(S, { sm: 4, h: 8, so: 2 }); return TL.L`成绩下来那天，你的名字在上面。你把它抄了一遍带回家。`; }
      TL.eff(S, { h: -9, sm: 1 });
      return TL.L`你没考过。教习说还有机会，但你知道那个机会不太属于你。`;
    }
  });

  def('scholarship', {
    title: '有人资助', book: '求学',
    when: S => S.school && S.q <= 3 && S.st.sm >= 60,
    run(S) {
      TL.eff(S, { sm: 4, h: 12, so: 4 });
      return TL.L`有人替你交了学费。对方只说了一句：「别浪费。」你连他的名字都不知道。`;
    }
  });

  def('work_overtime', {
    title: '连轴转', book: '职业',
    when: S => TL.isWorking(S) && S.age >= 18,
    run(S) {
      S.money += TL.NATION_BY_ID[S.nation].ppp * 0.9;
      TL.eff(S, { hl: -6, h: -5, so: -3 });
      return TL.pick([
        TL.L`连着上了半个月的夜班。你开始分不清今天是哪一天。`,
        TL.L`活赶得急，你们连饭都是在机器旁边吃的。`,
        TL.L`你连着加了三个月的班，多拿了一笔钱，也落下了一点毛病。`
      ]);
    }
  });

  def('work_colleague', {
    title: '同事', book: '职业',
    when: S => TL.isWorking(S) && S.age >= 18,
    run(S) {
      TL.eff(S, { so: 6, h: 4 });
      return TL.pick([
        TL.L`有个老工人教了你怎么省力气。他说这行干久了，省力气就是保命。`,
        TL.L`你和一个同事关系不错。休息的时候他会分你一半的干粮。`,
        TL.L`有人替你把一次差错担了下来。你想谢他，他说不用。`
      ]);
    }
  });

  def('work_robbery', {
    title: '被抢了', book: '职业',
    when: S => S.age >= 16 && TL.NATION_BY_ID[S.nation].hom >= 4,
    run(S) {
      const lost = TL.NATION_BY_ID[S.nation].ppp * TL.range(0.4, 2.2);
      S.money = Math.max(0, S.money - lost);
      TL.eff(S, { h: -7, hl: -3 });
      return TL.L`你在回去的路上被拦住了。钱没了，人没事。这已经算运气好。`;
    }
  });

  def('move_nomad', {
    title: '城市在走', book: '天灾',
    when: S => TL.NATION_BY_ID[S.nation].cat >= 0.8 && S.age >= 8,
    run(S) {
      TL.eff(S, { sm: 2, so: -3, h: -2 });
      return TL.pick([
        TL.L`你第一次站到城墙上看城市移动。地面在往后退，像整片大地都在让路。`,
        TL.L`迁徙的时候你趴在窗口看了很久：原来城市底下的履带比房子还高。`,
        TL.L`城市换了个位置停下。你走出去，发现外面的土是新的，什么都没有。`
      ]);
    }
  });

  def('ori_community', {
    title: '感染者街区', book: '矿石病',
    when: S => S.ori && S.age >= 12,
    run(S) {
      TL.eff(S, { so: 9, h: 6, hl: -2 });
      return TL.pick([
        TL.L`你找到了一个住的都是感染者的街区。那里没有人会因为你把手露出来而多看一眼。`,
        TL.L`有个感染者开了间铺子，只做同类的生意。他给你算的价钱比外面低一半。`,
        TL.L`你们凑钱租了一间屋子，轮流去领药。谁没回来，大家都知道是为什么。`
      ]);
    }
  });

  def('ori_medcart', {
    title: '医疗车', book: '矿石病',
    when: S => S.ori && S.ori.treated && S.ori.provider === 'rhodes',
    run(S) {
      TL.eff(S, { h: 8, hl: 3 });
      return TL.pick([
        TL.L`罗德岛的医疗车又来了。医生看了你的记录，说控制得比上次好。`,
        TL.L`排在你前面的人出来的时候在哭。轮到你的时候，医生说：「你的还在控制范围内。」`,
        TL.L`医疗车只停两天。你把一年的药都领了回来，装了一整个箱子。`
      ]);
    }
  });

  // ========== 治疗系统扩展 ==========

  def('ori_drug_sideeffect', {
    title: '药物副作用', book: '矿石病',
    when: S => S.ori && S.ori.treated && S.ori.provider === 'rhodes',
    cd: 3,
    run(S) {
      TL.eff(S, { hl: -5, h: -3 });
      return TL.pick([
        TL.L`抑制药让你总是感到疲惫。医生说这是正常反应，但你每天都得硬撑着工作。`,
        TL.L`注射部位红肿了。说明书上写着「偶见」，但现在就发生在你身上。`,
        TL.L`用药之后你总是做噩梦。醒来时分不清哪个才是真的。`,
        TL.L`药物让你的食欲变差了。朋友说你瘦了一圈，你说没事。`
      ]);
    }
  });

  def('ori_treatment_cost', {
    title: '药费', book: '矿石病',
    when: S => S.ori && S.ori.treated && !S.opClass,
    cd: 2,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      const cost = n.ppp * (S.ori.provider === 'rhodes' ? 2.5 : 1.8);
      S.money -= cost;
      TL.eff(S, { h: -6 });

      if (S.money < -cost * 3) {
        S.ori.treated = false;
        TL.eff(S, { h: -12, hl: -8 });
        return TL.L`你付不起这个月的药费了。医生说停药会让结晶率上升，但你没有选择。`;
      }

      return TL.pick([
        TL.L`又到了领药的日子。你把这个月的工资大半都交了出去。`,
        TL.L`药费涨了。你问为什么，对方说：「进口的，都这个价。」`,
        TL.L`你算了算，这些药够买一间小房子了。但不买就活不到住进房子的那天。`
      ]);
    }
  });

  def('ori_blackmarket_drug', {
    title: '黑市药物', book: '矿石病',
    when: S => S.ori && !S.ori.treated && S.urban && TL.chance(0.3),
    max: 2,
    cd: 4,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      if (TL.chance(0.4) && S.money >= n.ppp * 1.2) {
        S.money -= n.ppp * 1.2;
        if (TL.chance(0.6)) {
          // 真药
          S.ori.treated = true;
          S.ori.provider = 'black';
          TL.eff(S, { h: 10, hl: 4 });
          return TL.L`黑市上买到了抑制药。没有说明书，也没有医生指导，但至少有药了。结晶确实不再长了。`;
        } else {
          // 假药
          TL.eff(S, { h: -10, hl: -12 });
          return TL.L`你买的药是假的。用了两周后结晶反而长得更快了。你去找那个商人，但他已经换了地方。`;
        }
      }
      TL.eff(S, { h: -4 });
      return TL.L`黑市上有人说能搞到抑制药，比医院便宜一半。你不确定该不该信。`;
    }
  });

  def('ori_folk_remedy', {
    title: '民间偏方', book: '矿石病',
    when: S => S.ori && !S.ori.treated && TL.chance(0.25),
    max: 2,
    cd: 5,
    run(S) {
      TL.eff(S, { h: -3, hl: -5, money: -TL.NATION_BY_ID[S.nation].ppp * 0.8 });
      return TL.pick([
        TL.L`有人说某种草药可以抑制结晶。你试了一个月，结晶还在长，钱倒是花了不少。`,
        TL.L`听说泡温泉能缓解矿石病。你去了，泡完之后结晶还在，倒是风湿好了一点。`,
        TL.L`街上有人卖「祖传秘方」，说能根治矿石病。你买了，喝下去只是拉了一天肚子。`,
        TL.L`有人建议你去找术师做「能量平衡」。你去了，对方念了半天咒，收了钱，什么都没变。`
      ]);
    }
  });

  def('merc_job', {
    title: '一单活', book: '职业',
    when: S => ['mercenary', 'bounty', 'guard', 'soldier'].indexOf(S.job) >= 0 && S.age >= 16,
    run(S) {
      const pay = TL.NATION_BY_ID[S.nation].ppp * TL.range(1.2, 4.0);
      S.money += pay;
      TL.eff(S, { hl: -7, h: -4, sm: 2 });
      if (TL.chance(0.12)) { if (TL.die(S, 'inj') !== false) return TL.L`这一单出了岔子。你没有回来。`; return TL.L`这一单出了岔子。你用熟悉的技艺撬开了封锁，带着伤回来了。`; }
      return TL.pick([
        TL.L`这一单护送的是货，不是人。你问了不该问的，对方加了三成钱让你别问。`,
        TL.L`你们在荒野上走了六天。回来的时候少了一个人，钱按人头分了。`,
        TL.L`活很脏，但给得痛快。你把钱缝进了衣服内衬里。`
      ]);
    }
  });

  def('blackmarket', {
    title: '黑市', book: '身份',
    when: S => S.urban && S.age >= 16 && (S.ori || TL.discrimination(S) > 0.3),
    run(S) {
      TL.eff(S, { sm: 3, so: 3, h: 2 });
      return TL.pick([
        TL.L`你摸到了一个黑市的路子。那里什么证件都能做，包括让你看起来不像你自己。`,
        TL.L`黑市上有人卖抑制药，也卖别的。老板只认现钱，不问你是谁。`,
        TL.L`你在黑市上买到一张假的身份卡。贵得离谱，但管用。`
      ]);
    }
  });

  // ========== 国家特色事件 ==========

  /* 炎国 (YAN) */
  def('yan_street_food', {
    title: '街边小吃', book: '炎国',
    when: S => S.nation === 'YAN' && S.age >= 8 && S.urban,
    cd: 4,
    run(S) {
      TL.eff(S, { h: 6, so: 3 });
      return TL.pick([
        TL.L`街上有人在卖糖葫芦。你买了一串，边走边吃，糖浆粘在了嘴角上。`,
        TL.L`巷子口的包子铺早上五点就开了。老板认得你，多给了你一个。`,
        TL.L`夜市上飘着炒面的香味。你坐在小摊前，听着老板和别人用方言聊天。`,
        TL.L`有人在路边支了个炉子烤红薯。你买了一个，捧在手心里暖了半条街。`
      ]);
    }
  });

  def('yan_festival', {
    title: '节庆', book: '炎国',
    when: S => S.nation === 'YAN' && S.age >= 5,
    cd: 5,
    run(S) {
      TL.eff(S, { h: 9, so: 6 });
      return TL.pick([
        TL.L`今天是岁首。街上挂满了灯笼，你听见远处有人在放爆竹。`,
        TL.L`中元节的夜晚，河里漂满了莲花灯。你放了一盏，看着它慢慢飘远。`,
        TL.L`端午那天有人在城外划龙舟。你没去现场，但听到了鼓声。`,
        TL.L`重阳节，你跟着人登上了城墙。站在高处，看得见很远的地方。`
      ]);
    }
  });

  def('yan_tianshi', {
    title: '天师府', book: '炎国',
    when: S => S.nation === 'YAN' && S.age >= 10 && S.arts >= 50,
    max: 2,
    cd: 6,
    run(S) {
      if (TL.chance(0.3) && S.arts >= 70) {
        TL.eff(S, { sm: 8, arts: 5, h: 10 });
        return TL.L`天师府的人来过，看了你施术的手法。他们留了一卷书，说：「有缘再见。」你把那卷书读了三遍。`;
      }
      TL.eff(S, { sm: 3, h: 5 });
      return TL.L`听说天师府在招学徒。他们找的是能施术又懂古文的人。你想去试试，但不确定自己够不够格。`;
    }
  });

  /* 乌萨斯 (URS) */
  def('urs_cold', {
    title: '极寒', book: '乌萨斯',
    when: S => S.nation === 'URS',
    cd: 3,
    run(S) {
      TL.eff(S, { hl: -4, h: -3 });
      return TL.pick([
        TL.L`今天特别冷。你把所有的衣服都穿上了，还是冻得发抖。`,
        TL.L`暴风雪持续了三天。出门的人有的没回来。你把门窗都堵严实了。`,
        TL.L`早上醒来，窗户上结了一层冰花。屋里冷得能看见呼出的白气。`,
        TL.L`你在路上看见有人倒下了。周围的人绕开走。你也走开了。`
      ]);
    }
  });

  def('urs_conscription', {
    title: '征兵', book: '乌萨斯',
    when: S => S.nation === 'URS' && S.age >= 18 && S.age <= 35 && S.sex === 'M' && S.job !== 'soldier',
    max: 2,
    cd: 6,
    run(S) {
      if (TL.chance(0.25)) {
        S.flags.lastJob = S.job;
        S.serveLeft = Math.round(TL.range(2, 6));
        S.job = 'soldier';
        TL.eff(S, { h: -8, hl: -5, so: -4 });
        return TL.L`征兵令下来了。你的名字在名单上。一周后，你穿上了军服，被送往北方。`;
      }
      TL.eff(S, { h: -5 });
      return TL.L`城里又开始征兵了。你看着那些海报，希望他们不要找到你。`;
    }
  });

  def('urs_inspection', {
    title: '纠察队', book: '乌萨斯',
    when: S => S.nation === 'URS' && S.age >= 14,
    cd: 3,
    run(S) {
      TL.eff(S, { h: -6, so: -3 });
      return TL.pick([
        TL.L`纠察队在街上检查证件。你把证件递过去，手在抖。他看了一眼，扔了回来。`,
        TL.L`听说隔壁街区昨晚被纠察队封了。有人说是抓感染者，也有人说是抓逃兵。`,
        TL.L`纠察队的车停在巷子口。所有人都绕远路走。你也一样。`,
        TL.L`纠察队把一个人带走了。他在喊，但没有人敢看。`
      ]);
    }
  });

  /* 维多利亚 (VIC) */
  def('vic_fog', {
    title: '雾都', book: '维多利亚',
    when: S => S.nation === 'VIC' && S.urban,
    cd: 4,
    run(S) {
      TL.eff(S, { h: -2, hl: -2 });
      return TL.pick([
        TL.L`今天的雾特别浓。走在街上，三米外的人都看不清脸。`,
        TL.L`工厂的烟囱一天到晚都在冒烟。雾里混着煤灰的味道，你已经习惯了。`,
        TL.L`雾气让所有的声音都变得遥远。街上的马车铃声像是从很远的地方传来的。`,
        TL.L`有人说雾里藏着东西。你不信，但走夜路的时候还是会加快脚步。`
      ]);
    }
  });

  def('vic_nobility', {
    title: '贵族', book: '维多利亚',
    when: S => S.nation === 'VIC' && S.age >= 12,
    cd: 5,
    run(S) {
      if (S.q >= 4) {
        TL.eff(S, { h: 5, so: 4 });
        return TL.L`你参加了一场庄园聚会。宾客们谈论政治、艺术，还有谁家的公爵又换了情人。你礼貌地笑着，心里想着别的事。`;
      }
      TL.eff(S, { h: -4, so: -2 });
      return TL.pick([
        TL.L`贵族的马车从你身边驶过，溅了你一身泥。车里的人连看都没看一眼。`,
        TL.L`听说某个公爵的私宅占了整整三条街。你算了算，那比你住的整个街区还大。`,
        TL.L`报纸上在讨论新的继承法案。你看不懂那些词，但知道跟你没关系。`
      ]);
    }
  });

  def('vic_factory', {
    title: '工厂', book: '维多利亚',
    when: S => S.nation === 'VIC' && ['factory', 'construct', 'smith'].indexOf(S.job) >= 0,
    cd: 3,
    run(S) {
      TL.eff(S, { hl: -5, h: -4 });
      return TL.pick([
        TL.L`工厂里的机器一天十六个小时不停。你的耳朵里总是嗡嗡响，即使回到家也停不下来。`,
        TL.L`今天又有人被卷进了机器。工头说了句「小心点」，就让大家继续干活。`,
        TL.L`空气里满是金属粉尘。下班后你咳出来的痰都是黑的。`,
        TL.L`有人想组织罢工，要求缩短工时。第二天他就「辞职」了。`
      ]);
    }
  });

  /* 萨尔贡 (SRG) */
  def('srg_desert', {
    title: '沙漠', book: '萨尔贡',
    when: S => S.nation === 'SRG',
    cd: 4,
    run(S) {
      TL.eff(S, { hl: -3, h: -2 });
      return TL.pick([
        TL.L`今天的沙暴持续了一整天。出门的人都把脸蒙得严严实实。`,
        TL.L`正午的阳光把地面晒得发烫。你看见远处有东西在晃动，但那只是热浪。`,
        TL.L`水井快干了。长老说今年的雨季可能不会来了。`,
        TL.L`你在沙漠里走了一整天。水袋空了，嘴唇干裂。但总算看见了绿洲。`
      ]);
    }
  });

  def('srg_caravan', {
    title: '商队', book: '萨尔贡',
    when: S => S.nation === 'SRG' && S.age >= 14,
    cd: 5,
    run(S) {
      TL.eff(S, { so: 4, h: 3, sm: 2 });
      return TL.pick([
        TL.L`商队来了。他们带来了远方的货物和新闻。你听说北方的战争还没结束。`,
        TL.L`你跟商队的人换了些东西。他们见多识广，讲了很多外面的事。`,
        TL.L`商队在绿洲边上扎营。晚上他们生起篝火，你听到了陌生的歌。`,
        TL.L`有个商队在招护卫。报酬不错，但要横穿沙漠。你犹豫了。`
      ]);
    }
  });

  /* 卡西米尔 (KAZ) */
  def('kaz_arena', {
    title: '竞技场', book: '卡西米尔',
    when: S => S.nation === 'KAZ' && S.age >= 10,
    cd: 5,
    run(S) {
      TL.eff(S, { h: 7, so: 4 });
      return TL.pick([
        TL.L`今天有骑士比赛。全城的人都去看了。你站在人群最后面，只能看见一点影子，但欢呼声震耳欲聋。`,
        TL.L`听说一位热门骑士要出场。售票处排了几条街的队。你没去，但在收音机里听了实况。`,
        TL.L`竞技场的海报贴满了整条街。上面的骑士穿着华丽的铠甲，你想象不出那有多重。`,
        TL.L`有人在街上模仿骑士决斗。孩子们围成一圈看，欢呼声比真的比赛还响。`
      ]);
    }
  });

  def('kaz_business', {
    title: '商业联合会', book: '卡西米尔',
    when: S => S.nation === 'KAZ' && S.age >= 18 && S.urban,
    cd: 6,
    run(S) {
      if (S.q >= 3) {
        TL.eff(S, { h: 4, money: TL.NATION_BY_ID[S.nation].ppp * 1.5 });
        return TL.L`商业联合会的人找到你，说有个合作机会。你签了合同，拿了一笔预付款。`;
      }
      TL.eff(S, { h: -3 });
      return TL.pick([
        TL.L`商业联合会又涨价了。所有人都在抱怨，但没有人敢不交钱。`,
        TL.L`听说商业联合会控制了全国的骑士赛事。骑士头衔现在是可以买的。`,
        TL.L`报纸上说商业联合会要改革骑士制度。有人说这是进步，有人说这是亵渎。`
      ]);
    }
  });

  /* 哥伦比亚 (CLB) */
  def('clb_tech', {
    title: '科技公司', book: '哥伦比亚',
    when: S => S.nation === 'CLB' && S.age >= 18 && S.urban,
    cd: 4,
    run(S) {
      if (S.st.sm >= 70) {
        TL.eff(S, { h: 8, money: TL.NATION_BY_ID[S.nation].ppp * 2 });
        return TL.L`科技公司在招人。你去面试了，当场就拿到了offer。薪水是你上一份工作的三倍。`;
      }
      TL.eff(S, { h: 2, sm: 3 });
      return TL.pick([
        TL.L`新开了一家科技公司的展厅。里面展示的东西你大部分都看不懂，但很酷。`,
        TL.L`听说某个科技巨头又发布了新产品。城里到处都是广告。`,
        TL.L`科技公司的人在街上发传单，说他们在「改变世界」。你接了一张，回头就扔了。`
      ]);
    }
  });

  def('clb_frontier', {
    title: '拓荒', book: '哥伦比亚',
    when: S => S.nation === 'CLB' && !S.urban && S.age >= 16,
    cd: 5,
    run(S) {
      TL.eff(S, { hl: -6, h: -4, so: 3 });
      return TL.pick([
        TL.L`拓荒队又往西推进了一段。他们说那边有矿，有地，什么都有。但你知道那边也有天灾。`,
        TL.L`有人在荒野上建了新的聚落。拓荒法案说，占到的地就是你的。前提是你能守住。`,
        TL.L`听说拓荒队和原住民起了冲突。军队介入了。最后原住民撤得更远了。`,
        TL.L`拓荒是个豪赌。赌赢了一夜暴富，赌输了命都没了。你见过两种人。`
      ]);
    }
  });

  /* 莱塔尼亚 (LEI) */
  def('lei_arts', {
    title: '术师', book: '莱塔尼亚',
    when: S => S.nation === 'LEI' && S.arts >= 40,
    cd: 5,
    run(S) {
      TL.eff(S, { sm: 5, arts: 3, h: 6 });
      return TL.pick([
        TL.L`你在图书馆找到了一本古老的法术书。上面的文字你只认得一半，但光看图就学到了不少。`,
        TL.L`有个术师愿意指点你。他说你的天赋不错，但基础太差了。接下来三个月你每天都去找他。`,
        TL.L`街上有人在表演源石技艺。你看了很久，记住了几个手势。回家后试了试，居然成功了。`,
        TL.L`莱塔尼亚的音乐学院在招生。他们不只教音乐，还教如何用声音引导源石能量。`
      ]);
    }
  });

  def('lei_witch_hunt', {
    title: '巫王残党', book: '莱塔尼亚',
    when: S => S.nation === 'LEI' && S.arts >= 60 && S.age >= 20,
    max: 2,
    cd: 8,
    run(S) {
      if (TL.chance(0.2)) {
        TL.eff(S, { h: -8, sm: 6, arts: 8 });
        return TL.L`有人在深夜找到你，说他们掌握着巫王留下的知识。他们给了你一本笔记，让你自己决定要不要深入。你翻开了第一页。`;
      }
      TL.eff(S, { h: -4 });
      return TL.L`听说又有术师被抓了。罪名是「与巫王残党勾结」。你把家里的几本书藏得更深了。`;
    }
  });

  def('move_destiny', {
    title: '罗德岛', book: '身份',
    when: S => S.age >= 16 && S.age <= 45 && TL.combatValue(S) >= 60 && !S.opClass,
    run(S) {
      if (TL.tryJoinRhodes(S)) return '罗德岛递来一份招募资料。你决定参加面谈，了解双方是否合适。';
      return '你了解了罗德岛的招募要求，目前还不符合申请条件。';
    }
  });

  // ========== 罗德岛招募扩展路径 ==========

  def('rhodes_scholar', {
    title: '罗德岛 · 学者路径', book: '身份',
    when: S => S.age >= 18 && S.age <= 35 && S.st.sm >= 75 && !S.opClass && S.eduLevel >= 3,
    max: 1,
    cd: 0,
    run(S) {
      if (TL.tryJoinRhodes(S)) return '罗德岛对你的专业经历感兴趣，邀请你参加岗位面谈。';
      return '你了解了罗德岛的招募要求，目前还不符合申请条件。';
    }
  });

  def('rhodes_rescued', {
    title: '罗德岛 · 救援', book: '身份',
    when: S => S.age >= 12 && S.age <= 50 && !S.opClass && (S.flags.postCatastrophe || S.flags.inWarZone || (S.ori && S.ori.stage >= 2)),
    max: 1,
    cd: 0,
    run(S) {
      if (TL.tryJoinRhodes(S)) return '救援中，你接触到了罗德岛。身体情况允许后，你申请参加招募面谈；治疗援助不以入职为条件。';
      return '你了解了罗德岛的招募要求，目前还不符合申请条件。';
    }
  });

  def('rhodes_family_paid', {
    title: '罗德岛 · 家人的选择', book: '身份',
    when: S => S.age >= 10 && S.age <= 30 && S.ori && S.ori.stage >= 1 && !S.opClass && !S.ori.treated && S.q >= 3,
    max: 1,
    cd: 0,
    run(S) {
      const n = TL.NATION_BY_ID[S.nation];
      const canAfford = S.q >= 4 || TL.chance(0.3);
      if (canAfford && TL.chance(0.4)) {
        S.ori.treated = true;
        S.ori.provider = 'rhodes';
        S.flags.rhodesFamily = true;
        TL.eff(S, { h: 10, so: 8, hl: 5 });
        S.money -= n.ppp * 8;
        return TL.L`家里人凑了一笔钱，把你送上了罗德岛的医疗船。医生说还不能根治，但长期治疗能抑制病情。家人签字的时候手在抖：活着就好。`;
      }
      TL.eff(S, { h: -8, so: -3 });
      return TL.L`家里打听到罗德岛可以提供抑制治疗，但费用很高。账算了一晚上，还是没有凑够。`;
    }
  });

  def('rhodes_specialist_recruit', {
    title: '罗德岛 · 特殊招募', book: '身份',
    when: S => S.age >= 16 && S.age <= 40 && !S.opClass && (S.arts >= 80 || S.race === 'draco' || S.race === 'vouivre' || (S.court && S.court !== 'none')),
    max: 1,
    cd: 0,
    run(S) {
      if (TL.tryJoinRhodes(S)) return '招募人员注意到你的技艺，邀请你谈谈协作方式与行动判断。';
      return '你了解了罗德岛的招募要求，目前还不符合申请条件。';
    }
  });

  def('rhodes_cooperation', {
    title: '罗德岛 · 合作协议', book: '身份',
    when: S => S.age >= 20 && S.age <= 45 && !S.opClass && (S.job === 'mercenary' || S.job === 'soldier' || S.job === 'oridoc' || S.job === 'witch'),
    max: 1,
    cd: 0,
    run(S) {
      if (TL.tryJoinRhodes(S)) return '合作任务结束后，罗德岛邀请你参加长期岗位的面谈。';
      return '你了解了罗德岛的招募要求，目前还不符合申请条件。';
    }
  });

  def('faith_found', {
    title: '信了什么', book: '信仰',
    when: S => S.age >= 18 && !S.flags.faith,
    run(S) {
      S.flags.faith = TL.pick(['律法', '耶拉冈德', '英雄', '祖灵', '海', '天师']);
      TL.eff(S, { h: 7, so: 5, sm: 2 });
      const f = S.flags.faith;
      const lines = {
        律法: TL.L`你开始去听律法的宣讲。台上的人说，律法不偏待人。你想相信这句话。`,
        耶拉冈德: TL.L`你对着圣山的方向行了礼。没有人要求你这么做。`,
        英雄: TL.L`你去看了十二英雄的雕像。你在其中一个下面站了很久。`,
        祖灵: TL.L`雪祀替你念了一段。你听不懂，但心里安静了一些。`,
        海: TL.L`你对着海站了很久。你没有祈祷，只是站着。`,
        天师: TL.L`你跟着人学了几句清心的口诀。没什么用，但念着舒服。`
      };
      return lines[f] || TL.L`你找到了一个可以信的东西。`;
    }
  });

  def('old_parent', {
    title: '父母老了', book: '家庭',
    when: S => S.age >= 30 && S.fam.mom.alive && S.fam.dad.alive,
    run(S) {
      TL.eff(S, { h: -5, so: 5, money: -2 });
      return TL.pick([
        TL.L`母亲的手开始抖了。她还想自己做饭，你没拦。`,
        TL.L`父亲第一次让你扶他下台阶。他什么也没说。`,
        TL.L`你回去看他们，发现屋子比记忆里小了一圈。`
      ]);
    }
  });

  def('kid_grow', {
    title: '孩子长大', book: '家庭',
    when: S => S.fam.kids.some(k => k.alive && k.age >= 5 && k.age <= 20),
    run(S) {
      const k = S.fam.kids.filter(x => x.alive && x.age >= 5 && x.age <= 20)[0];
      TL.eff(S, { h: 7, so: 5 });
      if (!k) return TL.L`孩子们在长大。`;
      return TL.pick([
        TL.L`${k.name}第一次自己去上学，回来的时候手里攥着一朵不知从哪摘的花。`,
        TL.L`${k.name}问你为什么有的人住在城外。你想了很久才回答。`,
        TL.L`${k.name}开始有自己的秘密了。你装作没发现。`,
        TL.L`${k.name}学你的样子干活，做得一塌糊涂。你没忍住笑了。`
      ]);
    }
  });

  def('neighbor_help', {
    title: '邻居', book: '日常',
    when: S => S.age >= 10,
    run(S) {
      TL.eff(S, { so: 6, h: 4 });
      return TL.pick([
        TL.L`隔壁的人家送了一碗菜过来，说是做多了。其实你知道不是。`,
        TL.L`下大雨那天，邻居帮你把晾在外面的东西收了。`,
        TL.L`你病了两天，是隔壁的人替你买的水。`
      ]);
    }
  });

  def('small_luck', {
    title: '一点运气', book: '日常',
    when: S => S.age >= 12,
    run(S) {
      const g = TL.NATION_BY_ID[S.nation].ppp * TL.range(0.3, 1.6);
      S.money += g;
      TL.eff(S, { h: 6 });
      return TL.pick([
        TL.L`你在旧衣服里翻出一笔早就忘了的钱。数目不大，但那天你心情很好。`,
        TL.L`你捡到了一个钱包，还给了失主。对方硬塞给你一点谢礼。`,
        TL.L`你随手买的号中了最小的那个奖。你把钱换成了酒，请了几个人。`
      ]);
    }
  });

  /* ====================================================================== */
  /* ⑩ 组织路线：招募、服役与人物联系                                      */
  /* ====================================================================== */
  // 返回当前状态下可以看到的组织路线，作为招募与面试的共同输入。
  TL.organizationOpportunities = function (S) {
    if (!TL.ORGANIZATION_LIST || S.affiliation) return [];
    const out = [];
    for (const id of TL.ORGANIZATION_LIST.filter(id => !['rhodes', 'reunion'].includes(id))) {
      const o = TL.organizationDef(id);
      if (!o || !o.routes) continue;
      for (const routeId of Object.keys(o.routes)) {
        // 家族机会来自熟人引荐；这里只预检资格，真实邀请执行时才记录引荐。
        const candidate = id === 'sir_family' ? Object.assign({}, S, {
          flags: Object.assign({}, S.flags, { sirFamilyIntroducedYear: S.year })
        }) : S;
        const check = TL.organizationEligibility(candidate, id, routeId);
        if (!check.ok) continue;
        let weight = 1;
        const route = TL.organizationRouteDef(id, routeId);
        if (route.jobs && route.jobs.indexOf(S.job) >= 0) weight += 2.5;
        if (o.nations && o.nations.indexOf(S.nation) >= 0) weight += 1.5;
        if (id === 'sarkaz_mercs' && S.race === 'sarkaz') weight += 2;
        if (id === 'sir_newcourt' && S.city && S.city.indexOf('沃尔西尼') >= 0) weight += 3;
        if (id === 'lungmen_guard' && S.city && S.city.indexOf('龙门') >= 0) weight += 3;
        out.push({ organization: id, route: routeId, weight: weight, interview: check.interview });
      }
    }
    return out;
  };

  def('organization_offer', {
    title: '组织招募', book: '组织',
    when: S => S.age >= 16 && S.age <= 60 && !S.affiliation && !S.orgApplication && TL.organizationOpportunities(S).length > 0,
    max: 8, cd: 5, w: 0.8,
    run(S) {
      const choices = TL.organizationOpportunities(S);
      if (!choices.length) return '这一年没有适合你的组织招募机会。';
      const offer = TL.wpickArr(choices, 'weight');
      if (offer.organization === 'sir_family') S.flags.sirFamilyIntroducedYear = S.year;
      S.orgApplication = {
        organization: offer.organization,
        route: offer.route,
        offeredAt: S.age,
        offeredYear: S.year,
        interview: offer.interview,
        source: 'event'
      };
      TL.openDecision(S, 'organization_offer');
      if (offer.organization === 'sir_family') return '一个熟识的中间人愿意替你引荐家族。对方要先试探你的口风与立场；这意味着人情、秘密和可能卷入暴力的代价。';
      return '有人向你递来一份' + TL.organizationName(offer.organization) +
        '的招募信息，岗位是' + TL.organizationRouteName(offer.organization, offer.route) + '。';
    }
  });

  /* ====================================================================== */
  /* 事件权重                                                                */
  /* ====================================================================== */
  /**
   * 为什么需要权重：
   *   如果事件池等概率抽取，那么「意外受伤」「工伤」「心情低落」这类
   *   负面事件会以每年数次的频率反复命中，体质永远追不上同龄基准，
   *   整局寿命被随机噪声压低十几岁。
   *   给日常与正面事件更高权重，既稀释了伤害，也让日志读起来更像生活。
   */
  const W = {
    /* 日常：较高权重 */
    quiet_year: 2.0, child_play: 2.4, parent_kind: 2.0, job_found: 3.2,
    school_good: 1.8, child_work: 1.6, ori_kindness: 1.8, quit_smoke: 1.2,
    neighbor_help: 2.4, small_luck: 2.0, child_market: 2.0, child_lesson: 1.8,
    kid_grow: 2.0, work_colleague: 1.8, teen_friend: 1.8,

    /* 中性：常规权重 */
    parent_fight: 1.2, sibling_born: 1.2, school_bad: 1.2, school_fee: 1.2,
    discriminated_child: 1.1, teacher_notice: 1.2, arts_awaken: 1.8, exam: 1.6,
    child_pet: 1.2, teen_love: 1.4, teen_fight: 1.0, scholarship: 1.2,
    move_city: 0.9, sarkaz_pass: 1.1, aegir_outsider: 1.0, infected_march: 1.3,
    job_promote: 1.5, smoke_start: 1.0, drink_start: 1.0, ori_diagnosis: 1.5,
    ori_rhodes: 1.6, ori_clinic: 1.2, war_end: 1.4, ori_despair: 1.2,
    move_nomad: 1.2, blackmarket: 1.3, faith_found: 1.2, ori_community: 1.8,
    ori_medcart: 1.8, work_overtime: 1.2,
    organization_offer: 0.85, organization_contact: 0.45,

    /* 负面：压低权重 */
    child_sick: 0.7, injury_accident: 0.5, work_injury: 0.6, mental_low: 0.55,
    job_lost: 0.75, wage_theft: 0.65, biz_chance: 0.7, riot: 0.55,
    arts_accident: 0.65, ori_pain: 0.8, ori_work_ban: 0.7,
    ori_crystal_visible: 1.1, reunion_recruit: 0.9, war_battle: 1.0,
    cat_warning: 1.0, cat_aftermath: 1.0, illness: 1.0, ori_acute: 1.0,
    teen_breakup: 0.6, work_robbery: 0.6, old_parent: 1.0, merc_job: 1.0,
    move_destiny: 1.2
  };
  for (const id in W) if (TL.EVMAP[id]) TL.EVMAP[id].w = W[id];

  /* 冷却年数：剧情事件要长，日常事件可以短一些 */
  const CD = {
    quiet_year: 3, child_play: 2, move_city: 12, job_found: 1, job_lost: 6,
    job_promote: 5, wage_theft: 5, injury_accident: 5, work_injury: 6,
    mental_low: 4, biz_chance: 8, illness: 8, smoke_start: 99, drink_start: 99,
    quit_smoke: 99, arts_awaken: 99, ori_diagnosis: 99, ori_expose: 99,
    ori_acute: 8, parent_kind: 3, parent_fight: 3, sibling_born: 99,
    school_good: 3, school_bad: 3, school_fee: 4, teacher_notice: 99,
    discriminated_child: 5, child_sick: 99, child_work: 3, riot: 4,
    infected_march: 5, sarkaz_pass: 3, aegir_outsider: 5, cat_aftermath: 99,
    war_battle: 2, war_end: 99, ori_kindness: 6, ori_pain: 3, ori_work_ban: 99,
    ori_rhodes: 99, ori_clinic: 6, reunion_recruit: 99, ori_crystal_visible: 99,
    child_market: 3, child_pet: 99, child_lesson: 4, teen_friend: 99,
    teen_fight: 5, teen_love: 4, teen_breakup: 5, exam: 3, scholarship: 99,
    work_overtime: 4, work_colleague: 4, work_robbery: 8, move_nomad: 4,
    ori_community: 4, ori_medcart: 3, merc_job: 3, blackmarket: 5,
    move_destiny: 99, faith_found: 99, old_parent: 99, kid_grow: 3,
    neighbor_help: 4, small_luck: 5,
    organization_offer: 5, organization_contact: 3
  };
  for (const id in CD) if (TL.EVMAP[id]) TL.EVMAP[id].cd = CD[id];

  /* ---------------------------------------------------------------------- */
  /* 一生次数上限                                                            */
  /* ---------------------------------------------------------------------- */
  /**
   * max：同一件事在一生中最多发生几次。默认 2。
   * 人生可以长达 80 年，光靠冷却不足以阻止「同一句话出现十五次」。
   * 这里给每类事件一个符合直觉的次数上限：
   *   一次性的（出生、毕业、感染、结婚）→ 1
   *   可以重复但有限（搬家、工伤、恋爱）→ 2~4
   *   本来就该反复发生的（日常、找工作、发病）→ 8~20
   */
  const MAX = {
    /* 一次性 */
    smoke_start: 1, drink_start: 1, quit_smoke: 1, arts_awaken: 1,
    ori_expose: 1, ori_diagnosis: 1, ori_crystal_visible: 1, ori_rhodes: 1,
    ori_job_loss: 1, reunion_recruit: 1, sibling_born: 6, revenge: 1,

    /* 低频 */
    sarkaz_pass: 3, aegir_outsider: 2, discriminated_child: 3,
    teacher_notice: 1, job_promote: 4, biz_chance: 2, move_city: 3,
    infected_march: 3, riot: 3, war_end: 1, cat_warning: 4, cat_aftermath: 2,
    ori_acute: 2, parent_fight: 5, parent_kind: 4, school_fee: 3,

    /* 中频 */
    child_play: 5, child_work: 3, school_good: 5, school_bad: 4,
    injury_accident: 4, mental_low: 5, wage_theft: 5, work_injury: 4,
    job_lost: 4, ori_pain: 6, ori_kindness: 3, ori_clinic: 3,

    /* 高频（本来就是日常） */
    quiet_year: 8, job_found: 10, war_battle: 6, illness: 3,

    /* ⑨ 扩充事件 */
    child_market: 3, child_pet: 1, child_lesson: 3, teen_friend: 2,
    teen_fight: 2, teen_love: 2, teen_breakup: 2, exam: 4, scholarship: 1,
    work_overtime: 4, work_colleague: 3, work_robbery: 2, move_nomad: 3,
    ori_community: 3, ori_medcart: 5, merc_job: 4, blackmarket: 3,
    move_destiny: 1, faith_found: 1, old_parent: 1, kid_grow: 5,
    neighbor_help: 4, small_luck: 4,
    organization_offer: 8, organization_contact: 8
  };
  for (const id in MAX) if (TL.EVMAP[id]) TL.EVMAP[id].max = MAX[id];

  TL.EVMAP.illness.disabledReason = '慢病由 ncdYear 独立判定，禁止重复进入随机事件池';
  for (const id of ['ori_rhodes', 'ori_medcart', 'ori_drug_sideeffect', 'move_destiny',
    'rhodes_scholar', 'rhodes_rescued', 'rhodes_family_paid', 'rhodes_specialist_recruit', 'rhodes_cooperation']) {
    TL.EVMAP[id].organization = 'rhodes';
  }
  for (const id of ['reunion_recruit', 'reunion_choice', 'reunion_life', 'reunion_conflict']) {
    TL.EVMAP[id].organization = 'reunion';
  }
  // 巫王被推翻之后才有“残党”；与现有年表共用边界。
  TL.EVMAP.lei_witch_hunt.fromYear = TL.TIMELINE.find(e => e.id === 'lei_september').year;
  // 新增内容显式登记到调度池；不增加每年事件总数。
  TL.SUPPLEMENTAL_EVENTS = [
    'reunion_choice', 'reunion_life', 'reunion_conflict',
    'ori_hide_identity', 'ori_hiding_stress', 'ori_identity_exposed',
    'war_draft', 'war_reunion', 'ori_drug_sideeffect', 'ori_treatment_cost',
    'ori_blackmarket_drug', 'ori_folk_remedy',
    'yan_street_food', 'yan_festival', 'yan_tianshi',
    'urs_cold', 'urs_conscription', 'urs_inspection',
    'vic_fog', 'vic_nobility', 'vic_factory', 'srg_desert', 'srg_caravan',
    'kaz_arena', 'kaz_business', 'clb_tech', 'clb_frontier', 'lei_arts', 'lei_witch_hunt',
    'rhodes_scholar', 'rhodes_rescued', 'rhodes_family_paid', 'rhodes_specialist_recruit', 'rhodes_cooperation',
    'organization_offer', 'organization_contact'
  ];

  /* ====================================================================== */
  /* 排程：每年该发生什么（对应原作的事件调度）                                */
  /* ====================================================================== */
  TL.scheduleEvents = function (S) {
    const a = S.age;
    const n = TL.NATION_BY_ID[S.nation];
    if (TL.organizationScheduledDecisions) {
      for (const d of TL.organizationScheduledDecisions(S)) TL.queueEvent(S, d.at, 'dec', d.id);
    }

    // ① 抉择事件优先排入
    for (const d of TL.scheduledDecisions(S)) {
      TL.queueEvent(S, d.at, 'dec', d.id, d.p);
      // 注意：冷却/一次性标记在 openDecision() 里写入 ——
      // 只有玩家真正看到这个抉择时才算「问过了」。
    }

    // ② 每年的事件条数：幼年少，成年多
    let nEv = a < 6 ? 1 : a < 15 ? 2 : a < 60 ? 3 : 2;
    nEv += n.cat > 1.5 ? 1 : 0;   // 荒原国家事情更多

    // ③ 按阶段的事件池
    let pool;
    if (a < 6) {
      pool = ['child_sick', 'parent_fight', 'parent_kind', 'child_play', 'child_market'];
    } else if (a < 15) {
      pool = ['child_play', 'child_work', 'child_market', 'child_pet', 'child_lesson',
              'parent_fight', 'parent_kind', 'sibling_born', 'neighbor_help',
              'discriminated_child', 'school_good', 'school_bad', 'school_fee', 'exam',
              'arts_awaken', 'child_sick', 'injury_accident', 'ori_diagnosis'];
    } else if (a < 25) {
      pool = ['arts_awaken', 'arts_accident', 'school_good', 'school_bad', 'school_fee',
              'exam', 'scholarship', 'teacher_notice',
              'job_found', 'job_lost', 'work_injury', 'wage_theft', 'work_overtime',
              'work_colleague', 'injury_accident', 'mental_low', 'smoke_start', 'drink_start',
              'teen_friend', 'teen_fight', 'teen_love', 'teen_breakup',
              'sarkaz_pass', 'aegir_outsider', 'infected_march', 'move_city', 'move_nomad',
              'blackmarket', 'move_destiny', 'neighbor_help', 'small_luck', 'quiet_year'];
    } else if (a < 60) {
      pool = ['job_promote', 'job_lost', 'work_injury', 'wage_theft', 'biz_chance',
              'work_overtime', 'work_colleague', 'work_robbery', 'merc_job',
              'injury_accident', 'mental_low', 'quit_smoke', 'drink_start',
              'teen_friend', 'teen_love', 'teen_breakup',
              'old_parent', 'kid_grow', 'neighbor_help', 'small_luck', 'faith_found',
              'sarkaz_pass', 'infected_march', 'blackmarket', 'move_destiny',
              'move_city', 'move_nomad', 'quiet_year',
              'ori_pain', 'ori_kindness', 'ori_work_ban', 'ori_rhodes', 'ori_clinic',
              'ori_community', 'ori_medcart', 'reunion_recruit', 'ori_crystal_visible',
              'war_battle', 'war_end', 'riot', 'ori_diagnosis'];
    } else {
      pool = ['injury_accident', 'mental_low', 'quit_smoke', 'quiet_year',
              'kid_grow', 'neighbor_help', 'small_luck', 'faith_found',
              'ori_pain', 'ori_kindness', 'ori_rhodes', 'ori_clinic',
              'ori_community', 'ori_medcart', 'move_city'];
    }

    // ④ 天灾排程（《大地巡旅》口径：移动城市 vs 荒野）
    //    移动城市：每年 3~6 次预警，其中 1~2 次需要启动主引擎偏航规避；
    //              整城大迁徙每 3~5 年一次。
    //    荒野：不能移动。每 5~8 年一次中型天灾，
    //          每 20~30 年一次毁灭级源石风暴（致死/致残率可达 20%）。
    if (a >= 3) {
      const st = TL.stratum(S.stratum);
      if (st.urban) {
        if (TL.chance(0.20 * (n.cat + 0.5))) {
          TL.queueEvent(S, TL.rnd(), 'ev', 'cat_city');
        }
        if (a - (S.flags.lastMigrate || 0) >= 4 + Math.floor(TL.rnd() * 4)) {
          S.flags.lastMigrate = a;
          TL.queueEvent(S, TL.rnd(), 'ev', 'cat_migrate');
        }
        // 荒原边上的城市仍然可能被正面命中
        if (n.cat >= 0.8 && TL.chance(0.10 * n.cat)) {
          pool = pool.concat(['cat_warning', 'cat_aftermath']);
        }
      } else {
        if (a - (S.flags.lastWildCat || 0) >= 5 + Math.floor(TL.rnd() * 4)) {
          S.flags.lastWildCat = a;
          TL.queueEvent(S, TL.rnd(), 'ev', 'cat_wild');
        }
        if (a - (S.flags.lastMegaCat || 0) >= 20 + Math.floor(TL.rnd() * 11)) {
          S.flags.lastMegaCat = a;
          TL.queueEvent(S, TL.rnd(), 'ev', 'cat_mega');
        }
        pool = pool.concat(['cat_aftermath']);
      }
    }
    // ⑤ 感染者迫害：容忍度越低的国家，纠察队来得越勤
    if (S.ori && S.ori.stage > 0 && a >= 10) {
      const ti = TL.tolInfo(S.nation, S.year);
      if (ti.arrest > 0 && TL.chance(ti.arrest * 0.9)) {
        TL.queueEvent(S, TL.rnd(), 'ev', 'ori_arrest');
      }
      if (S.job === 'slave') {
        TL.queueEvent(S, TL.rnd(), 'ev', 'slave_life');
        // 每年约 12% 的机会离开矿坑（赎人 / 特赦 / 逃 / 病退），见 slave_out
        if (TL.chance(0.12)) TL.queueEvent(S, TL.rnd(), 'ev', 'slave_out');
      }
    }

    // ⑥ 阶层日常：城里和荒野的日子不是同一种日子
    const _st = TL.stratum(S.stratum);
    if (_st.urban) {
      if (a >= 12 && TL.chance(0.28)) pool = pool.concat(['core_screen']);
      if (a >= 16 && TL.chance(0.22)) pool = pool.concat(['core_service']);
    } else {
      if (a >= 6 && TL.chance(0.30)) pool = pool.concat(['wild_beast']);
      if (TL.chance(0.26)) pool = pool.concat(['wild_water']);
    }
    // ⑤ 高危职业的额外暴露：注意这里不能直接「保证」一次感染事件。
    //    职业暴露已经体现在 TL.oriRisk() 的 jobK 里（源石采掘工 ×14）。
    //    早期版本在这里把 ori_expose 重复塞进池子，结果几十年职业生涯里
    //    几乎必然命中，终生感染率被推到 35%。现在改为极低概率的「急性暴露」，
    //    它只是让当年风险额外抬高，而不是直接判定感染。
    const J = TL.JOBS[S.job];
    if (!S.ori && J && J.ori > 2.0 && TL.chance(0.012 * J.ori)) {
      pool = pool.concat(['ori_acute']);
    }

    if (a >= 6) pool = pool.concat(TL.SUPPLEMENTAL_EVENTS.filter(id =>
      !id.startsWith('org_') && id !== 'organization_contact'));
    // 成员每年获得一个组织事件机会，占用原有事件位，避免额外堆叠风险。
    const organizationEvent = TL.pickOrganizationEvent ? TL.pickOrganizationEvent(S) : null;
    if (organizationEvent) {
      TL.queueEvent(S, TL.rnd(), 'ev', organizationEvent);
      nEv--;
    }

    // ⑥ 排入
    const used = {};
    for (let i = 0; i < nEv; i++) {
      let id = null, tries = 0;
      while (tries++ < 12) {
        const c = pickFrom(S, pool);
        if (c && (!used[c] || pool.length < 6)) { id = c; break; }
      }
      if (id) { used[id] = 1; TL.queueEvent(S, TL.rnd(), 'ev', id); }
    }

    // ⑦ 感染判定：即使没有专门事件，也每年独立判定一次
    if (!S.ori && a >= 3) {
      // 急性暴露的加成只属于发生暴露的那一年；上一年末的状态先清掉。
      S.flags.oriSurge = 0;
      const p = TL.oriRisk(S);
      if (TL.chance(p)) {
        TL.queueEvent(S, TL.rnd(), 'ev', 'ori_expose', { type: TL.exposureTypeFor(S) });
      }
    }

    // ⑧ 慢病发病：独立风险，不占事件位
    TL.ncdYear(S);
  };

  /* ====================================================================== */
  /* 天灾（独立入口，供 choice 调用）                                          */
  /* ====================================================================== */
  TL.catastrophe = function (S, p) {
    const e = TL.EVMAP['cat_warning'];
    if (e) e.run(S, p);
  };

  /* ====================================================================== */
  /* 职业抽取（对应原作的职业分配）                                            */
  /* ====================================================================== */
  /**
   * 按角色的学历、学识、技艺、种族、歧视程度抽一个职业。
   * 这是本作「社会结构」最直接的体现：
   *   歧视高 → 高端职业池被大幅削减
   *   技艺高 → 干员/术师路线打开
   */
  TL.rollJob = function (S) {
    const n = TL.NATION_BY_ID[S.nation];
    const d = TL.totalDiscrimination(S);
    const pool = [];
    for (const id in TL.JOBS) {
      const J = TL.JOBS[id];
      if (!TL.jobAvailable(id, S.nation, S.race)) continue;
      if (J.edu > S.eduLevel) continue;
      // 注意量纲：JOBS 里的 art 是 0..1 的门槛比例，S.arts 是 0..100 的适应性。
      // 早期版本直接写 `J.art > S.arts`，等于门槛永远不生效 ——
      // 一个技艺 38 的人也能当术师。
      if (J.art * 100 > S.arts) continue;
      // 干员路线需要满足额外条件
      if (J.cls) {
        if (!S.affiliation || S.affiliation !== 'rhodes') continue;
        if (!TL.organizationAvailable(S, 'rhodes')) continue;
        if (S.age < 16) continue;
        if (TL.combatValue(S) < 45) continue;
      }
      let w = 1;
      // 学识匹配度
      w *= 0.4 + J.hi;
      // 歧视：越体面的工作越排斥异族与感染者
      w *= Math.pow(1 - d * (J.disc || 0.4), 2.2);
      // 性别倾向
      if (J.sex === 'M' && S.sex === 'F') w *= 0.35;
      if (J.sex === 'F' && S.sex === 'M') w *= 0.35;
      // 家境
      if (J.sec === 'biz' && S.q < 3) w *= 0.3;
      if (J.sec === 'know' && S.q < 2) w *= 0.5;
      // 技艺路线
      if (J.sec === 'art' || J.cls === 'caster' || J.cls === 'supporter') w *= 0.3 + S.arts / 60;
      // 失业率高时低端工作更容易拿到
      if (n.med > 0.8 && J.sec === 'know') w *= 1.3;
      if (w > 0) pool.push({ id: id, w: w });
    }
    if (!pool.length) return TL.jobAvailable('vendor', S.nation, S.race) ? 'vendor' : 'seeking';
    return TL.wpickArr(pool).id;
  };

  /** 兼容旧剧情入口：true 表示开始面试，录用后才改变职业。 */
  TL.tryJoinRhodes = function (S) {
    const result = TL.tryJoinOrganization(S, 'rhodes', 'operator');
    return result.status === 'interview' || result.ok === true;
  };

})(window.TL = window.TL || {});
