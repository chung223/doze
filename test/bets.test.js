/* 對 bets.js 做窮舉驗證：三顆骰子只有 216 種等機率結果，
   所以每個注區的中獎組合數與期望值都可以逐一算出來對答案，不需要抽樣。 */
const test = require('node:test');
const assert = require('node:assert');
const S = require('../bets.js');

const ALL = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) ALL.push([a, b, c]);

function brute(bet) {
  let wins = 0, ev = 0;
  for (const d of ALL) {
    const net = S.netOf(bet, d);
    if (net > 0) wins++;
    ev += net;
  }
  return { wins, ev: ev / 216 };
}

test('三顆骰子共 216 種等機率結果', () => {
  assert.strictEqual(ALL.length, 216);
  assert.strictEqual(Object.values(S.WAYS).reduce((a, b) => a + b, 0), 216);
});

test('注區數量與分類', () => {
  assert.strictEqual(S.BETS.length, 52);
  const groups = {};
  for (const b of S.BETS) groups[b.group] = (groups[b.group] || 0) + 1;
  assert.deepStrictEqual(groups, { triple: 7, main: 4, double: 6, total: 14, combo: 15, single: 6 });
});

for (const pt of [S.STANDARD, S.TIGHT]) {
  test(`每個注區宣告的組合數與期望值都對得上（${pt.name}）`, () => {
    S.applyPaytable(S.clonePaytable(pt));
    for (const bet of S.BETS) {
      const r = brute(bet);
      assert.strictEqual(r.wins, bet.ways, `${bet.id} 中獎組合數`);
      assert.ok(Math.abs(r.ev - bet.ev) < 1e-12, `${bet.id} 期望值 ${bet.ev} vs 窮舉 ${r.ev}`);
      assert.ok(bet.he > 0, `${bet.id} 莊家優勢應為正（沒有任何一注對玩家有利）`);
    }
  });
}

test('標準賠率下的莊家優勢與公開賠率表一致', () => {
  S.applyPaytable(S.clonePaytable(S.STANDARD));
  const expect = {
    big: 2.78, small: 2.78, odd: 2.78, even: 2.78,
    combo12: 2.78, single1: 7.87,
    total4: 15.28, total17: 15.28, total5: 13.89, total6: 16.67, total7: 9.72,
    total8: 12.50, total9: 18.98, total10: 12.50, total11: 12.50, total12: 18.98,
    anytriple: 13.89, triple1: 16.20, double1: 18.52
  };
  for (const [id, he] of Object.entries(expect)) {
    assert.ok(Math.abs(-S.BY_ID[id].ev * 100 - he) < 0.005, `${id}: ${(-S.BY_ID[id].ev * 100).toFixed(2)}% != ${he}%`);
  }
});

test('較低賠率示例確實把莊家優勢推高', () => {
  S.applyPaytable(S.clonePaytable(S.STANDARD));
  const before = S.BETS.map(b => b.he);
  S.applyPaytable(S.clonePaytable(S.TIGHT));
  const after = S.BETS.map(b => b.he);
  let worse = 0;
  for (let i = 0; i < before.length; i++) {
    assert.ok(after[i] >= before[i] - 1e-12, `${S.BETS[i].id} 不該變得更划算`);
    if (after[i] > before[i] + 1e-12) worse++;
  }
  assert.ok(worse >= 28, `應有不少注區變差，實際只有 ${worse} 個`);
  assert.ok(Math.abs(S.BY_ID.combo12.he - 1 / 6) < 1e-9, '二骰組合 5:1 的莊家優勢應為 16.67%');
});

test('自訂賠率會即時反映在期望值上', () => {
  const pt = S.clonePaytable(S.STANDARD);
  pt.combo = 7;                            // 賠 7:1 時二骰組合對玩家有利
  S.applyPaytable(pt);
  assert.ok(S.BY_ID.combo12.ev > 0, '7:1 的二骰組合期望值應為正');
  assert.ok(Math.abs(S.BY_ID.combo12.ev - (8 * 30 / 216 - 1)) < 1e-12);
  S.applyPaytable(S.clonePaytable(S.STANDARD));
});

test('大小單雙遇圍骰通殺', () => {
  S.applyPaytable(S.clonePaytable(S.STANDARD));
  for (let v = 1; v <= 6; v++) {
    const d = [v, v, v];
    for (const id of ['big', 'small', 'odd', 'even']) {
      assert.strictEqual(S.netOf(S.BY_ID[id], d), -1, `圍骰 ${v} 時 ${id} 應該輸`);
    }
    assert.ok(S.netOf(S.BY_ID['double' + v], d) > 0, `圍骰 ${v} 時長骰 ${v} 應該中`);
    assert.ok(S.netOf(S.BY_ID.anytriple, d) > 0);
  }
});

test('單骰依中的顆數賠 1／2／3 倍', () => {
  assert.strictEqual(S.netOf(S.BY_ID.single3, [3, 1, 2]), 1);
  assert.strictEqual(S.netOf(S.BY_ID.single3, [3, 3, 2]), 2);
  assert.strictEqual(S.netOf(S.BY_ID.single3, [3, 3, 3]), 3);
  assert.strictEqual(S.netOf(S.BY_ID.single3, [1, 2, 4]), -1);
});

