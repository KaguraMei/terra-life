import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addArts, addKnowledge, annualBudget, happinessBase, knowledgeCap, yearSubject
} from '../dist-runtime/simulation.mjs';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

const portSet = ({edu = 8, le = 60, gi = 0.3, war = 0, ppp = 100} = {}, {knowledgeMod = 0, artsMod = 0} = {}) => ({
  nation: () => ({edu, le, gi, war, ppp}),
  race: () => ({knowledgeMod, artsMod}),
  clamp
});

const subject = (extra = {}) => ({
  nation: 'X',
  race: 'R',
  eduLevel: 0,
  familyTier: 3,
  school: false,
  knowledge: 0,
  income: 0,
  money: 0,
  debt: 0,
  oripathyTreated: false,
  oripathyProvider: null,
  conditions: 0,
  minorChildren: 0,
  partnerAlive: false,
  secondWorker: false,
  ...extra
});

test('the knowledge ceiling rises with schooling and is clamped at both ends', () => {
  const ports = portSet();
  assert.equal(knowledgeCap(subject(), ports), 34, 'no schooling, average nation, average means');

  // Each education step is worth 11 points of ceiling.
  assert.equal(knowledgeCap(subject({eduLevel: 1}), ports), 45);
  assert.equal(knowledgeCap(subject({eduLevel: 5}), ports), 89);

  // Studying widens the ceiling further, and the hard cap is 97.
  assert.equal(knowledgeCap(subject({eduLevel: 5, school: true}), ports), 95);
  assert.equal(knowledgeCap(subject({eduLevel: 6, school: true}), ports), 97, 'clamped at 97');
  assert.equal(
    knowledgeCap(subject({eduLevel: 0, familyTier: 0}), portSet({edu: 0})), 25, 'floored at 25'
  );
});

test('the knowledge ceiling responds to nation, race and household means', () => {
  const base = knowledgeCap(subject({eduLevel: 3}), portSet());
  const educated = knowledgeCap(subject({eduLevel: 3}), portSet({edu: 16}));
  const wealthy = knowledgeCap(subject({eduLevel: 3, familyTier: 5}), portSet());
  const talented = knowledgeCap(subject({eduLevel: 3}), portSet({}, {knowledgeMod: 6}));

  assert.ok(educated > base, 'a well-schooled nation raises the ceiling');
  assert.ok(wealthy > base, 'means raise the ceiling');
  assert.ok(talented > base, 'aptitude raises the ceiling');

  // The nation term saturates at +14, so a huge education index cannot run away.
  assert.equal(
    knowledgeCap(subject({eduLevel: 3}), portSet({edu: 40})),
    knowledgeCap(subject({eduLevel: 3}), portSet({edu: 20}))
  );
});

test('knowledge gains diminish as the ceiling approaches, but losses are exact', () => {
  const cap = 100;
  const gain = (current, amount) => addKnowledge(current, amount, cap, clamp) - current;

  assert.equal(gain(0, 10), 10, 'the first point costs nothing');
  const mid = gain(50, 10);
  const late = gain(90, 10);
  assert.ok(mid < 10 && late < mid, 'the same effort buys less near the ceiling');
  assert.equal(addKnowledge(100, 10, cap, clamp), 100, 'gain at the ceiling is zero, not negative');

  assert.equal(addKnowledge(50, -12, cap, clamp), 38, 'losses ignore the curve');
  assert.equal(addKnowledge(4, -12, cap, clamp), 0, 'losses floor at zero');
});

test('arts grow slower than knowledge and scale with talent', () => {
  const plain = portSet({}, {artsMod: 0});
  const gifted = portSet({}, {artsMod: 10});

  const gained = addArts(0, 10, 0, clamp);
  assert.equal(gained, 10, 'a neutral aptitude passes the amount through');
  assert.ok(addArts(0, 10, 10, clamp) > gained, 'talent multiplies the gain');
  assert.ok(addArts(0, 10, -5, clamp) < gained, 'a deficit damps the gain');

  // 0.75 of the weight is still behind the curve, so growth slows down.
  assert.ok(addArts(80, 10, 0, clamp) - 80 < addArts(20, 10, 0, clamp) - 20);
  assert.equal(addArts(0, 10, 20, clamp), 18, 'a +20 aptitude is a +80% multiplier');
  assert.equal(addArts(98, 10, 0, clamp), 100, 'clamped at 100');
  assert.equal(addArts(5, -9, 0, clamp), 0, 'losses floor at zero');
});

