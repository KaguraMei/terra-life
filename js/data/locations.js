/* 地点及生活环境。未具名条目是游戏原型，不是新增官方地名。
 * OCR chunk_0188–0189 / 0222–0228 / 0287–0292 / 0357–0360。
 * 权重、环境参数及设施覆盖均为游戏设计；不得当作原作人口统计。 */
(function (TL) {
  'use strict';
  const cityStrata = ['core', 'industrial', 'fringe'];
  const env = (id, name, urban, medK, ori, catHit) => ({
    id, name, short: name, en: name, enShort: name, urban,
    desc: '按当地生活设施与环境估算，数值为游戏模型。',
    leK: 1, directLE: true, imK: 1, u5K: 1, medK, ori, catHit, catWarn: [3, 6]
  });
  Object.assign(TL.STRATA, {
    marine: env('marine', '海底城市生活区', true, 1, [0.0005, 0.002], 0.1),
    subterranean: env('subterranean', '地下城邦生活区', true, 1, [0.003, 0.012], 0.15),
    community: env('community', '有公共服务的村镇', false, 0.9, [0.008, 0.025], 0.35),
    highland: env('highland', '高地聚落', false, 0.8, [0.008, 0.03], 0.4)
  });
  TL.STRATUM_LIST.push('marine', 'subterranean', 'community', 'highland');
  TL.PLACES = {};
  function place(nation, id, name, kind, tags, extra) {
    const p = Object.assign({ id, nation, name, kind, tags: tags || [], weight: 1,
      sourceType: 'regional-prototype', strata: kind === 'rural' ? ['wild'] : cityStrata }, extra);
    TL.PLACES[id] = p;
    return p;
  }
  // 保留可确认的具名地点；地名库中机构、景点及待考地名不参与出生抽签。
  const names = { YAN: '尚蜀', URS: '圣骏堡', VIC: '伦蒂尼姆', CLB: '特里蒙',
    KAZ: '大骑士领', LAT: '拉特兰城', LMN: '龙门' };
  const custom = ['AEG', 'DUR', 'LAT', 'RMB', 'BLV', 'SST', 'SAMI', 'KJR'];
  for (const n of TL.NATIONS) {
    if (custom.includes(n.id)) continue;
    place(n.id, n.id + '_city', names[n.id] || '一座当地城市', 'city', ['school', 'community'],
      { sourceType: names[n.id] ? 'named-place' : 'regional-prototype' });
    if (n.id !== 'LMN') place(n.id, n.id + '_rural', '乡间聚落', 'rural', ['agriculture']);
  }
  place('AEG', 'aeg_city', '一座阿戈尔海底城市', 'marine',
    ['school', 'nursery', 'creation', 'publicTech', 'emergencyTerminal', 'materialGuarantee'],
    { strata: ['marine'], evidence: ['chunk_0222', 'chunk_0226'], scope: '有对应公共设施的城市原型；不指认赫库兰尼姆的年代' });
  place('DUR', 'dur_city', '一座杜林地下城邦', 'subterranean', ['school', 'engineering'],
    { strata: ['subterranean'], evidence: ['chunk_0098'] });
  place('LAT', 'lat_city', '拉特兰城', 'city', ['school', 'shootingSchool', 'workshop'], { sourceType: 'named-place' });
  place('LAT', 'lat_village', '修道院附近的村镇', 'rural', ['school', 'shootingSchool', 'monastery'], { strata: ['community'] });
  place('RMB', 'rmb_factory', '一处厂区社群', 'city', ['school', 'extendedFamily', 'factory', 'protectionClass', 'travelCulture']);
  place('RMB', 'rmb_mine', '一处矿区社群', 'city', ['school', 'extendedFamily', 'mine', 'protectionClass', 'travelCulture']);
  place('BLV', 'blv_singas', '辛嘉斯控制区的聚落', 'rural', ['agriculture', 'southCrops', 'multilingual'], { regime: 'singas' });
  place('BLV', 'blv_coalition', '联合政府控制区的城市', 'city', ['school', 'multilingual'], { regime: 'coalition' });
  place('BLV', 'blv_true', '真正玻利瓦尔人控制区的聚落', 'rural', ['agriculture', 'northCrops', 'multilingual'], { regime: 'trueBolivarians' });
  place('BLV', 'blv_dossoles', '多索雷斯', 'city', ['school', 'multilingual', 'tourism'],
    { regime: 'dossoles', sourceType: 'named-place', evidence: ['chunk_0291'] });
  place('SST', 'sst_city', '汐斯塔市', 'city', ['school', 'music', 'tourism'], { sourceType: 'named-place' });
  place('SAMI', 'sami_settlement', '一处萨米部族聚落', 'rural', ['community', 'localLanguage'], { strata: ['community'] });
  place('KJR', 'kjr_settlement', '谢拉格山间聚落', 'rural', ['community', 'mountain'], { strata: ['highland'] });

  TL.placeName = (p, year) => !p ? '所在地未详' : p.id === 'blv_dossoles' && year < 1086 ? '索雷城' :
    p.id === 'sst_city' && year >= 1098 ? '新汐斯塔' : p.name;
  TL.placeHas = (S, tag) => !!(TL.currentPlace(S)?.tags || []).includes(tag);
  TL.currentPlace = S => S.residence && TL.PLACES[S.residence.placeId] || null;
  TL.drawPlace = function (nation, year, rnd, requested) {
    const pool = Object.values(TL.PLACES).filter(p => p.nation === nation);
    if (requested && TL.PLACES[requested]?.nation === nation) return TL.PLACES[requested];
    const rural = pool.filter(p => p.kind === 'rural'), urban = pool.filter(p => p.kind !== 'rural');
    const group = rural.length && urban.length ? (rnd() < TL.cityShare(nation) ? urban : rural) : pool;
    return group[Math.min(group.length - 1, Math.floor(rnd() * group.length))];
  };
  TL.placeStratum = function (p, q, rnd) {
    if (p.strata.length === 1) return p.strata[0];
    const weights = p.strata.map(id => id === 'core' ? 0.18 * Math.pow(1.55, q - 3) :
      id === 'fringe' ? 0.33 * Math.pow(0.72, q - 3) : 0.49);
    let x = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) <= 0) return p.strata[i];
    return p.strata[0];
  };
  TL.placeSnapshot = (p, year) => ({ placeId: p.id, nation: p.nation, name: TL.placeName(p, year),
    kind: p.kind, regime: p.regime || null, sinceYear: year, revision: 0 });
  TL.moveResidence = function (S, nation, placeId) {
    const p = TL.drawPlace(nation, S.year, TL.rnd, placeId);
    S.nation = nation;
    S.residence = TL.placeSnapshot(p, S.year);
    S.residence.revision = S.flags.residenceRevision = (S.flags.residenceRevision || 0) + 1;
    S.city = S.cityName = S.residence.name;
    S.stratum = TL.placeStratum(p, S.q, TL.rnd);
    S.urban = TL.stratum(S.stratum).urban;
    S.stratumName = TL.stratum(S.stratum).name;
    S.stratumCode = S.stratum.slice(0, 3).toUpperCase();
    if (p.tags.includes('materialGuarantee')) S.q = 4;
    S.flags.migrations = (S.flags.migrations || 0) + 1;
    S.flags.migratedTo = nation;
    delete S.flags.oriP;
    S.lt = TL.lifeTable(TL.NATION_BY_ID[nation], S.sex, S.race, S.court, S.stratum);
    if (S.fam.care?.mode === 'nursery' && S.fam.care.placeId !== p.id) {
      S.fam.care.history.push({ mode: 'nursery', endedAt: S.age, placeId: S.fam.care.placeId });
      S.fam.care.mode = S.age >= 18 ? 'independent' : 'transition';
      S.fam.care.endedAt = S.age;
      S.fam.care.caregivers.forEach(c => { c.remote = true; });
    }
    if (TL.applyPace) TL.applyPace(S, S.paceKey);
    return p;
  };
  // 兼容旧状态及旧事件：仅确认地点，不随机补写出生背景或重新抽签。
  TL.syncResidence = function (S) {
    const p = TL.currentPlace(S);
    if (p && p.nation === S.nation && S.city === S.residence.name) {
      S.city = S.cityName = S.residence.name = TL.placeName(p, S.year);
      return;
    }
    if (!p && S.residence?.nation === S.nation && S.residence.name === S.city) return;
    const match = Object.values(TL.PLACES).find(x => x.nation === S.nation && TL.placeName(x, S.year) === S.city);
    S.residence = match ? TL.placeSnapshot(match, S.year) :
      { placeId: null, nation: S.nation, name: S.city, kind: S.refugee ? 'displaced' : 'unknown', sinceYear: S.year };
    S.residence.revision = S.flags.residenceRevision = (S.flags.residenceRevision || 0) + 1;
    S.cityName = S.city;
    delete S.flags.oriP;
  };
  TL.CITIES = {};
  for (const p of Object.values(TL.PLACES)) (TL.CITIES[p.nation] ||= []).push(p.name);
  TL.cityOf = (nation, year) => TL.placeName(TL.drawPlace(nation, year || 1085, TL.rnd), year || 1085);
  TL.REGION_ENTITIES = Object.fromEntries(TL.NATIONS.map(n => [n.id,
    { kind: 'country', populationScope: 'lottery-bucket' }]));
  Object.assign(TL.REGION_ENTITIES, {
    LMN: { kind: 'administrative-region', sovereign: 'YAN', populationScope: 'separate-lottery-bucket' },
    SST: { kind: 'city-state', sovereign: 'CLB', nominal: true, populationScope: 'separate-lottery-bucket' },
    DUR: { kind: 'city-states', populationScope: 'underground-city-states' }
  });
})(window.TL = window.TL || {});
