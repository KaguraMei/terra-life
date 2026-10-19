/* ==========================================================================
 * TERRA LIFE SIM — 组织与势力注册表
 * --------------------------------------------------------------------------
 * 组织归属与谋生职业分开保存：S.job 仍然回答「靠什么吃饭」，
 * S.affiliation 回答「属于谁」。本文件只登记设定事实、路线入口和
 * 面试系统将来需要的画像接口；具体招募/服役事件放在 events.js。
 *
 * sourceType:
 *   canon        项目年表或官方设定已有明确依据
 *   prts         PRTS 条目能确认组织存在，但没有完整招募规则
 *   project-rule 为游戏可玩性补足的门槛/年份/概率
 * ========================================================================== */
(function (TL) {
  'use strict';

  const r = (name, en, o) => Object.assign({ name, en }, o || {});
  const profile = (axes, questionPool) => ({
    version: 1,
    axes: axes || [],
    questionPool: questionPool || null,
    evaluator: 'TL.evaluateOrganizationInterview'
  });

  TL.ORGANIZATIONS = {
    /* ---------------- 既有路线：统一迁移到注册表 ---------------- */
    rhodes: {
      name: '罗德岛', en: 'Rhodes Island', kind: 'operator',
      fromYear: 1095, sourceType: 'project-rule', confidence: 'inferred',
      contacts: [
        { id: 'doctor', name: '博士', en: 'The Doctor', chance: 0.035, minRank: 1 },
        { id: 'amiya', name: '阿米娅', en: 'Amiya', chance: 0.045, minRank: 0 }
      ],
      routes: {
        operator: {
          name: '干员', en: 'Operator', minAge: 16,
          ranks: [
            r('实习干员', 'Trainee', { needYears: 0 }),
            r('正式干员', 'Operator', { needYears: 1 }),
            r('资深干员', 'Senior Operator', { needYears: 6 }),
            r('精英干员', 'Elite Operator', { needYears: 16 })
          ],
          interview: profile(['combat', 'teamwork', 'ethics'], 'rhodes_operator')
        }
      }
    },
    reunion: {
      name: '整合运动', en: 'Reunion Movement', kind: 'insurgent',
      nations: ['URS'], fromYear: 1094, untilYear: 1095,
      admission: '营地接纳', unpaid: true, subsistence: 0.52,
      source: 'https://prts.wiki/w/泰拉大典:组织/整合运动',
      sourceType: 'prts', confidence: 'inferred',
      require: S => TL.reunionContactCurrent(S),
      routes: {
        infected: {
          name: '感染者成员', en: 'Infected Member', minAge: 15,
          require: S => !!(S.ori && S.ori.stage > 0),
          ranks: [
            r('营地成员', 'Camp Member', { needYears: 0 }),
            r('行动组成员', 'Cell Member', { needYears: 1 }),
            r('小队骨干', 'Cell Leader', { needYears: 5 })
          ],
          interview: profile(['survival', 'solidarity', 'risk'], 'reunion_infected')
        }
      }
    },

    /* ---------------- 哥伦比亚：公司与基金 ---------------- */
    rhine_life: {
      name: '莱茵生命', en: 'Rhine Lab', kind: 'company',
      nations: ['CLB'], fromYear: 1085, sourceType: 'prts', confidence: 'documented',
      source: 'https://prts.wiki/w/泰拉大典:组织/莱茵生命',
      contacts: [
        { id: 'kristen', name: '克丽斯腾', en: 'Kristen', chance: 0.018, minRank: 2 },
        { id: 'saria', name: '塞雷娅', en: 'Saria', chance: 0.025, minRank: 1 },
        { id: 'muelsyse', name: '缪尔赛思', en: 'Muelsyse', chance: 0.028, minRank: 1 },
        { id: 'doro', name: '多萝西', en: 'Dorothy', chance: 0.022, minRank: 1 }
      ],
      routes: {
        research: {
          name: '科学研究', en: 'Research', minAge: 18, edu: 3,
          jobs: ['scholar', 'doctor', 'oridoc', 'caster', 'alchemist'],
          require: S => S.st.sm >= 62,
          interview: profile(['research', 'ethics', 'independence'], 'rhine_research'),
          ranks: [r('研究助理', 'Research Assistant', { needYears: 0 }), r('科室研究员', 'Researcher', { needYears: 2 }), r('项目负责人', 'Project Lead', { needYears: 8 })]
        },
        engineering: {
          name: '工程与构件', en: 'Engineering', minAge: 18, edu: 1,
          jobs: ['engineer', 'mechanic', 'construct', 'factory'],
          require: S => S.st.sm >= 42 || S.arts >= 45,
          interview: profile(['engineering', 'safety', 'teamwork'], 'rhine_engineering'),
          ranks: [r('工程助理', 'Engineering Assistant', { needYears: 0 }), r('工程师', 'Engineer', { needYears: 2 }), r('首席工程师', 'Chief Engineer', { needYears: 9 })]
        },
        defense: {
          name: '防卫科', en: 'Security', minAge: 18,
          jobs: ['guard', 'police', 'soldier', 'mercenary', 'bounty'],
          require: S => TL.combatValue(S) >= 42,
          interview: profile(['discipline', 'risk', 'ethics'], 'rhine_security'),
          ranks: [r('防卫队员', 'Security Staff', { needYears: 0 }), r('防卫干员', 'Security Operator', { needYears: 2 }), r('防卫主管', 'Security Lead', { needYears: 8 })]
        },
        fieldwork: {
          name: '科学考察', en: 'Fieldwork', minAge: 18,
          jobs: ['hunter', 'courier', 'mercenary', 'scholar', 'journalist'],
          require: S => S.st.hl >= 45 && (S.st.sm >= 42 || S.arts >= 35),
          interview: profile(['adaptability', 'observation', 'risk'], 'rhine_fieldwork'),
          ranks: [r('考察助理', 'Field Assistant', { needYears: 0 }), r('考察员', 'Field Researcher', { needYears: 3 }), r('考察主管', 'Field Lead', { needYears: 10 })]
        },
        business: {
          name: '商务与人力', en: 'Business', minAge: 20, edu: 2,
          jobs: ['merchant', 'banker', 'lawyer', 'official', 'journalist'],
          require: S => S.q >= 3 && S.st.so >= 45,
          interview: profile(['negotiation', 'loyalty', 'ethics'], 'rhine_business'),
          ranks: [r('商务助理', 'Business Assistant', { needYears: 0 }), r('项目联络', 'Account Liaison', { needYears: 3 }), r('商务主管', 'Business Lead', { needYears: 10 })]
        }
      }
    },
    melander: {
      name: '梅兰德基金会', en: 'Melander Foundation', kind: 'foundation',
      nations: ['CLB'], fromYear: 1085, sourceType: 'prts', confidence: 'inferred',
      source: 'https://prts.wiki/w/泰拉大典:组织/其他#梅兰德基金会',
      contacts: [{ id: 'selene', name: '梅兰德·塞勒涅', en: 'Melander Selene', chance: 0.012, minRank: 1 }],
      routes: {
        investigation: {
          name: '项目调查', en: 'Investigation', minAge: 20, edu: 2,
          jobs: ['scholar', 'journalist', 'lawyer', 'bounty'],
          require: S => S.st.sm >= 55,
          interview: profile(['independence', 'evidence', 'ethics'], 'melander_investigation'),
          ranks: [r('受资助调查员', 'Funded Investigator', { needYears: 0 }), r('项目调查员', 'Project Investigator', { needYears: 3 }), r('基金会联络', 'Foundation Liaison', { needYears: 9 })]
        },
        relief: {
          name: '救援项目', en: 'Relief', minAge: 18,
          jobs: ['doctor', 'oridoc', 'nurse', 'teacher', 'courier'],
          require: S => S.st.so >= 48,
          interview: profile(['empathy', 'logistics', 'risk'], 'melander_relief'),
          ranks: [r('救援志愿者', 'Relief Volunteer', { needYears: 0 }), r('项目执行员', 'Program Officer', { needYears: 2 }), r('救援主管', 'Relief Lead', { needYears: 8 })]
        },
        liaison: {
          name: '外部联络', en: 'External Liaison', minAge: 20, edu: 2,
          jobs: ['merchant', 'banker', 'lawyer', 'official', 'journalist'],
          require: S => S.st.so >= 55,
          interview: profile(['negotiation', 'trust', 'publicGood'], 'melander_liaison'),
          ranks: [r('联络助理', 'Liaison Assistant', { needYears: 0 }), r('项目联络', 'Project Liaison', { needYears: 3 }), r('高级联络', 'Senior Liaison', { needYears: 9 })]
        }
      }
    },
    blacksteel: {
      name: '黑钢国际', en: 'Blacksteel Worldwide', kind: 'security-company',
      fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      source: 'https://prts.wiki/w/泰拉大典:组织/黑钢国际',
      contacts: [
        { id: 'franka', name: '芙兰卡', en: 'Franka', chance: 0.025, minRank: 1 },
        { id: 'liskarm', name: '雷蛇', en: 'Liskarm', chance: 0.025, minRank: 1 }
      ],
      routes: {
        security: {
          name: '安保与战术', en: 'Security and Tactics', minAge: 18,
          jobs: ['guard', 'police', 'soldier', 'mercenary', 'bounty'],
          require: S => TL.combatValue(S) >= 42,
          interview: profile(['discipline', 'teamwork', 'risk'], 'blacksteel_security'),
          ranks: [r('见习安保', 'Security Trainee', { needYears: 0 }), r('合同安保', 'Contract Security', { needYears: 1 }), r('战术组长', 'Tactical Lead', { needYears: 7 })]
        },
        engineering: {
          name: '装备技术', en: 'Equipment Technician', minAge: 18, edu: 2,
          jobs: ['engineer', 'mechanic', 'artsmith'],
          require: S => S.st.sm >= 48,
          interview: profile(['engineering', 'safety', 'teamwork'], 'blacksteel_engineering'),
          ranks: [r('技术助理', 'Technical Assistant', { needYears: 0 }), r('装备技师', 'Equipment Technician', { needYears: 2 }), r('技术主管', 'Technical Lead', { needYears: 8 })]
        }
      }
    },
    penguin_logistics: {
      name: '企鹅物流', en: 'Penguin Logistics', kind: 'logistics',
      fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      source: 'https://prts.wiki/w/泰拉大典:组织/企鹅物流',
      contacts: [
        { id: 'emperor', name: '大帝', en: 'Emperor', chance: 0.008, minRank: 1 },
        { id: 'texas', name: '德克萨斯', en: 'Texas', chance: 0.026, minRank: 1 },
        { id: 'exusiai', name: '能天使', en: 'Exusiai', chance: 0.026, minRank: 1 }
      ],
      routes: {
        delivery: {
          name: '长途运输', en: 'Long-Haul Delivery', minAge: 16,
          jobs: ['courier', 'driver', 'merchant'],
          require: S => S.st.hl >= 38,
          interview: profile(['reliability', 'adaptability', 'risk'], 'penguin_delivery'),
          ranks: [r('运输新人', 'Delivery Recruit', { needYears: 0 }), r('运输干员', 'Courier', { needYears: 1 }), r('路线负责人', 'Route Lead', { needYears: 6 })]
        },
        security: {
          name: '押运与护卫', en: 'Escort and Security', minAge: 18,
          jobs: ['guard', 'soldier', 'mercenary', 'bounty', 'performer'],
          require: S => TL.combatValue(S) >= 38,
          interview: profile(['combat', 'teamwork', 'judgment'], 'penguin_security'),
          ranks: [r('临时护卫', 'Temporary Guard', { needYears: 0 }), r('押运员', 'Escort', { needYears: 2 }), r('行动协调', 'Mission Coordinator', { needYears: 8 })]
        }
      }
    },

    /* ---------------- 萨卡兹 / 卡兹戴尔 ---------------- */
    sarkaz_mercs: {
      name: '萨卡兹佣兵团', en: 'Sarkaz Mercenary Companies', kind: 'mercenary',
      nations: null, fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      contacts: [
        { id: 'merc_captain', name: '佣兵队长', en: 'Mercenary Captain', chance: 0.045, minRank: 0 },
        { id: 'manfred', name: '曼弗雷德', en: 'Manfred', chance: 0.006, minRank: 2, fromYear: 1094 }
      ],
      routes: {
        contract: {
          name: '佣兵合同', en: 'Contract Mercenary', minAge: 16,
          jobs: ['mercenary', 'soldier', 'guard', 'bounty', 'hunter'],
          require: S => S.race === 'sarkaz' || TL.combatValue(S) >= 38,
          interview: profile(['combat', 'contract', 'risk'], 'sarkaz_contract'),
          ranks: [r('见习佣兵', 'Contract Recruit', { needYears: 0 }), r('合同佣兵', 'Contract Mercenary', { needYears: 1 }), r('老兵', 'Veteran', { needYears: 6 }), r('合同队长', 'Contract Captain', { needYears: 14 })]
        },
        veteran: {
          name: '资深战斗员', en: 'Veteran Fighter', minAge: 24,
          jobs: ['mercenary', 'soldier', 'bounty'],
          require: S => TL.combatValue(S) >= 58,
          interview: profile(['command', 'loyalty', 'risk'], 'sarkaz_veteran'),
          ranks: [r('战斗员', 'Fighter', { needYears: 0 }), r('老兵', 'Veteran', { needYears: 3 }), r('副队长', 'Second-in-command', { needYears: 9 })]
        }
      }
    },
    kazdel_military: {
      name: '卡兹戴尔军事委员会', en: 'Kazdel Military Commission', kind: 'military',
      nations: ['KDZ'], fromYear: 1094, sourceType: 'prts', confidence: 'project-rule',
      contacts: [{ id: 'military_officer', name: '军事委员会军官', en: 'Military Officer', chance: 0.02, minRank: 1 }],
      routes: {
        field: {
          name: '王庭军外勤', en: 'Field Service', minAge: 18,
          jobs: ['soldier', 'guard', 'mercenary', 'bounty'],
          require: S => S.race === 'sarkaz' && TL.combatValue(S) >= 45,
          interview: profile(['discipline', 'loyalty', 'command'], 'kazdel_military'),
          ranks: [r('候补兵', 'Military Candidate', { needYears: 0 }), r('外勤士兵', 'Field Soldier', { needYears: 2 }), r('军官候补', 'Officer Candidate', { needYears: 8 })]
        }
      }
    },
    karlan_trade: {
      name: '喀兰贸易', en: 'Karlan Trade', kind: 'company',
      nations: ['KJR'], fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      source: 'https://prts.wiki/w/泰拉大典:组织/喀兰贸易',
      contacts: [
        { id: 'silverash', name: '银灰', en: 'SilverAsh', chance: 0.012, minRank: 2 },
        { id: 'dengen', name: '锏', en: 'Degenbrecher', chance: 0.012, minRank: 2 }
      ],
      routes: {
        trade: {
          name: '贸易与外联', en: 'Trade and Liaison', minAge: 18,
          jobs: ['merchant', 'banker', 'official', 'courier', 'journalist'],
          require: S => S.st.so >= 42,
          interview: profile(['negotiation', 'trust', 'adaptability'], 'karlan_trade'),
          ranks: [r('贸易助理', 'Trade Assistant', { needYears: 0 }), r('商务代表', 'Business Representative', { needYears: 2 }), r('地区负责人', 'Regional Manager', { needYears: 8 })]
        },
        escort: {
          name: '商路护卫', en: 'Trade Route Escort', minAge: 18,
          jobs: ['guard', 'soldier', 'mercenary', 'hunter'],
          require: S => TL.combatValue(S) >= 38,
          interview: profile(['discipline', 'risk', 'publicProtection'], 'karlan_escort'),
          ranks: [r('护卫候补', 'Escort Candidate', { needYears: 0 }), r('商路护卫', 'Route Guard', { needYears: 2 }), r('护卫队长', 'Escort Captain', { needYears: 8 })]
        }
      }
    },
    raythean: {
      name: '雷神工业', en: 'Raythean Industries', kind: 'company',
      nations: ['CLB'], fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      source: 'https://prts.wiki/w/泰拉大典:组织/雷神工业',
      contacts: [{ id: 'raythean_director', name: '雷神工业项目主管', en: 'Raythean Project Director', chance: 0.018, minRank: 1 }],
      routes: {
        engineering: {
          name: '武器与装备研发', en: 'Weapons and Equipment R&D', minAge: 18, edu: 2,
          jobs: ['engineer', 'mechanic', 'artsmith', 'scholar'],
          require: S => S.st.sm >= 48 || S.arts >= 55,
          interview: profile(['engineering', 'safety', 'innovation'], 'raythean_engineering'),
          ranks: [r('研发助理', 'R&D Assistant', { needYears: 0 }), r('装备研发员', 'Equipment Researcher', { needYears: 2 }), r('项目主管', 'Project Lead', { needYears: 8 })]
        },
        testing: {
          name: '外场测试', en: 'Field Testing', minAge: 18,
          jobs: ['soldier', 'guard', 'mercenary', 'bounty', 'engineer'],
          require: S => TL.combatValue(S) >= 38 && S.st.hl >= 40,
          interview: profile(['risk', 'discipline', 'observation'], 'raythean_testing'),
          ranks: [r('测试员', 'Test Operator', { needYears: 0 }), r('高级测试员', 'Senior Tester', { needYears: 3 }), r('测试组长', 'Test Lead', { needYears: 9 })]
        }
      }
    },
    babel: {
      name: '巴别塔', en: 'Babel', kind: 'military',
      nations: ['KDZ'], fromYear: 1086, untilYear: 1093,
      sourceType: 'canon', confidence: 'documented',
      contacts: [{ id: 'theresa', name: '特蕾西娅', en: 'Theresa', chance: 0.008, minRank: 1 }],
      routes: {
        sarkaz: {
          name: '萨卡兹解放军', en: 'Sarkaz Liberation Force', minAge: 16,
          jobs: ['soldier', 'guard', 'mercenary', 'bounty', 'witch'],
          require: S => S.race === 'sarkaz' && !!S.flags.babel_ask && TL.combatValue(S) >= 38,
          interview: profile(['loyalty', 'solidarity', 'risk'], 'babel_sarkaz'),
          ranks: [r('协作者', 'Associate', { needYears: 0 }), r('行动成员', 'Field Member', { needYears: 1 }), r('行动组骨干', 'Cell Lead', { needYears: 5 })]
        }
      }
    },

    /* ---------------- 拉特兰 ---------------- */
    laterano_gunknights: {
      name: '拉特兰教宗铳骑', en: 'Laterano Pontifical Gun-Knights', kind: 'military',
      nations: ['LAT'], fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      contacts: [{ id: 'gunknight', name: '铳骑教官', en: 'Gun-Knight Instructor', chance: 0.028, minRank: 1 }],
      routes: {
        gunknight: {
          name: '铳骑', en: 'Gun-Knight', minAge: 18,
          jobs: ['guard', 'soldier', 'police', 'op_sniper'],
          require: S => (S.race === 'sankta' || S.nation === 'LAT') && (S.arts >= 48 || TL.combatValue(S) >= 45),
          interview: profile(['discipline', 'faith', 'precision'], 'laterano_gunknight'),
          ranks: [r('铳骑候补', 'Gun-Knight Candidate', { needYears: 0 }), r('铳骑', 'Gun-Knight', { needYears: 2 }), r('资深铳骑', 'Senior Gun-Knight', { needYears: 8 })]
        }
      }
    },
    laterano_guard: {
      name: '拉特兰戍卫部队', en: 'Laterano Guard Corps', kind: 'military',
      nations: ['LAT'], fromYear: 1031, sourceType: 'prts', confidence: 'project-rule',
      contacts: [{ id: 'guard_officer', name: '戍卫队军官', en: 'Guard Officer', chance: 0.035, minRank: 1 }],
      routes: {
        guard: {
          name: '戍卫部队', en: 'Guard Corps', minAge: 16,
          jobs: ['guard', 'soldier', 'police'],
          require: S => S.race === 'sankta' || TL.combatValue(S) >= 32,
          interview: profile(['discipline', 'publicProtection', 'teamwork'], 'laterano_guard'),
          ranks: [r('戍卫候补', 'Guard Candidate', { needYears: 0 }), r('戍卫队员', 'Guard', { needYears: 1 }), r('戍卫小队长', 'Guard Squad Leader', { needYears: 7 })]
        }
      }
    },

    /* ---------------- 卡西米尔 ---------------- */
    kaz_knights: {
      name: '卡西米尔骑士竞技体系', en: 'Kazimierz Knight Circuit', kind: 'arena',
      nations: ['KAZ'], fromYear: 1050, sourceType: 'canon', confidence: 'documented',
      contacts: [
        { id: 'knight_association', name: '骑士协会', en: 'Knight Association', chance: 0.025, minRank: 1 },
        { id: 'redpine', name: '红松骑士团成员', en: 'Pinus Sylvestris Member', chance: 0.012, minRank: 2, fromYear: 1094 }
      ],
      routes: {
        arena: {
          name: '竞技骑士', en: 'Arena Knight', minAge: 16,
          jobs: ['knight', 'guard', 'soldier', 'mercenary'],
          require: S => TL.combatValue(S) >= 45,
          interview: profile(['combat', 'showmanship', 'ethics'], 'kaz_arena'),
          ranks: [r('训练骑士', 'Training Knight', { needYears: 0 }), r('签约骑士', 'Sponsored Knight', { needYears: 1 }), r('正式骑士', 'Licensed Knight', { needYears: 5 }), r('冠军候选', 'Champion Contender', { needYears: 12 })]
        },
        infected: {
          name: '感染者骑士团', en: 'Infected Knight Route', minAge: 16,
          jobs: ['knight', 'guard', 'mercenary'],
          require: S => !!(S.ori && S.ori.stage > 0) && TL.combatValue(S) >= 42,
          interview: profile(['solidarity', 'combat', 'publicImage'], 'kaz_infected_knight'),
          ranks: [r('地下骑士', 'Underground Knight', { needYears: 0 }), r('公开骑士', 'Public Knight', { needYears: 3 }), r('红松协作者', 'Pinus Ally', { needYears: 9 })]
        }
      }
    },

    /* ---------------- 龙门 ---------------- */
    lungmen_guard: {
      name: '龙门近卫局', en: 'Lungmen Guard Department', kind: 'police',
      nations: ['LMN'], fromYear: 1070, sourceType: 'prts', confidence: 'project-rule',
      source: 'https://prts.wiki/w/泰拉大典:组织/龙门近卫局',
      contacts: [
        { id: 'chen', name: '陈', en: 'Ch’en', chance: 0.018, minRank: 1 },
        { id: 'hoshi', name: '星熊', en: 'Hoshiguma', chance: 0.026, minRank: 1 },
        { id: 'swire', name: '诗怀雅', en: 'Swire', chance: 0.014, minRank: 2 }
      ],
      routes: {
        police: {
          name: '警员', en: 'Patrol Officer', minAge: 18,
          jobs: ['police', 'guard', 'soldier'],
          require: S => S.st.so >= 35 && (S.st.sm >= 35 || S.q >= 3),
          interview: profile(['discipline', 'publicProtection', 'judgment'], 'lungmen_police'),
          ranks: [r('警员候补', 'Police Candidate', { needYears: 0 }), r('正式警员', 'Police Officer', { needYears: 1 }), r('小队成员', 'Squad Member', { needYears: 5 }), r('高级警司', 'Senior Superintendent', { needYears: 12 })]
        },
        special: {
          name: '特别督察组', en: 'Special Inspection Unit', minAge: 22,
          jobs: ['police', 'guard', 'soldier', 'bounty'],
          require: S => TL.combatValue(S) >= 55 && S.st.sm >= 48,
          interview: profile(['judgment', 'discipline', 'publicProtection'], 'lungmen_special'),
          ranks: [r('特别督察候补', 'Inspector Candidate', { needYears: 0 }), r('特别督察', 'Special Inspector', { needYears: 2 }), r('资深督察', 'Senior Inspector', { needYears: 7 })]
        }
      }
    },

    /* ---------------- 炎国 ---------------- */
    yan_sishuitai: {
      name: '炎国司岁台', en: 'Yan Sui Office', kind: 'state',
      nations: ['YAN'], fromYear: 1085, sourceType: 'prts', confidence: 'project-rule',
      contacts: [{ id: 'zuo_le', name: '左乐', en: 'Zuo Le', chance: 0.014, minRank: 1 }],
      routes: {
        candidate: {
          name: '秉烛候补', en: 'Candlebearer Candidate', minAge: 18, edu: 2,
          jobs: ['scholar', 'official', 'caster', 'witch', 'guard', 'soldier'],
          require: S => S.st.sm >= 58 || S.arts >= 62,
          interview: profile(['discretion', 'observation', 'loyalty'], 'yan_sishuitai_candidate'),
          ranks: [r('秉烛候补', 'Candlebearer Candidate', { needYears: 0 }), r('秉烛人', 'Candlebearer', { needYears: 3 }), r('外勤秉烛人', 'Field Candlebearer', { needYears: 10 })]
        }
      }
    },

    /* ---------------- 叙拉古：旧家族与新沃尔西尼 ---------------- */
    sir_family: {
      name: '叙拉古家族', en: 'Siracusan Families', kind: 'family',
      nations: ['SIR'], fromYear: 1073, admission: '家族试探', sourceType: 'canon', confidence: 'documented',
      locationAllowed: S => S.year < 1099 || !/新沃尔西尼/.test(S.city || ''),
      require: S => Number.isFinite(S.flags.sirFamilyIntroducedYear) &&
        S.year >= S.flags.sirFamilyIntroducedYear && S.year - S.flags.sirFamilyIntroducedYear <= 3,
      contacts: [{ id: 'sicily', name: '西西里夫人', en: 'Sicilia', chance: 0.008, minRank: 2 }],
      routes: {
        outsider: {
          name: '家族外围', en: 'Family Associate', minAge: 16,
          jobs: ['merchant', 'courier', 'guard', 'bounty', 'journalist'],
          require: S => S.st.so >= 38 || S.q >= 3,
          interview: profile(['loyalty', 'discretion', 'risk'], 'sir_family_outsider'),
          ranks: [r('家族外围', 'Associate', { needYears: 0 }), r('家族成员', 'Family Member', { needYears: 3 }), r('家族执行者', 'Enforcer', { needYears: 9 })]
        },
        executor: {
          name: '家族执行者', en: 'Family Enforcer', minAge: 18,
          jobs: ['guard', 'mercenary', 'bounty', 'soldier'],
          require: S => TL.combatValue(S) >= 48,
          interview: profile(['loyalty', 'combat', 'discretion'], 'sir_family_executor'),
          ranks: [r('外围打手', 'Street Enforcer', { needYears: 0 }), r('家族执行者', 'Family Enforcer', { needYears: 3 }), r('家族骨干', 'Family Lieutenant', { needYears: 10 })]
        }
      }
    },
    sir_newcourt: {
      name: '新沃尔西尼市政', en: 'New Volsinii Civic Authority', kind: 'civic',
      nations: ['SIR'], fromYear: 1099, sourceType: 'canon', confidence: 'inferred',
      contacts: [{ id: 'mayor', name: '新沃尔西尼市政官员', en: 'New Volsinii Civic Official', chance: 0.022, minRank: 1 }],
      routes: {
        civic: {
          name: '市政与司法', en: 'Civic Justice', minAge: 18, edu: 2,
          jobs: ['police', 'official', 'lawyer', 'journalist', 'merchant'],
          require: S => S.st.sm >= 48 || S.st.so >= 55,
          interview: profile(['publicProtection', 'law', 'independence'], 'sir_newcourt_civic'),
          ranks: [r('市政候补', 'Civic Candidate', { needYears: 0 }), r('市政执行员', 'Civic Officer', { needYears: 2 }), r('司法调查员', 'Judicial Investigator', { needYears: 7 })]
        },
        security: {
          name: '新城治安', en: 'New City Security', minAge: 18,
          jobs: ['police', 'guard', 'soldier', 'bounty'],
          require: S => TL.combatValue(S) >= 38,
          interview: profile(['discipline', 'publicProtection', 'judgment'], 'sir_newcourt_security'),
          ranks: [r('治安候补', 'Security Candidate', { needYears: 0 }), r('城卫', 'City Guard', { needYears: 2 }), r('治安队长', 'Security Captain', { needYears: 8 })]
        }
      }
    }
  };

  // 组织表证实存在不等于证实成立年。未有年表依据的窗口均为项目规则。
  // 1110 是人物互动的保守游戏截断线，不是设定中的死亡年份。
  const O = TL.ORGANIZATIONS;

  // 企业与长期编制共用同一套雇佣模型。职业区间提供岗位底薪，晋升
  // 通过职级倍率调整；正式雇主保证工资结算、不会因普通随机事件开除，
  // 并为足够年资的成员提供退休金。数值属于玩法模型，不冒充官方工资表。
  TL.EMPLOYMENT_MODELS = {
    contract: {
      payroll: { period: 'monthly', basis: 'nation-ppp', scale: 'service-rank', rankStep: 0.08, maxRankSteps: 3 },
      protectedEvents: [], medicalAccommodation: false, retirement: null
    },
    stable: {
      payroll: { period: 'monthly', basis: 'nation-ppp', scale: 'service-rank', rankStep: 0.08, maxRankSteps: 3 },
      protectedEvents: ['job_lost', 'wage_theft', 'ori_job_loss'], medicalAccommodation: true,
      retirement: { minServiceYears: 5, replacementRate: 0.60, minimumMonthlyRate: 0.45 }
    },
    rhodes: {
      payroll: { period: 'monthly', basis: 'nation-ppp', scale: 'operator-rank' },
      protectedEvents: ['job_lost', 'wage_theft', 'ori_job_loss'], medicalAccommodation: true,
      retirement: { minServiceYears: 5, replacementRate: 0.65, minimumMonthlyRate: 0.50 }
    },
    unpaid: {
      payroll: { period: 'monthly', basis: 'subsistence', scale: 'subsistence' },
      protectedEvents: [], medicalAccommodation: true, retirement: null
    }
  };
  for (const o of Object.values(O)) {
    o.employmentModel = o.unpaid ? 'unpaid' : 'contract';
  }
  O.rhodes.employmentModel = 'rhodes';
  for (const id of [
    'rhine_life', 'melander', 'blacksteel', 'penguin_logistics', 'karlan_trade',
    'raythean', 'laterano_gunknights', 'laterano_guard', 'kaz_knights',
    'lungmen_guard', 'yan_sishuitai', 'sir_newcourt'
  ]) O[id].employmentModel = 'stable';

  Object.assign(O.blacksteel, { fromYear: 1090, nations: ['CLB', 'BLV'] });
  // PRTS records its founding in 1093 and a later move to Lungmen; the city is
  // a core business area, not an exclusive limit on contracts or recruitment.
  Object.assign(O.penguin_logistics, { fromYear: 1093, nations: ['CLB', 'LMN', 'BLV'] });
  O.karlan_trade.fromYear = 1095;
  O.karlan_trade.governance = {
    owner: '谢拉格国营企业', actualController: '银灰',
    scope: ['对外贸易', '工业', '军事领域'], sourceType: 'prts', confidence: 'documented'
  };
  O.karlan_trade.employmentModel = 'stable';
  O.karlan_trade.employmentModelSource = 'project-rule';
  O.melander.en = 'Maylander Foundation';
  O.melander.contacts = [{ id: 'maylander_liaison', name: '基金会项目联络员', chance: 0.035, minRank: 1 }];
  O.laterano_guard.name = '拉特兰戍卫队';
  O.laterano_gunknights.routes.gunknight.require = S => S.race === 'sankta' && S.arts >= 48 && TL.combatValue(S) >= 45;
  O.sarkaz_mercs.require = S => S.race === 'sarkaz' || S.nation === 'KDZ';
  O.sir_newcourt.contacts = [
    { id: 'vigil', name: '伺夜', en: 'Vigil', chance: 0.022, minRank: 1 },
    { id: 'penance', name: '拉维妮娅', en: 'Lavinia', chance: 0.022, minRank: 1 }
  ];
  O.rhodes.routes.operator.require = S => TL.combatValue(S) >= 55 && S.arts >= 20;
  O.rhodes.routes.operator.ranks = [
    r('实习干员', 'Trainee', { needYears: 0 }), r('正式干员', 'Operator', { needYears: 1 }),
    r('资深干员', 'Senior Operator', { needYears: 6 }), r('精英干员', 'Elite Operator', { needYears: 16 }),
    r('王牌干员', 'Ace Operator', { needYears: 30 })
  ];
  // 接纳感染者不要求警卫履历；guard 仅复用行动风险模型，收入由 unpaid 覆盖。
  O.reunion.routes.infected.entryJob = 'guard';
  ['engineering', 'fieldwork', 'business'].forEach(id => O.rhine_life.routes[id].fromYear = 1092);
  O.kaz_knights.routes.infected.fromYear = 1094;
  O.kaz_knights.routes.arena.entryJob = 'knight';
  O.lungmen_guard.routes.police.entryJob = 'police';
  O.sir_newcourt.routes.civic.entryJob = 'official';
  O.laterano_guard.routes.cooperation = {
    name: '峰会外派协作', en: 'Summit Liaison', minAge: 18, fromYear: 1099,
    jobs: ['courier', 'nurse', 'journalist', 'merchant'], require: S => S.st.so >= 45,
    interview: profile(['publicProtection', 'teamwork', 'judgment'], 'laterano_cooperation'),
    ranks: [r('协作人员', 'Associate', { needYears: 0 }), r('外派联络', 'Liaison', { needYears: 3 }),
      r('协作协调员', 'Coordinator', { needYears: 8 })]
  };
  const contactWindows = {
    doctor: [1096, 1110], amiya: [1095, 1110], kristen: [1090, 1098], saria: [1090, 1094],
    muelsyse: [1092, 1110], doro: [1097, 1110], chen: [1090, 1096],
    hoshi: [1094, 1110], swire: [1094, 1110], zuo_le: [1097, 1110],
    theresa: [1086, 1093], manfred: [1094, 1098], redpine: [1097, 1110],
    vigil: [1099, 1110], penance: [1099, 1110], sicily: [1073, 1098],
    texas: [1094, 1110], exusiai: [1094, 1110], emperor: [1094, 1110],
    franka: [1095, 1110], liskarm: [1095, 1110], silverash: [1095, 1110], dengen: [1095, 1110]
  };
  const interactions = {
    doctor: '博士让你在行动图上指出撤离路线，随后补上了你遗漏的医疗接应点。',
    amiya: '阿米娅听完了你的任务报告，也问了你最近是否休息得好。',
    franka: '芙兰卡把护具检查变成了一场小测验。你逐项复核完毕，她才与你讨论下一次行动的分工。',
    liskarm: '雷蛇逐项核对通讯、护具和撤离方案，最后把备用计划交给你保管。',
    emperor: '大帝听完你的交付汇报，夸张地点评了节奏，随后亲自确认货物、交接地点和风险清单。',
    texas: '德克萨斯听你复述运输路线，指出最容易被忽略的交接点，并把备用路线标在地图上。',
    exusiai: '能天使和你核对货物封装与签收单。确认没有遗漏后，她提议把收尾工作当作一次计时练习。',
    merc_captain: '佣兵队长逐项讲清合同里的撤离条件，最后与你确认集合暗号和失联后的处理方式。',
    manfred: '曼弗雷德只问了队伍如何完成撤离。你说明补给缺口和风险后，他把两项都记进了命令。',
    military_officer: '军官核对调令与补给清单，提醒你把命令来源和现场观察分别记录。',
    silverash: '银灰询问商路调整对沿途居民和补给的影响，听完风险清单后才决定下一步安排。',
    dengen: '锏带你复核雪线行程的负重与补给。她走在队伍前面，也按约定的节奏等你跟上。',
    raythean_director: '项目主管要求你记录装备失效的边界条件，并把测试结果和未解决的风险一并列入交付清单。',
    theresa: '特蕾西娅听你讲完沿途遇见的人，随后与你一起检查行动方案会把代价留给谁。',
    gunknight: '铳骑教官让你按步骤复核装备、姿势与弹药登记；检查稳定后，才开始情景训练。',
    guard_officer: '戍卫队军官安排你和同伴疏导庆典散场，先为居民与来访者留出安全通道。',
    knight_association: '骑士协会代表与你逐条核对赞助条款、赛程和公开披露要求，确认你清楚合同的边界。',
    redpine: '红松骑士团成员与你交换训练安排，先确认彼此能提供的支援，再商议接下来的赛程。',
    chen: '陈逐条核对你的现场记录，要求你把猜测与证据分开。',
    hoshi: '星熊带你复盘了一次街区巡逻，提醒你先看清群众的退路。',
    swire: '诗怀雅和你核对了警力安排，把遗漏的后勤预算补进计划。',
    saria: '塞雷娅复核了实验区的防卫流程，坚持先排除人员暴露风险。',
    kristen: '克丽斯腾听完你的项目汇报，把讨论引向了天空之外。',
    muelsyse: '缪尔赛思带你核对生态样本，询问你对环境变化的观察。',
    doro: '多萝西与你讨论受试者的感受，记录下你在现场听到的意见。',
    zuo_le: '左乐与你交换外勤见闻，将尚不能确认的异象单独封存。',
    vigil: '伺夜与你讨论新城的公共事务，旧家族关系不再是办事的通行证。',
    penance: '拉维妮娅要求补齐证据链。她提醒你，判决不能只凭家族的说法。',
    sicily: '西西里夫人只问你三件事：谁替你引荐、你愿意承担什么，以及你是否想过如何抽身。',
    maylander_liaison: '基金会联络员把预算、现场记录与受助者反馈摆在一起；你们先核对物资去向，再讨论下一阶段。',
    selene: '梅兰德·塞勒涅听完你的项目记录，追问资助如何转化为可核验的现场结果。',
    mayor: '市政官员与你逐项核对公开会议的记录，确认反对意见和未解决的问题都留在案卷里。'
  };
  for (const [id, o] of Object.entries(O)) {
    o.source = o.source || 'https://prts.wiki/w/泰拉大典:组织';
    o.rulesSource = 'project-rule';
    o.yearBasis = ['rhine_life', 'babel', 'sir_newcourt'].includes(id) ? 'prts-or-project-timeline' : 'project-window';
    if (['blacksteel', 'penguin_logistics', 'karlan_trade', 'raythean'].includes(id))
      o.source = 'https://prts.wiki/w/泰拉大典:组织';
    for (const c of o.contacts || []) {
      const bounds = contactWindows[c.id] || [o.fromYear, 1110];
      c.fromYear = bounds[0]; c.untilYear = bounds[1];
      c.interaction = interactions[c.id] || null;
    }
  }
  TL.ORGANIZATION_LIST = Object.keys(TL.ORGANIZATIONS);
  TL.organizationDef = function (id) { return TL.ORGANIZATIONS[id] || null; };
  TL.organizationRouteDef = function (id, routeId) {
    const o = TL.ORGANIZATIONS[id];
    return o && o.routes ? o.routes[routeId] || null : null;
  };
  TL.organizationName = function (id) {
    const o = TL.ORGANIZATIONS[id];
    if (!o) return id || '—';
    return TL.lang === 'en' && o.en ? o.en : o.name;
  };
  TL.organizationRouteName = function (id, routeId) {
    const r0 = TL.organizationRouteDef(id, routeId);
    if (!r0) return routeId || '—';
    return TL.lang === 'en' && r0.en ? r0.en : r0.name;
  };
  TL.organizationRankName = function (id, routeId, rank) {
    const route = TL.organizationRouteDef(id, routeId);
    const r0 = route && route.ranks ? route.ranks[rank | 0] : null;
    if (!r0) return '—';
    return TL.lang === 'en' && r0.en ? r0.en : r0.name;
  };

  // 面试画像的稳定数据入口：组织层不依赖题库实现。
  TL.organizationInterviewSpec = function (id, routeId) {
    const route = TL.organizationRouteDef(id, routeId);
    if (!route || !route.interview) return null;
    return Object.assign({ organization: id, route: routeId }, route.interview);
  };

})(window.TL = window.TL || {});
