/* =============================================================
   quiz.js — 賠率快問快答的出題邏輯
   純函式、不碰 DOM，題目全部依「目前生效的賠率表」即時產生，
   所以你把賠率改成自己那張桌，練的就是那張桌。
   ============================================================= */
(function (root, factory) {
  var S = (typeof module === 'object' && module.exports)
    ? require('./bets.js')
    : (root && root.SicBo);
  var api = factory(S);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SicBoQuiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';

  var TYPES = [
    { id: 'better', name: '挑注區' },
    { id: 'payout', name: '記賠率' },
    { id: 'hit', name: '判輸贏' }
  ];

  function fmtPct(v, digits) {
    return (v * 100).toFixed(digits === undefined ? 2 : digits).replace('-', '−') + '%';
  }

  function make(rand) {
    var rnd = rand || Math.random;
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    function int(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
    function shuffle(a) {
      var out = a.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1));
        var t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    }

    /* ---- 題型一：兩個注區，哪個莊家優勢低 ---- */
    function qBetter() {
      var a, b, ha, hb;
      for (var tries = 0; tries < 200; tries++) {
        a = pick(S.KINDS); b = pick(S.KINDS);
        if (a.id === b.id) continue;
        ha = S.BY_ID[a.id].he; hb = S.BY_ID[b.id].he;
        if (Math.abs(ha - hb) >= 0.01) break;         // 差距太小就不出，避免變成猜謎
      }
      var good = ha < hb ? a : b, bad = ha < hb ? b : a;
      var gh = S.BY_ID[good.id].he, bh = S.BY_ID[bad.id].he;
      return {
        type: 'better',
        prompt: '哪一個注區對玩家比較划算？',
        hint: '也就是莊家優勢比較低的那個。',
        options: shuffle([good, bad]).map(function (k) {
          return {
            key: k.id,
            label: k.name,
            sub: '賠 ' + S.BY_ID[k.id].oddsText,
            correct: k.id === good.id
          };
        }),
        explain: '「' + good.short + '」莊家優勢 ' + fmtPct(gh) + '，「' + bad.short + '」' + fmtPct(bh) +
          '。每押 100 元，長期平均差 ' + ((bh - gh) * 100).toFixed(2) + ' 元。'
      };
    }

    /* ---- 題型二：這注賠多少 ---- */
    function qPayout() {
      var pool = S.KINDS.filter(function (k) { return S.BY_ID[k.id].group !== 'single'; });
      var k = pick(pool), bet = S.BY_ID[k.id], correct = bet.payout;

      var seen = {}, alts = [];
      S.KINDS.forEach(function (o) {
        var p = S.BY_ID[o.id].payout;
        if (S.BY_ID[o.id].group === 'single') return;
        if (p === correct || seen[p]) return;
        seen[p] = 1; alts.push(p);
      });
      // 賠率表被改到選項不夠時，補幾個看起來合理的數字
      [2, 3, 5, 15, 25, 50, 100].forEach(function (p) {
        if (alts.length >= 12 || p === correct || seen[p]) return;
        seen[p] = 1; alts.push(p);
      });
      var wrong = shuffle(alts).slice(0, 3);

      return {
        type: 'payout',
        prompt: '「' + k.name + '」賠多少？',
        hint: '中獎時每 1 元本金淨賺幾元。',
        options: shuffle(wrong.concat([correct])).map(function (p) {
          return { key: String(p), label: p + ' : 1', correct: p === correct };
        }),
        explain: '「' + k.short + '」賠 ' + correct + ' : 1 —— 押 100 中了，拿回 100 本金加 ' +
          (correct * 100).toLocaleString('en-US') + ' 彩金，共 ' +
          ((correct + 1) * 100).toLocaleString('en-US') + '。中獎機率 ' +
          fmtPct(bet.ways / 216, 1) + '，莊家優勢 ' + fmtPct(bet.he) + '。'
      };
    }

    /* ---- 題型三：開出這三顆，這注中了沒 ---- */
    function qHit() {
      var dice, wantTriple = rnd() < 0.45;               // 圍骰的規則最容易記錯，多考一點
      if (wantTriple) { var v = int(1, 6); dice = [v, v, v]; }
      else {
        do { dice = [int(1, 6), int(1, 6), int(1, 6)]; } while (S.isTriple(dice));
      }
      var m = S.counts(dice), tot = S.sum(dice);
      var cands = ['big', 'small', 'odd', 'even'];
      cands.push('double' + (rnd() < 0.6 ? dice[int(0, 2)] : int(1, 6)));
      cands.push('single' + (rnd() < 0.6 ? dice[int(0, 2)] : int(1, 6)));
      cands.push('total' + (rnd() < 0.5 ? Math.min(17, Math.max(4, tot)) : int(4, 17)));
      var x = dice[int(0, 2)], y = int(1, 6);
      if (y === x) y = (y % 6) + 1;
      cands.push('combo' + Math.min(x, y) + Math.max(x, y));

      var bet = S.BY_ID[pick(cands)];
      var hit = !!bet.win(dice);

      var why;
      if (bet.group === 'main') {
        why = S.isTriple(dice)
          ? '開圍骰，大小單雙一律通殺——不管總點是多少。'
          : '總點 ' + tot + '，' + (tot >= 11 ? '屬於大' : '屬於小') + '、' + (tot % 2 ? '單' : '雙') + '。';
      } else if (bet.group === 'double') {
        var dv = Number(bet.id.slice(6));
        why = dv + ' 出現了 ' + m[dv] + ' 次，長骰要至少兩次' + (hit ? '' : '，所以沒中') + '。' +
          (S.isTriple(dice) && dv === dice[0] ? '（圍骰也算長骰中獎。）' : '');
      } else if (bet.group === 'single') {
        var sv = Number(bet.id.slice(6));
        why = sv + ' 出現了 ' + m[sv] + ' 次' + (hit ? '，賠 ' + m[sv] + ' 倍' : '，一次都沒出現') + '。';
      } else if (bet.group === 'total') {
        why = '總點是 ' + tot + '，這注買的是 ' + bet.label + '。';
      } else {
        why = '要兩個點數各至少出現一顆；開出的是 ' + dice.join('、') + '。';
      }

      return {
        type: 'hit',
        prompt: '押「' + bet.label + '」中了嗎？',
        dice: dice,
        total: tot,
        options: [
          { key: 'y', label: '中了', correct: hit },
          { key: 'n', label: '沒中', correct: !hit }
        ],
        explain: why + (hit ? '　→ 中，賠 ' + (bet.group === 'single' ? m[Number(bet.id.slice(6))] : bet.payout) + ' : 1。' : '　→ 沒中。')
      };
    }

    var makers = { better: qBetter, payout: qPayout, hit: qHit };

    return {
      TYPES: TYPES,
      next: function (type) { return (makers[type] || pick([qBetter, qPayout, qHit]))(); },
      round: function (n) {
        // 一輪固定 n 題，三種題型輪流出，順序打散
        var order = [], i;
        for (i = 0; i < n; i++) order.push(TYPES[i % TYPES.length].id);
        return shuffle(order).map(function (t) { return makers[t](); });
      }
    };
  }

  return { make: make, TYPES: TYPES };
});
