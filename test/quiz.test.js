/* 快問快答的出題邏輯：標成正解的必須真的是正解，
   而且不能出現「兩個選項一樣好」這種無法作答的題目。 */
const test = require('node:test');
const assert = require('node:assert');
const S = require('../bets.js');
const Quiz = require('../quiz.js');

function seeded(seed) {
  const rng = S.makeRng(seed);
  return () => rng() / 4294967296;
}
const N = 3000;

function eachQuestion(type, fn) {
  const q = Quiz.make(seeded(20260910));
  for (let i = 0; i < N; i++) fn(q.next(type), i);
}

test('每一題都剛好有一個正解，選項不重複', () => {
  for (const t of ['better', 'payout', 'hit']) {
    eachQuestion(t, (x) => {
      const correct = x.options.filter(o => o.correct);
      assert.strictEqual(correct.length, 1, `${t}: 正解數量 ${correct.length}`);
      const keys = new Set(x.options.map(o => o.key));
      assert.strictEqual(keys.size, x.options.length, `${t}: 選項重複`);
      assert.ok(x.prompt && x.explain, `${t}: 題目或解說是空的`);
    });
  }
});

test('挑注區：正解確實是莊家優勢較低的那個，且差距夠大', () => {
  eachQuestion('better', (x) => {
    const [a, b] = x.options;
    const ha = S.BY_ID[a.key].he, hb = S.BY_ID[b.key].he;
    assert.ok(Math.abs(ha - hb) >= 0.01, `差距只有 ${(Math.abs(ha - hb) * 100).toFixed(2)}pp，等於在猜`);
    const winner = a.correct ? a : b;
    assert.strictEqual(S.BY_ID[winner.key].he, Math.min(ha, hb), '標錯正解');
  });
});

test('記賠率：四個選項，正解等於該注區當下的賠率', () => {
  eachQuestion('payout', (x) => {
    assert.strictEqual(x.options.length, 4);
    const correct = Number(x.options.find(o => o.correct).key);
    const kind = S.KINDS.find(k => x.prompt.includes(k.name));
    assert.ok(kind, `題目找不到對應注區：${x.prompt}`);
    assert.strictEqual(correct, S.BY_ID[kind.id].payout);
  });
});

test('判輸贏：答案跟實際結算一致', () => {
  const q = Quiz.make(seeded(555));
  for (let i = 0; i < N; i++) {
    const x = q.next('hit');
    const label = x.prompt.match(/押「(.+?)」/)[1];
    const bet = S.BETS.find(b => b.label === label);
    assert.ok(bet, `找不到注區 ${label}`);
    const reallyHit = S.netOf(bet, x.dice) > 0;
    const saysHit = x.options.find(o => o.correct).key === 'y';
    assert.strictEqual(saysHit, reallyHit, `${x.dice.join('-')} 押 ${label}`);
  }
});

test('判輸贏會考到圍骰通殺', () => {
  const q = Quiz.make(seeded(99));
  let triples = 0, mainOnTriple = 0;
  for (let i = 0; i < N; i++) {
    const x = q.next('hit');
    if (!S.isTriple(x.dice)) continue;
    triples++;
    const label = x.prompt.match(/押「(.+?)」/)[1];
    const bet = S.BETS.find(b => b.label === label);
    if (bet.group === 'main') {
      mainOnTriple++;
      assert.strictEqual(x.options.find(o => o.correct).key, 'n', '圍骰時大小單雙必須是「沒中」');
    }
  }
  assert.ok(triples > N * 0.3, `圍骰題只有 ${triples}/${N}，太少`);
  assert.ok(mainOnTriple > 50, `圍骰配大小單雙的題目只有 ${mainOnTriple} 題`);
});

test('一輪題目數量正確，三種題型都會出現', () => {
  const q = Quiz.make(seeded(7));
  const round = q.round(9);
  assert.strictEqual(round.length, 9);
  const types = new Set(round.map(r => r.type));
  assert.deepStrictEqual([...types].sort(), ['better', 'hit', 'payout']);
});

test('改了賠率表，題目跟著改', () => {
  const pt = S.clonePaytable(S.STANDARD);
  pt.combo = 5;
  S.applyPaytable(pt);
  const q = Quiz.make(seeded(1234));
  let checked = 0;
  for (let i = 0; i < N && checked < 20; i++) {
    const x = q.next('payout');
    if (!x.prompt.includes('二骰組合')) continue;
    checked++;
    assert.strictEqual(Number(x.options.find(o => o.correct).key), 5, '應該用自訂賠率出題');
  }
  assert.ok(checked > 0, '沒抽到二骰組合的題目');
  S.applyPaytable(S.clonePaytable(S.STANDARD));
});