test('開骰亂數六面接近等機率', () => {
  const f = new Array(7).fill(0);
  const n = 120000;
  for (let i = 0; i < n; i++) for (const v of S.rollDice()) f[v]++;
  const expected = n * 3 / 6;
  // 卡方檢定，5 自由度、99.9% 臨界值約 20.5
  let chi = 0;
  for (let v = 1; v <= 6; v++) chi += (f[v] - expected) ** 2 / expected;
  assert.ok(chi < 20.5, `卡方 ${chi.toFixed(2)} 過大，分佈可疑：${f.slice(1)}`);
});

test('模擬用的 xorshift 亂數同樣接近等機率，且可重現', () => {
  const roll = S.makeDiceRoller(S.makeRng(12345));
  const f = new Array(7).fill(0);
  const n = 120000;
  for (let i = 0; i < n; i++) for (const v of roll()) f[v]++;
  const expected = n * 3 / 6;
  let chi = 0;
  for (let v = 1; v <= 6; v++) chi += (f[v] - expected) ** 2 / expected;
  assert.ok(chi < 20.5, `卡方 ${chi.toFixed(2)} 過大：${f.slice(1)}`);

  const a = S.makeDiceRoller(S.makeRng(7))();
  const b = S.makeDiceRoller(S.makeRng(7))();
  assert.deepStrictEqual(a, b, '同一顆種子應該重現同樣的結果');
});

test('長期實測返還率會收斂到理論值', () => {
  S.applyPaytable(S.clonePaytable(S.STANDARD));
  const roll = S.makeDiceRoller(S.makeRng(2024));
  for (const id of ['big', 'total9', 'combo12', 'single1']) {
    const bet = S.BY_ID[id];
    let net = 0;
    const n = 400000;
    for (let i = 0; i < n; i++) net += S.netOf(bet, roll());
    const actual = net / n;
    assert.ok(Math.abs(actual - bet.ev) < 0.01, `${id}: 實測 ${actual.toFixed(4)} vs 理論 ${bet.ev.toFixed(4)}`);
  }
});

test('每個注區的標準差與窮舉結果一致', () => {
  S.applyPaytable(S.clonePaytable(S.STANDARD));
  for (const bet of S.BETS) {
    let sq = 0;
    for (const d of ALL) { const n = S.netOf(bet, d); sq += n * n; }
    const sd = Math.sqrt(sq / 216 - bet.ev ** 2);
    assert.ok(Math.abs(sd - bet.sd) < 1e-12, `${bet.id}: sd ${bet.sd} vs 窮舉 ${sd}`);
  }
  // 一賠一的注每局非贏即輸一個單位，標準差必然貼近 1
  assert.ok(Math.abs(S.BY_ID.big.sd - 1) < 0.001);
  // 圍骰極端偏態，波動遠大於大小
  assert.ok(S.BY_ID.triple1.sd > 12);
});

test('一晚的展望：期望值精確，區間與破產率合理', () => {
  const o = S.outlook({ betId: 'big', stake: 100, rounds: 160, bankroll: 3000, sessions: 2000 });
  assert.strictEqual(o.wagered, 16000);
  assert.ok(Math.abs(o.mean - 16000 * S.BY_ID.big.ev) < 1e-9, '期望損益應該是投注額乘上期望值');
  assert.ok(o.p05 <= o.p50 && o.p50 <= o.p95, '分位數順序不對');
  assert.ok(o.bustRate >= 0 && o.bustRate <= 1);
  assert.ok(o.aheadRate > 0.2 && o.aheadRate < 0.5, `收在正的比例 ${o.aheadRate} 不合理`);
  assert.ok(o.p05 < 0 && o.p95 > 0, '九成區間應該橫跨零');
});

test('一晚的展望：本金夠大就不會破產，同種子可重現', () => {
  const big = S.outlook({ betId: 'big', stake: 10, rounds: 100, bankroll: 1e7, sessions: 500 });
  assert.strictEqual(big.bustRate, 0, '本金遠大於可能虧損時不該破產');

  const a = S.outlook({ betId: 'total9', stake: 50, rounds: 80, bankroll: 1000, sessions: 500, seed: 42 });
  const b = S.outlook({ betId: 'total9', stake: 50, rounds: 80, bankroll: 1000, sessions: 500, seed: 42 });
  assert.deepStrictEqual([a.p05, a.p50, a.p95, a.bustRate], [b.p05, b.p50, b.p95, b.bustRate]);
});

test('一晚的展望：注區越差，期望成本越高', () => {
  const args = { stake: 100, rounds: 160, bankroll: 100000, sessions: 500 };
  const good = S.outlook(Object.assign({ betId: 'big' }, args));
  const bad = S.outlook(Object.assign({ betId: 'total9' }, args));
  assert.ok(bad.mean < good.mean, '點數 9 的期望損失應該比大更慘');
  assert.ok(Math.abs(bad.mean / good.mean - S.BY_ID.total9.he / S.BY_ID.big.he) < 1e-9);
});
