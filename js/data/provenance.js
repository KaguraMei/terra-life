/* Provenance separates setting references from this project's model choices. */
(function (TL) {
  'use strict';

  TL.CONTENT_PROVENANCE = {
    version: 1,
    organizations: {
      facts: [
        { source: '各组织记录的 source 字段', scope: '组织名称、设定身份与人物关系；逐条置信度仍以组织记录为准' },
        { source: 'docs/泰拉大事件年表.md', scope: '本项目整理的年代与历史窗口' }
      ],
      inference: [{ source: 'docs/组织系统实现与面试接口.md', scope: '招募门槛、路线、晋升、薪酬、离职与组织事件均为玩法建模' }]
    },
    timeline: {
      facts: [
        { source: 'docs/泰拉大事件年表.md', scope: '年表条目及设定时间线整理；仍需逐项补充一手出处' }
      ],
      inference: [{ source: 'docs/泰拉模型-与原作的差异.md', scope: '事件对个体、国家、寿命与经济的数值影响属于游戏推断' }]
    },
    jobs: {
      facts: [{ source: 'docs/泰拉模型-与原作的差异.md', scope: '目前未给每项职业字段附逐条设定出处；官方薪酬表未被假定存在' }],
      inference: [{ source: 'js/data/jobs.js', scope: '职业薪酬区间、风险乘数、学历门槛与歧视参数均为玩法参数' }]
    },
    races: {
      facts: [{ source: 'docs/泰拉模型-与原作的差异.md', scope: '目前未给每项种族字段附逐条设定出处' }],
      inference: [{ source: 'js/data/races.js', scope: '出生属性、社会地位、寿命与感染倾向修正属于玩法参数' }]
    },
    events: {
      facts: [{ source: 'docs/泰拉大事件年表.md', scope: '事件叙述所依托的设定整理' }],
      inference: [{ source: 'js/data/events.js', scope: '事件权重、冷却、触发窗口、效果与个体遭遇属于模拟规则' }]
    },
    nations: {
      facts: [
        { source: 'docs/泰拉大事件年表.md', scope: '国家名称、政体与主要历史事件的设定整理' },
        { source: 'js/data/nations.js', scope: '各国人口、预期寿命、教育与城市化的建模取值，均为泰拉内部相对值' }
      ],
      inference: [
        { source: 'docs/泰拉模型-与原作的差异.md', scope: '出生权重、经济与寿命参数是玩法推断，不宣称官方统计' }
      ]
    },
    decisions: {
      facts: [{ source: 'docs/原始逻辑-1in8billion.md', scope: '抉择分支所依托的原作叙述整理' }],
      inference: [
        { source: 'js/data/decisions.js', scope: '选项效果、出现条件与自动抉择策略属于模拟规则' }
      ]
    }
  };

  function annotate(record, settingKind, settingSources, modelSources, confidence) {
    record.provenance = {
      setting: { kind: settingKind, confidence: confidence || 'inferred', sources: settingSources },
      gameModel: { kind: 'project-rule', sources: modelSources }
    };
  }

  for (const [id, organization] of Object.entries(TL.ORGANIZATIONS || {})) {
    const settingKind = organization.sourceType === 'canon' ? 'canon-fact'
      : organization.sourceType === 'prts' ? 'reference'
      : 'project-model';
    const settingSources = [organization.source, 'docs/泰拉大事件年表.md'].filter(Boolean);
    annotate(organization, settingKind, settingSources,
      ['docs/组织系统实现与面试接口.md'], organization.confidence);
  }
  for (const nation of TL.NATIONS || []) annotate(nation, 'project-model',
    ['js/data/nations.js'], ['docs/泰拉模型-与原作的差异.md']);
  for (const race of TL.RACES || []) annotate(race, 'reference-needed',
    ['js/data/races.js'], ['docs/泰拉模型-与原作的差异.md']);
  for (const job of Object.values(TL.JOBS || {})) annotate(job, 'reference-needed',
    ['js/data/jobs.js'], ['docs/泰拉模型-与原作的差异.md']);
  for (const entry of TL.TIMELINE || []) annotate(entry, 'project-reconstruction',
    ['docs/泰拉大事件年表.md'], ['docs/泰拉模型-与原作的差异.md']);
  for (const event of Object.values(TL.EVMAP || {})) annotate(event, 'project-authored',
    ['docs/原始逻辑-1in8billion.md'], ['js/data/events.js']);
})(window.TL = window.TL || {});
