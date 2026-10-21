/* 地区成长机会：事实依据与游戏效果分别保存。概率/年龄/收益都是游戏设计。
 * 养育背景 AEG-01 / RMB-01 在出生时生成，其余是可选择、可错过的机会。 */
(function (TL) {
  'use strict';
  TL.GROWTH_SKILLS = {
    engineering: '工程常识', creation: '创作', botany: '植物培育', expression: '表达',
    emergency: '应急设备操作', shooting: '射击训练', maintenance: '器械维护',
    launcher: '榴弹发射器训练', teamwork: '协作', athletics: '体能训练',
    protection: '作业防护', travel: '旅行准备', oral: '多语口语', literacy: '读写',
    agriculture: '农事知识', commerce: '商贸常识', localKnowledge: '地方生活知识'
  };
  const option = (label, skills, contact, extra) => Object.assign({ label, skills, contact }, extra);
  const entry = (id, nation, ages, title, text, evidence, options, extra) => Object.assign({
    id, nation, ages, title, text, evidence, options, chance: 0.22, sourceType: 'adaptation',
    scope: '有相应生活条件的居民；不代表全国每个人',
    result: '这次经历留在了你的成长记录里，继续练习才能熟练。'
  }, extra);
  TL.GROWTH_BACKGROUNDS = {
    'AEG-01': { title: '公共养育所成长', evidence: ['chunk_0222', 'chunk_0223', 'chunk_0224', 'chunk_0225'], chance: 0.25 },
    'RMB-01': { title: '大家庭中的孩子', evidence: ['chunk_0357', 'chunk_0360'], chance: 0.4 }
  };
  TL.GROWTH = [
    entry('AEG-02', 'AEG', [6, 12], '第一次创作项目',
      '生活区的创作室开放了。你可以选择一个项目，照护者会帮你预约资源。', ['chunk_0223', 'chunk_0224'], [
        option('培育一小盆植物', { botany: 6 }, '创作室辅导员'),
        option('用打印设备制作模型', { creation: 4, engineering: 2 }, '创作室辅导员'),
        option('剪一段自己的影像', { expression: 5 }, '创作室辅导员')
      ], { tags: ['creation'] }),
    entry('AEG-03', 'AEG', [8, 15], '公共技术设施参访',
      '你预约到了一次公开参访。工作人员只带大家进入允许开放的区域。', ['chunk_0226', 'chunk_0227'], [
        option('记录能源与设备的工作过程', { engineering: 6 }, '设施讲解员'),
        option('询问故障时应当怎样求助', { engineering: 2, emergency: 4 }, '设施讲解员')
      ], { tags: ['publicTech'], chance: 0.14 }),
    entry('AEG-04', 'AEG', [8, 15], '应急终端练习',
      '生活区安排了一次练习：找到公共终端，确认避难路径，学习领取相应的防护设备。', ['chunk_0227', 'chunk_0228'], [
        option('完整演练设备领取和撤离', { emergency: 7 }, '应急指导员'),
        option('和同伴核对集合地点', { teamwork: 3, emergency: 3 }, '同组伙伴')
      ], { tags: ['emergencyTerminal'], chance: 0.14 }),
    entry('LAT-01', 'LAT', [12, 17], '综合射击课的一次考核',
      '萨科塔和黎博利同学一起参加射击考核。教员按操作和成绩评分；守护铳的身份手续另行办理。', ['prts:众生行记/工坊日志'], [
        option('追加练习，再参加考核', { shooting: 8 }, '射击教员', { flag: 'shootingCourse' }),
        option('按课程要求完成训练', { shooting: 5 }, '射击教员', { flag: 'shootingCourse' }),
        option('把课外时间留给其他科目', { literacy: 4, shooting: 2 }, '同班同学', { flag: 'shootingCourse' })
      ], { tags: ['shootingSchool'], races: ['sankta', 'liberi'], needsSchool: true, chance: 0.4 }),
    entry('LAT-02', 'LAT', [16, 22], '第一支守护铳的准备',
      '你的守护铳手续进入办理阶段。工匠和你讨论维护、保管与使用责任。射击成绩与公民资格分别记录。', ['prts:众生行记/工坊日志'], [
        option('办理领取，学习日常维护', { maintenance: 4 }, '制铳师', { action: 'guardianGun' }),
        option('先登记资格，暂缓领取', {}, '制铳师', { action: 'guardianDeferred' })
      ], { institutional: true, chance: 1, races: ['sankta'], tags: ['shootingSchool'] }),
    entry('LAT-03', 'LAT', [15, 18], '发射器专门训练',
      '教员提供了榴弹发射器的专门训练名额，从操作规程和安全距离开始。', ['prts:众生行记/工坊日志'], [
        option('练习操作与维护', { launcher: 7, maintenance: 3 }, '发射器教员', { action: 'launcherTraining' }),
        option('继续基础射击训练', { shooting: 5 }, '射击教员')
      ], { races: ['liberi'], tags: ['shootingSchool'], requiresFlag: 'shootingCourse', chance: 0.3 }),
    entry('LAT-04', 'LAT', [6, 12], '修道院附近的童年',
      '附近修道院的人员来到村镇，介绍教育、医疗和求助安排。接受服务不等于加入卫队。', ['chunk_0188', 'chunk_0189'], [
        option('参加读书活动', { literacy: 5 }, '驻地教师'),
        option('记下医疗和求助地点', { localKnowledge: 5 }, '驻地医护人员')
      ], { tags: ['monastery'] }),
    entry('LAT-05', 'LAT', [13, 17], '工坊见习',
      '一位工匠愿意让你观察工序，先从工具和基础维护学起。师徒可以来自不同种族。', ['prts:众生行记/工坊日志'], [
        option('学习维护与安全检查', { maintenance: 7 }, '工坊师傅'),
        option('练习绘制零件草图', { engineering: 5, creation: 2 }, '工坊师傅')
      ], { tags: ['workshop'], chance: 0.18 }),
    entry('RMB-02', 'RMB', [8, 15], '厂区运动会',
      '厂区社群准备运动会，给孩子们留了项目，也需要帮忙筹备的人。', ['chunk_0360'], [
        option('报名团队项目', { athletics: 4, teamwork: 3 }, '运动会伙伴'),
        option('帮忙布置场地', { teamwork: 5 }, '筹备组长辈')
      ], { tags: ['factory'] }),
    entry('RMB-03', 'RMB', [8, 15], '老工人的防护课',
      '社区的老工人拿出滤具和检查表，讲怎样识别危险。今天只在安全场地练习，不下井。', ['chunk_0359'], [
        option('练习检查滤具和作业规程', { protection: 7 }, '防护课老师'),
        option('画出危险标识和撤离路线', { protection: 3, expression: 3 }, '防护课老师')
      ], { tags: ['protectionClass'] }),
    entry('RMB-04', 'RMB', [16, 18], '第一次外出计划',
      '熟悉的长辈谈起年轻时的旅行。你可以准备外出，也可以留在家乡，没人替你决定。', ['chunk_0358', 'chunk_0360'], [
        option('准备外出学习的路线和行李', { travel: 6 }, '家乡联络人'),
        option('留在社群学习手艺', { maintenance: 5, teamwork: 2 }, '厂区师傅')
      ], { tags: ['travelCulture'], requiresBackground: 'RMB-01', chance: 0.3 }),
    entry('BLV-01', 'BLV', [4, 12], '家与街区的几种语言',
      '街坊和家人在不同场合使用不同语言。能听懂一句问候，与读懂一整页书是两回事。', ['chunk_0292'], [
        option('和邻居练习日常对话', { oral: 6 }, '街坊伙伴'),
        option('请人教你读写常见词句', { literacy: 5, oral: 2 }, '识字的邻居')
      ], { tags: ['multilingual'] }),
    entry('BLV-02', 'BLV', [7, 15], '歌曲与故事的童年',
      '有人在聚会中唱起本地的歌，讲述一个旅行者的故事。你可以学唱，也可以试着写自己的故事。', ['chunk_0292'], [
        option('练习唱歌和讲故事', { expression: 6 }, '社区乐手'),
        option('把听来的故事记下来', { literacy: 3, expression: 3 }, '社区讲述者')
      ]),
    entry('BLV-03', 'BLV', [6, 14], '种植园附近长大',
      S => TL.placeHas(S, 'southCrops') ? '家人谈起附近的咖啡和甘蔗种植。赶集时，你有机会了解收成和加工。' :
        '家人谈起附近的水果和甜菜种植。赶集时，你有机会了解收成和加工。', ['chunk_0291'], [
        option('了解作物与季节', { agriculture: 6 }, '熟悉农事的亲友'),
        option('观察集市交易', { commerce: 4, oral: 2 }, '集市熟人')
      ], { tags: ['agriculture'], familyJobs: ['farm', 'farmhand', 'agbiz'] }),
    entry('BLV-04', 'BLV', [8, 16], '多索雷斯的游客旺季',
      S => S.year < 1086 ? '索雷城迎来新的建设和游客。家人带你看街区的变化，海滨景观还在规划与建设中。' :
        '多索雷斯迎来游客旺季。你跟着家人观察接待与服务，也听见来自各地的语言。', ['chunk_0291'], [
        option('跟亲友了解接待工作', { commerce: 5 }, '服务业亲友'),
        option('练习听懂不同的问路方式', { oral: 5 }, '街区向导')
      ], { placeIds: ['blv_dossoles'], fromYear: 1083 }),
    entry('BLV-05', 'BLV', [7, 17], '管制打断日常',
      '附近局势紧张，熟悉的道路临时管制。照护者和学校商量接下来怎样安排。', ['chunk_0290'], [
        option('暂时在住处学习', { literacy: 2 }, '社区联络人', { action: 'schoolInterruption' }),
        option('由家人陪同绕行', { travel: 3 }, '社区联络人')
      ], { regimes: ['singas', 'coalition', 'trueBolivarians'], needsTension: true, chance: 0.15 })
  ];
  // 其余地区先提供一条有来源的日常生活机会；地域特色不变成国家天赋。
  const local = [
    ['YAN','镖局门外的见闻','街区有人演练招式，也有人解释如今国内运输与出境护送的不同。','chunk_0373','localKnowledge','街区师傅'],
    ['LMN','街市与公共阅读','你在龙门的街市和公共阅读空间之间度过一个下午。','chunk_0371','literacy','阅读室熟人'],
    ['VIC','学校里的科学演示','老师借一套器材讲解科学与技艺的应用，你可以留下来动手观察。','chunk_0120','engineering','科学课教师'],
    ['LEI','高塔之外的音乐课','附近的老师愿意教你基础乐理。将来进入高塔学习仍有费用与考核门槛。','chunk_0145','expression','音乐老师'],
    ['URS','书店里的下午','街区的小书店里有孩子翻书，也有人讨论音乐。你找到了一本愿意慢慢读的书。','chunk_0165','literacy','书店店员'],
    ['KAZ','赞助的校园活动','学校举办一场有商业赞助的活动。你和同学既准备节目，也讨论广告里的承诺。','chunk_0253','expression','同学'],
    ['HIG','街坊的新设备','邻居拿来一件电子设备，你可以了解操作，也可以观察它怎样改变日常生活。','chunk_0383','engineering','街坊技师'],
    ['CLB','贸易街的展示','商店展示一件新产品，街上也有各地风味的食物。你试着听懂商家的介绍。','chunk_0270','commerce','街区店员'],
    ['IBE','社区的物资安排','基层办事人员来核对物资与生活需求，你跟随家人了解领取与求助手续。','chunk_0208','localKnowledge','社区办事人员'],
    ['MIN','社区的体育与艺术活动','社区活动中既有运动也有艺术，你有机会参加一次协作练习。','chunk_0333','teamwork','活动伙伴'],
    ['SIR','餐桌旁的故事','亲友在饭后谈起一出戏，邀请你把其中一段用自己的话讲出来。','chunk_0305','expression','爱看戏的亲友'],
    ['KJR','山间生活的手艺','熟悉山路的长辈教你辨认天气变化，并检查外出的装备。','chunk_0239','localKnowledge','山间长辈'],
    ['SAMI','部族语言的读写','有人愿意教你读写本地语言。不同聚落的用语并不完全一样。','chunk_0346','literacy','部族教师'],
    ['SRG','当地的课堂','附近的教师开放一次讲习。这里的课程与远处领地未必相同。','chunk_0318','literacy','本地教师'],
    ['KDZ','流动课堂短暂停留','一支流动教学队伍停留了一段时间。座位不多，课程也要随行程调整。','chunk_0406','literacy','流动教师'],
    ['SST','音乐与环境的课堂','学校请来讲解者，带大家观察环境，也讨论城市里的音乐活动。','chunk_0278','expression','活动教师'],
    ['DUR','地下城邦的工艺参观','你有机会参观本城的一处工坊。师傅提醒你，其他城邦的做法可能很不一样。','chunk_0098','engineering','本城工匠']
  ];
  for (const [nation, title, text, evidence, skill, contact] of local) {
    const extra = { chance: nation === 'KDZ' ? 0.08 : 0.18 };
    if (['VIC','KAZ','SST'].includes(nation)) extra.needsSchool = true;
    if (['YAN','LMN','LEI','URS','CLB','HIG'].includes(nation)) extra.urban = true;
    if (nation === 'HIG') extra.fromYear = 1090;
    if (nation === 'IBE') extra.fromYear = 1038;
    if (nation === 'URS') extra.uninfected = true;
    TL.GROWTH.push(entry(nation + '-01', nation, [8, 15], title, text, [evidence], [
      option('参加并认真练习', { [skill]: 5 }, contact),
      option('和同伴一起观察记录', { teamwork: 2, [skill]: 2 }, contact)
    ], extra));
  }
})(window.TL = window.TL || {});
