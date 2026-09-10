/* =============================================================
   bets.js — 骰寶的機率模型
   注區定義、賠率表、亂數。不碰 DOM，所以瀏覽器和 Node 測試
   跑的是同一份程式碼。
   ============================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SicBo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 亂數 ----------------
     實際開骰用 crypto + 拒絕採樣，六面完全等機率。 */
  var pool = new Uint8Array(1024), poolAt = pool.length;
  var hasCrypto = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
  function nextByte() {
    if (!hasCrypto) return Math.floor(Math.random() * 256);
    if (poolAt >= pool.length) { crypto.getRandomValues(pool); poolAt = 0; }
    return pool[poolAt++];
  }
  function d6() { for (;;) { var b = nextByte(); if (b < 252) return (b % 6) + 1; } }
  function rollDice() { return [d6(), d6(), d6()]; }

  /* 模擬器要跑上百萬局，改用 xorshift32；
     2^32 % 6 = 4，取模偏差約十億分之一，對統計沒有影響。 */
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9E3779B9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s;
    };
  }
  function makeDiceRoller(rng) {
    return function () { return [rng() % 6 + 1, rng() % 6 + 1, rng() % 6 + 1]; };
  }

  /* ---------------- 組合 ---------------- */
  var WAYS = {};                       // 總點 -> 組合數（合計 216）
  for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) for (var c = 1; c <= 6; c++) {
    var t = a + b + c; WAYS[t] = (WAYS[t] || 0) + 1;
  }

  function counts(d) { var m = [0, 0, 0, 0, 0, 0, 0]; m[d[0]]++; m[d[1]]++; m[d[2]]++; return m; }
  function isTriple(d) { return d[0] === d[1] && d[1] === d[2]; }
  function sum(d) { return d[0] + d[1] + d[2]; }

  /* ---------------- 賠率表 ----------------
     各家賭場不同，尤其全圍／圍骰／長骰／二骰組合這四項。
     單骰的 1／2／3 倍到處都一樣，所以不開放調整。 */
  var STANDARD = {
    id: 'standard',
    name: '標準賠率',
    note: '最常見的一版，本站預設。',
    main: 1, anytriple: 30, triple: 180, double: 10, combo: 6,
    totals: { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 }
  };

  // 只動四項高賠注區，用來看賠率差一級對莊家優勢的影響有多大
  var TIGHT = {
    id: 'tight',
    name: '較低賠率示例',
    note: '只把全圍、圍骰、長骰、二骰組合換成常見的較低賠率，點數維持不變。',
    main: 1, anytriple: 24, triple: 150, double: 8, combo: 5,
    totals: STANDARD.totals
  };

  var PAYTABLES = [STANDARD, TIGHT];

  function clonePaytable(pt) {
    return {
      id: pt.id, name: pt.name, note: pt.note,
      main: pt.main, anytriple: pt.anytriple, triple: pt.triple,
      double: pt.double, combo: pt.combo,
      totals: JSON.parse(JSON.stringify(pt.totals))
    };
  }

  /* ---------------- 注區 ----------------
     win(dice) 回傳是否中獎（單骰回傳中的顆數）。
     實際賠率一律從賠率表來，不寫死在判定裡。 */
  var BETS = [], BY_ID = {};
  var GROUP_LABEL = { triple: '圍骰／全圍', main: '大小單雙', double: '長骰', total: '點數', combo: '二骰組合', single: '單骰' };

  function add(bet) {
    if (!bet.oddsText) bet.oddsText = '';
    BETS.push(bet); BY_ID[bet.id] = bet; return bet;
  }

  var n, i, j;
  for (n = 1; n <= 6; n++) (function (v) {
    add({ id: 'triple' + v, group: 'triple', label: '圍 ' + v, ways: 1, pay: { kind: 'triple' }, dice: [v, v, v],
      win: function (d) { return isTriple(d) && d[0] === v; } });
  })(n);

  add({ id: 'anytriple', group: 'triple', label: '全圍', ways: 6, pay: { kind: 'anytriple' },
    win: function (d) { return isTriple(d); } });

  add({ id: 'small', group: 'main', label: '小', sub: '4 – 10', tone: 'small', ways: 105, pay: { kind: 'main' },
    win: function (d) { return !isTriple(d) && sum(d) >= 4 && sum(d) <= 10; } });
  add({ id: 'odd', group: 'main', label: '單', sub: '總點單數', ways: 105, pay: { kind: 'main' },
    win: function (d) { return !isTriple(d) && sum(d) % 2 === 1; } });
  add({ id: 'even', group: 'main', label: '雙', sub: '總點雙數', ways: 105, pay: { kind: 'main' },
    win: function (d) { return !isTriple(d) && sum(d) % 2 === 0; } });
  add({ id: 'big', group: 'main', label: '大', sub: '11 – 17', tone: 'big', ways: 105, pay: { kind: 'main' },
    win: function (d) { return !isTriple(d) && sum(d) >= 11 && sum(d) <= 17; } });

  for (n = 1; n <= 6; n++) (function (v) {
    add({ id: 'double' + v, group: 'double', label: '長 ' + v, ways: 16, pay: { kind: 'double' }, dice: [v, v],
      win: function (d) { return counts(d)[v] >= 2; } });
  })(n);

  for (n = 4; n <= 17; n++) (function (v) {
    add({ id: 'total' + v, group: 'total', label: String(v), ways: WAYS[v], pay: { kind: 'total', n: v },
      win: function (d) { return sum(d) === v; } });
  })(n);

  for (i = 1; i <= 6; i++) for (j = i + 1; j <= 6; j++) (function (x, y) {
    add({ id: 'combo' + x + y, group: 'combo', label: x + ' 和 ' + y, ways: 30, pay: { kind: 'combo' }, dice: [x, y],
      win: function (d) { var m = counts(d); return m[x] >= 1 && m[y] >= 1; } });
  })(i, j);

  for (n = 1; n <= 6; n++) (function (v) {
    add({ id: 'single' + v, group: 'single', label: '單骰 ' + v, ways: 91, pay: { kind: 'single' }, dice: [v],
      win: function (d) { return counts(d)[v]; } });
  })(n);

  /* 注區「種類」：每一種挑一個代表注區，供賠率表與快問快答共用。
     同一種類裡的每一格機率與賠率都一樣（例如 15 組二骰組合），列一次就夠。 */
  var KINDS = [
    { id: 'big', name: '大（11–17）', short: '大' },
    { id: 'small', name: '小（4–10）', short: '小' },
    { id: 'odd', name: '單', short: '單' },
    { id: 'even', name: '雙', short: '雙' },
    { id: 'combo12', name: '二骰組合（任一組）', short: '二骰組合' },
    { id: 'single1', name: '單骰（任一點）', short: '單骰' },
    { id: 'total7', name: '點數 7 或 14', short: '點數 7' },
    { id: 'total8', name: '點數 8 或 13', short: '點數 8' },
    { id: 'total10', name: '點數 10 或 11', short: '點數 10' },
    { id: 'total9', name: '點數 9 或 12', short: '點數 9' },
    { id: 'total6', name: '點數 6 或 15', short: '點數 6' },
    { id: 'total5', name: '點數 5 或 16', short: '點數 5' },
    { id: 'total4', name: '點數 4 或 17', short: '點數 4' },
    { id: 'anytriple', name: '全圍（任意三同點）', short: '全圍' },
    { id: 'double1', name: '長骰（指定對子）', short: '長骰' },
    { id: 'triple1', name: '圍骰（指定三同點）', short: '圍骰' }
  ];

  /* 中獎時每一元本金的淨賺；沒中就是 −1（本金輸掉）。 */
  function netOf(bet, dice) {
    var w = bet.win(dice);
    if (!w) return -1;
    return bet.group === 'single' ? w : bet.payout;
  }

  function payoutFor(pt, pay) {
    if (pay.kind === 'total') return pt.totals[pay.n];
    if (pay.kind === 'single') return 1;
    return pt[pay.kind];
  }

  /* 套用賠率表：重算每個注區的賠率、期望值與莊家優勢。 */
  var current = null;
  function applyPaytable(pt) {
    current = pt;
    for (var k = 0; k < BETS.length; k++) {
      var bet = BETS[k];
      bet.payout = payoutFor(pt, bet.pay);
      if (bet.group === 'single') {
        // 中 1／2／3 顆賠 1／2／3 倍：(75×1 + 15×2 + 1×3 − 125) / 216
        bet.ev = -17 / 216;
        bet.oddsText = '1 / 2 / 3 : 1';
      } else {
        bet.ev = (bet.ways / 216) * (bet.payout + 1) - 1;
        bet.oddsText = bet.payout + ' : 1';
      }
      bet.he = -bet.ev;

      // 標準差：同樣走完 216 種結果算，用來估「一晚可能的輸贏範圍」。
      // 大小這種一賠一的注 sd≈1，圍骰那種一賠 180 的 sd 超過 12——
      // 期望值一樣的兩注，體感可以差非常多。
      var sq = 0;
      for (var a2 = 1; a2 <= 6; a2++) for (var b2 = 1; b2 <= 6; b2++) for (var c2 = 1; c2 <= 6; c2++) {
        var net = netOf(bet, [a2, b2, c2]);
        sq += net * net;
      }
      bet.sd = Math.sqrt(Math.max(0, sq / 216 - bet.ev * bet.ev));
    }
    return pt;
  }
  function currentPaytable() { return current; }

  /* 一晚的展望。
     期望值算得出來，但「可能輸贏多少」高賠率注區的分佈歪得厲害，
     常態近似會騙人，所以區間與破產率都用蒙地卡羅直接跑。 */
  function outlook(o) {
    var bet = BY_ID[o.betId];
    var rounds = Math.max(1, Math.round(o.rounds));
    var stake = Math.max(1, o.stake);
    var bankroll = Math.max(stake, o.bankroll || stake * rounds);
    var sessions = o.sessions || 4000;
    var roll = makeDiceRoller(makeRng(o.seed || 0x5C1B0));

    var wagered = rounds * stake;
    var mean = wagered * bet.ev;                     // 理論期望損益（負值）

    var nets = [], bust = 0, ahead = 0;
    for (var s = 0; s < sessions; s++) {
      var bank = bankroll, played = 0;
      for (var r = 0; r < rounds; r++) {
        if (bank < stake) { bust++; break; }
        bank += netOf(bet, roll()) * stake;
        played++;
      }
      var net = bank - bankroll;
      nets.push(net);
      if (net > 0) ahead++;
    }
    nets.sort(function (x, y) { return x - y; });
    function q(p) { return nets[Math.min(nets.length - 1, Math.floor(p * nets.length))]; }

    return {
      bet: bet, rounds: rounds, stake: stake, bankroll: bankroll,
      wagered: wagered,
      mean: mean,                                    // 期望損益
      perRound: bet.ev * stake,
      sd: stake * Math.sqrt(rounds) * bet.sd,
      p05: q(0.05), p50: q(0.5), p95: q(0.95),
      bustRate: bust / sessions,
      aheadRate: ahead / sessions
    };
  }

  applyPaytable(clonePaytable(STANDARD));

  return {
    WAYS: WAYS, BETS: BETS, BY_ID: BY_ID, GROUP_LABEL: GROUP_LABEL, KINDS: KINDS,
    PAYTABLES: PAYTABLES, STANDARD: STANDARD, TIGHT: TIGHT,
    clonePaytable: clonePaytable, applyPaytable: applyPaytable, currentPaytable: currentPaytable,
    outlook: outlook,
    netOf: netOf, payoutFor: payoutFor,
    rollDice: rollDice, makeRng: makeRng, makeDiceRoller: makeDiceRoller,
    counts: counts, isTriple: isTriple, sum: sum
  };
});