test('the happiness baseline reads lifespan, equality and peace, then clamps', () => {
  assert.equal(happinessBase(subject(), portSet({le: 60, gi: 0, war: 0})), 50);
  assert.ok(happinessBase(subject(), portSet({le: 80})) > happinessBase(subject(), portSet({le: 60})));
  assert.ok(happinessBase(subject(), portSet({gi: 0.8})) < happinessBase(subject(), portSet({gi: 0.1})));
  assert.ok(happinessBase(subject(), portSet({war: 0.9})) < happinessBase(subject(), portSet({war: 0})));

  assert.equal(happinessBase(subject(), portSet({le: 200, gi: 0, war: 0})), 78, 'clamped at 78');
  assert.equal(happinessBase(subject(), portSet({le: 0, gi: 1, war: 1})), 18, 'floored at 18');
});

test('the annual budget applies household costs, then interest, then repayment', () => {
  const ports = portSet({ppp: 100});

  const plain = annualBudget(subject({income: 10}), ports, 0);
  assert.equal(plain.income, 120, 'monthly income is annualised');
  assert.equal(plain.cost, 52, 'a bare household costs 0.52 of the price level');
  assert.equal(plain.net, 68);
  assert.equal(plain.money, 68);

  // Children, a dependant partner and chronic conditions all raise the bill.
  assert.ok(annualBudget(subject({income: 10, minorChildren: 2}), ports, 0).cost > plain.cost);
  assert.ok(annualBudget(subject({income: 10, partnerAlive: true}), ports, 0).cost > plain.cost);
  assert.equal(
    annualBudget(subject({income: 10, partnerAlive: true, secondWorker: true}), ports, 0).cost,
    plain.cost,
    'a working partner adds no cost'
  );
  assert.equal(annualBudget(subject({income: 10, conditions: 2}), ports, 0).cost, 52 + 2 * 28);

  // Treatment is billed at the price level, and Rhodes Island costs more than double.
  assert.equal(annualBudget(subject({income: 10, oripathyTreated: true}), ports, 0).cost, 52 + 100);
  assert.equal(
    annualBudget(subject({income: 10, oripathyTreated: true, oripathyProvider: 'rhodes'}), ports, 0).cost,
    52 + 220
  );

  // Subsistence is deducted from the cost before it touches the balance.
  const subsidised = annualBudget(subject({income: 10}), ports, 60);
  assert.equal(subsidised.support, 60);
  assert.equal(subsidised.net, 120, 'the stipend covers the whole bill');
});

test('a shortfall becomes interest-bearing debt and a surplus pays 40% of it down', () => {
  const ports = portSet({ppp: 100});

  const broke = annualBudget(subject({income: 0}), ports, 0);
  assert.equal(broke.net, -52);
  assert.equal(broke.money, 0, 'the balance never goes negative');
  assert.equal(broke.debt, 52 * 0.06, 'the overdraft is borrowed at 6%');

  const repaying = annualBudget(subject({income: 0, money: 100, debt: 50}), ports, 0);
  assert.equal(repaying.money, (100 - 52) - (100 - 52) * 0.4);
  assert.equal(repaying.debt, 50 - (100 - 52) * 0.4);

  const overpaid = annualBudget(subject({income: 1000, money: 0, debt: 10}), ports, 0);
  assert.equal(overpaid.debt, 0, 'repayment stops at the outstanding debt');
  assert.equal(overpaid.money, 12000 - 52 - 10);

  const nothingToRepay = annualBudget(subject({income: 1000}), ports, 0);
  assert.equal(nothingToRepay.debt, 0);
  assert.equal(nothingToRepay.money, 12000 - 52);
});

test('the year subject normalises flags, children and conditions once', () => {
  const view = yearSubject({
    nation: 'Yan', race: 'Cautus', eduLevel: 3, q: 4, school: 1,
    st: {sm: 20}, income: 5, money: 10, debt: 2,
    fam: {
      kids: [{alive: 1, age: 5}, {alive: true, age: 20}, {alive: 0, age: 5}],
      partner: {alive: true}
    },
    conds: {asthma: 1, gout: 2},
    ori: {treated: 1, provider: 'rhodes'},
    working2: 1
  });

  assert.equal(view.minorChildren, 1, 'only living children under 18 count');
  assert.equal(view.conditions, 2);
  assert.equal(view.oripathyTreated, true, 'a stored 1 is still true');
  assert.equal(view.oripathyProvider, 'rhodes');
  assert.equal(view.partnerAlive, true);
  assert.equal(view.secondWorker, true);
  assert.equal(view.school, true);
  assert.equal(view.knowledge, 20);
  assert.equal(view.familyTier, 4);
});

test('the year subject reads a partially built life without throwing', () => {
  const empty = yearSubject(undefined);
  assert.equal(empty.nation, '');
  assert.equal(empty.minorChildren, 0);
  assert.equal(empty.conditions, 0);
  assert.equal(empty.oripathyProvider, null);
  assert.equal(empty.oripathyTreated, false);

  const ori = yearSubject({ori: {treated: 1, provider: 7}});
  assert.equal(ori.oripathyProvider, null, 'a non-string provider is not passed on');
});
