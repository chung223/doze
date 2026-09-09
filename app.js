/* =============================================================
   骰寶練習桌 — Sic Bo practice table
   標準賠率表；所有機率與莊家優勢皆由 216 種等機率結果算出。
   ============================================================= */
(function () {
  'use strict';

  /* ---------------- 亂數：crypto + 拒絕採樣（去掉取模偏差） ------------- */
  var pool = new Uint8Array(1024), poolAt = pool.length;
  var hasCrypto = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
  function nextByte() {
    if (!hasCrypto) return Math.floor(Math.random() * 256);
    if (poolAt >= pool.length) { crypto.getRandomValues(pool); poolAt = 0; }
    return pool[poolAt++];
  }
  function d6() {
    for (;;) { var b = nextByte(); if (b < 252) return (b % 6) + 1; }
  }
  function rollDice() { return [d6(), d6(), d6()]; }

  /* ---------------- 組合計算 ---------------- */
  var WAYS = {};                       // 總點 -> 組合數（共 216）
  for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) for (var c = 1; c <= 6; c++) {
    var t = a + b + c; WAYS[t] = (WAYS[t] || 0) + 1;
  }
  var TOTAL_PAY = { 4: 60, 17: 60, 5: 30, 16: 30, 6: 17, 15: 17, 7: 12, 14: 12, 8: 8, 13: 8, 9: 6, 12: 6, 10: 6, 11: 6 };

  /* ---------------- 注區定義 ----------------
     resolve(dice) 回傳「每一元本金的淨結果」：+n 為淨贏，-1 為輸光本金。 */
  var BETS = [];
  var BY_ID = {};
  var GROUP_LABEL = { triple: '圍骰／全圍', main: '大小單雙', double: '長骰', total: '點數', combo: '二骰組合', single: '單骰' };

  function add(bet) {
    if (bet.ev === undefined) bet.ev = (bet.ways / 216) * (bet.payout + 1) - 1;
    bet.he = -bet.ev;                                   // 莊家優勢
    if (!bet.oddsText) bet.oddsText = bet.payout + ' : 1';
    BETS.push(bet); BY_ID[bet.id] = bet; return bet;
  }
  function counts(d) { var m = [0, 0, 0, 0, 0, 0, 0]; m[d[0]]++; m[d[1]]++; m[d[2]]++; return m; }
  function isTriple(d) { return d[0] === d[1] && d[1] === d[2]; }
  function sum(d) { return d[0] + d[1] + d[2]; }

  var n, i, j;
  // 圍骰（指定三同點）
  for (n = 1; n <= 6; n++) (function (v) {
    add({ id: 'triple' + v, group: 'triple', label: '圍 ' + v, ways: 1, payout: 180, dice: [v, v, v],
      resolve: function (d) { return isTriple(d) && d[0] === v ? 180 : -1; } });
  })(n);
  // 全圍
  add({ id: 'anytriple', group: 'triple', label: '全圍', ways: 6, payout: 30,
    resolve: function (d) { return isTriple(d) ? 30 : -1; } });
  // 大小單雙（開圍骰通殺）
  add({ id: 'small', group: 'main', label: '小', sub: '4 – 10', tone: 'small', ways: 105, payout: 1,
    resolve: function (d) { return !isTriple(d) && sum(d) >= 4 && sum(d) <= 10 ? 1 : -1; } });
  add({ id: 'odd', group: 'main', label: '單', sub: '總點單數', ways: 105, payout: 1,
    resolve: function (d) { return !isTriple(d) && sum(d) % 2 === 1 ? 1 : -1; } });
  add({ id: 'even', group: 'main', label: '雙', sub: '總點雙數', ways: 105, payout: 1,
    resolve: function (d) { return !isTriple(d) && sum(d) % 2 === 0 ? 1 : -1; } });
  add({ id: 'big', group: 'main', label: '大', sub: '11 – 17', tone: 'big', ways: 105, payout: 1,
    resolve: function (d) { return !isTriple(d) && sum(d) >= 11 && sum(d) <= 17 ? 1 : -1; } });
  // 長骰（指定對子，圍骰亦算中）
  for (n = 1; n <= 6; n++) (function (v) {
    add({ id: 'double' + v, group: 'double', label: '長 ' + v, ways: 16, payout: 10, dice: [v, v],
      resolve: function (d) { return counts(d)[v] >= 2 ? 10 : -1; } });
  })(n);
  // 點數總和
  for (n = 4; n <= 17; n++) (function (v) {
    add({ id: 'total' + v, group: 'total', label: String(v), ways: WAYS[v], payout: TOTAL_PAY[v],
      resolve: function (d) { return sum(d) === v ? TOTAL_PAY[v] : -1; } });
  })(n);
  // 二骰組合
  for (i = 1; i <= 6; i++) for (j = i + 1; j <= 6; j++) (function (x, y) {
    add({ id: 'combo' + x + y, group: 'combo', label: x + ' 和 ' + y, ways: 30, payout: 6, dice: [x, y],
      resolve: function (d) { var m = counts(d); return m[x] >= 1 && m[y] >= 1 ? 6 : -1; } });
  })(i, j);
  // 單骰
  for (n = 1; n <= 6; n++) (function (v) {
    add({ id: 'single' + v, group: 'single', label: '單骰 ' + v, ways: 91, payout: 1, dice: [v],
      oddsText: '1 / 2 / 3 : 1', ev: -17 / 216,
      resolve: function (d) { var k = counts(d)[v]; return k > 0 ? k : -1; } });
  })(n);

  /* ---------------- 籌碼 ---------------- */
  var CHIPS = [
    { v: 1, bg: '#EDE7DA', dark: false },
    { v: 5, bg: '#C4392E', dark: true },
    { v: 25, bg: '#2E7D52', dark: true },
    { v: 100, bg: '#1C1C1C', dark: true },
    { v: 500, bg: '#6B4A9E', dark: true }
  ];
  function chipStyle(amount) {
    var s = CHIPS[0];
    for (var k = 0; k < CHIPS.length; k++) if (amount >= CHIPS[k].v) s = CHIPS[k];
    return s;
  }

  var START = 1000, SPOT_MAX = 1000;
  var STORE = 'sicbo-practice-v1';

  /* ---------------- 狀態 ---------------- */
  var state = {
    balance: START,
    chip: 25,
    bets: {},                 // id -> 金額
    stack: [],                // 下注順序（撤銷用）
    last: {},                 // 上一局的注碼
    road: [],                 // {t: 總點, k: 'big'|'small'|'triple'}
    sound: false,
    stats: { rounds: 0, wagered: 0, returned: 0, evSum: 0, dist: {}, groups: {} }
  };
  var rolling = false, seeded = false;

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        balance: state.balance, chip: state.chip, last: state.last,
        road: state.road.slice(-60), sound: state.sound, stats: state.stats
      }));
    } catch (e) { /* 私密瀏覽或封鎖儲存時忽略 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE); if (!raw) return false;
      var o = JSON.parse(raw); if (!o || typeof o.balance !== 'number') return false;
      state.balance = o.balance; state.chip = o.chip || 25; state.last = o.last || {};
      state.road = o.road || []; state.sound = !!o.sound;
      if (o.stats) state.stats = o.stats;
      if (!state.stats.dist) state.stats.dist = {};
      if (!state.stats.groups) state.stats.groups = {};
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 小工具 ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('zh-Hant-TW');
  function money(v) { return nf.format(Math.round(v)); }
  function signed(v) { var r = Math.round(v); return (r > 0 ? '+' : r < 0 ? '−' : '') + nf.format(Math.abs(r)); }
  function signed2(v) { var s = v < 0 ? '−' : v > 0 ? '+' : ''; return s + Math.abs(v).toFixed(2); }
  function pct(v, digits) {
    var s = (v * 100).toFixed(digits === undefined ? 2 : digits);
    return s.replace('-', '−') + '%';
  }
  function netClass(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }

  var toastEl, toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  var PIPS = {
    1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]],
    4: [[1, 1], [1, 3], [3, 1], [3, 3]], 5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
    6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]]
  };
  function pipHTML(v) {
    return PIPS[v].map(function (p) { return '<span class="pip" style="grid-row:' + p[0] + ';grid-column:' + p[1] + '"></span>'; }).join('');
  }
  function mini(v, extra) {
    return '<span class="mini' + (v === 1 || v === 4 ? ' red' : '') + (extra ? ' ' + extra : '') + '" aria-hidden="true">' + pipHTML(v) + '</span>';
  }

  /* ---------------- 骰盅 ---------------- */
  var FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  var dieEls = [], spin = [[0, 0], [0, 0], [0, 0]];
  function buildDice() {
    for (var k = 0; k < 3; k++) {
      var el = $('die' + k), html = '';
      for (var f = 1; f <= 6; f++) {
        html += '<div class="die-face f' + f + (f === 1 || f === 4 ? ' red' : '') + '">' + pipHTML(f) + '</div>';
      }
      el.innerHTML = html; dieEls.push(el);
    }
  }
  function showDice(d, animate) {
    for (var k = 0; k < 3; k++) {
      var base = FACE_ROT[d[k]];
      if (animate) { spin[k][0] += 360 * (2 + (k % 2)); spin[k][1] += 360 * (3 - (k % 2)); }
      var jx = animate ? (Math.random() * 8 - 4) : 0, jy = animate ? (Math.random() * 6 - 3) : 0;
      dieEls[k].style.transform =
        'translate3d(' + jx.toFixed(1) + 'px,' + jy.toFixed(1) + 'px,0) rotateX(' + (spin[k][0] + base[0]) + 'deg) rotateY(' + (spin[k][1] + base[1]) + 'deg)';
    }
  }

  /* ---------------- 音效 ---------------- */
  var actx = null;
  function ac() {
    if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function rattle() {
    var x = state.sound && ac(); if (!x) return;
    var dur = 0.7, sr = x.sampleRate, buf = x.createBuffer(1, sr * dur, sr), ch = buf.getChannelData(0);
    for (var s = 0; s < ch.length; s++) {
      var env = Math.pow(1 - s / ch.length, 1.6);
      var click = (s % Math.floor(sr * 0.055) < sr * 0.006) ? 1.6 : 0.35;
      ch[s] = (Math.random() * 2 - 1) * env * click * 0.5;
    }
    var src = x.createBufferSource(); src.buffer = buf;
    var bp = x.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
    var g = x.createGain(); g.gain.value = 0.35;
    src.connect(bp); bp.connect(g); g.connect(x.destination); src.start();
  }
  function chime(up) {
    var x = state.sound && ac(); if (!x) return;
    [0, 0.11].forEach(function (t, k) {
      var o = x.createOscillator(), g = x.createGain();
      o.type = 'triangle';
      o.frequency.value = up ? [660, 990][k] : [300, 220][k];
      g.gain.setValueAtTime(0.0001, x.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.16, x.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, x.currentTime + t + 0.30);
      o.connect(g); g.connect(x.destination); o.start(x.currentTime + t); o.stop(x.currentTime + t + 0.34);
    });
  }
  function tick() {
    var x = state.sound && ac(); if (!x) return;
    var o = x.createOscillator(), g = x.createGain();
    o.type = 'square'; o.frequency.value = 1500;
    g.gain.setValueAtTime(0.06, x.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, x.currentTime + 0.06);
    o.connect(g); g.connect(x.destination); o.start(); o.stop(x.currentTime + 0.07);
  }

  /* ---------------- 建立注區 ---------------- */
  var cellEls = {};
  function cellHTML(bet, face) {
    return '<span class="face">' + (face || '') + '</span>' +
      '<span class="name">' + bet.label + '</span>' +
      '<span class="odds">' + bet.oddsText + '</span>' +
      (bet.sub ? '<span class="he">' + bet.sub + '</span>' : '');
  }
  function makeCell(bet, face, cls) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'cell' + (cls ? ' ' + cls : '');
    el.dataset.bet = bet.id;
    if (bet.tone) el.dataset.tone = bet.tone;
    el.setAttribute('aria-label', bet.label + '，賠 ' + bet.oddsText + '，莊家優勢 ' + pct(bet.he));
    el.title = bet.label + ' · 賠 ' + bet.oddsText + ' · 中獎組合 ' + bet.ways + '/216（' + pct(bet.ways / 216) + '）· 莊家優勢 ' + pct(bet.he);
    el.innerHTML = cellHTML(bet, face);
    cellEls[bet.id] = el;
    return el;
  }
  function band(title, odds, hint, gridCls) {
    var sec = document.createElement('section'); sec.className = 'band';
    var head = document.createElement('div'); head.className = 'band-head';
    head.innerHTML = '<h3>' + title + '</h3>' + (odds ? '<span class="odds">' + odds + '</span>' : '') +
      (hint ? '<span class="hint">' + hint + '</span>' : '');
    var grid = document.createElement('div'); grid.className = 'grid ' + gridCls;
    sec.appendChild(head); sec.appendChild(grid);
    return { sec: sec, grid: grid };
  }
  function buildLayout() {
    var root = $('layout'), k;

    var b1 = band('圍骰', '', '三顆同點', 'g-triples');
    for (k = 1; k <= 6; k++) {
      b1.grid.appendChild(makeCell(BY_ID['triple' + k], mini(k) + mini(k) + mini(k), 'tall'));
    }
    b1.grid.appendChild(makeCell(BY_ID.anytriple, '', 'tall'));
    root.appendChild(b1.sec);

    var b2 = band('大 · 小 · 單 · 雙', '賠 1 : 1', '開圍骰通殺', 'g-main');
    ['small', 'odd', 'even', 'big'].forEach(function (id) { b2.grid.appendChild(makeCell(BY_ID[id], '', 'main tall')); });
    root.appendChild(b2.sec);

    var b3 = band('長骰（對子）', '賠 10 : 1', '指定點數至少出現兩次', 'g-doubles');
    for (k = 1; k <= 6; k++) b3.grid.appendChild(makeCell(BY_ID['double' + k], mini(k) + mini(k)));
    root.appendChild(b3.sec);

    var b4 = band('點數總和', '', '賠率印在格內', 'g-totals');
    for (k = 4; k <= 17; k++) b4.grid.appendChild(makeCell(BY_ID['total' + k], '', 'num-cell'));
    root.appendChild(b4.sec);

    var b5 = band('二骰組合', '賠 6 : 1', '兩個不同點數各至少一顆', 'g-combos');
    BETS.forEach(function (bet) {
      if (bet.group === 'combo') b5.grid.appendChild(makeCell(bet, mini(bet.dice[0]) + mini(bet.dice[1])));
    });
    root.appendChild(b5.sec);

    var b6 = band('單骰', '中 1 / 2 / 3 顆　賠 1 / 2 / 3', '', 'g-singles');
    for (k = 1; k <= 6; k++) b6.grid.appendChild(makeCell(BY_ID['single' + k], mini(k, 'lg'), 'tall'));
    root.appendChild(b6.sec);

    root.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.cell') : null;
      if (el) place(el.dataset.bet);
    });
    root.addEventListener('contextmenu', function (e) {
      var el = e.target.closest ? e.target.closest('.cell') : null;
      if (el) { e.preventDefault(); takeBack(el.dataset.bet); }
    });
    // 手機長按＝退注
    var pressTimer = null;
    root.addEventListener('touchstart', function (e) {
      var el = e.target.closest ? e.target.closest('.cell') : null; if (!el) return;
      pressTimer = setTimeout(function () { pressTimer = null; takeBack(el.dataset.bet); }, 520);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
      root.addEventListener(ev, function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }, { passive: true });
    });
  }

  /* ---------------- 籌碼盤 ---------------- */
  function buildTray() {
    var tray = $('tray');
    CHIPS.forEach(function (c) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'chip' + (c.dark ? ' dark' : '');
      el.style.background = c.bg;
      el.dataset.chip = String(c.v);
      el.textContent = c.v;
      el.setAttribute('aria-pressed', String(state.chip === c.v));
      el.setAttribute('aria-label', '籌碼 ' + c.v);
      el.addEventListener('click', function () { setChip(c.v); });
      tray.appendChild(el);
    });
  }
  function setChip(v) {
    state.chip = v;
    Array.prototype.forEach.call($('tray').children, function (el) {
      el.setAttribute('aria-pressed', String(Number(el.dataset.chip) === v));
    });
    save();
  }

  /* ---------------- 下注 ---------------- */
  function totalStake() { var s = 0; for (var k in state.bets) s += state.bets[k]; return s; }
  function evOfTable() { var e = 0; for (var k in state.bets) e += state.bets[k] * BY_ID[k].ev; return e; }

  function clearMarks() {
    for (var id in cellEls) cellEls[id].classList.remove('win', 'lost', 'hit');
  }
  function place(id) {
    if (rolling) return;
    clearMarks();
    var amt = state.chip;
    if (amt > state.balance) { toast('餘額不足，改用小面額籌碼吧。'); return; }
    if ((state.bets[id] || 0) + amt > SPOT_MAX) { toast('超過限紅：單一注區上限 ' + money(SPOT_MAX) + '。'); return; }
    state.bets[id] = (state.bets[id] || 0) + amt;
    state.balance -= amt;
    state.stack.push({ id: id, amt: amt });
    tick(); renderTable(); renderMeters(); save();
  }
  function takeBack(id) {
    if (rolling || !state.bets[id]) return;
    for (var k = state.stack.length - 1; k >= 0; k--) {
      if (state.stack[k].id === id) {
        var e = state.stack.splice(k, 1)[0];
        state.bets[id] -= e.amt; state.balance += e.amt;
        if (state.bets[id] <= 0) delete state.bets[id];
        tick(); renderTable(); renderMeters(); save(); return;
      }
    }
  }
  function undo() {
    if (rolling || !state.stack.length) return;
    var e = state.stack.pop();
    state.bets[e.id] -= e.amt; state.balance += e.amt;
    if (state.bets[e.id] <= 0) delete state.bets[e.id];
    clearMarks(); renderTable(); renderMeters(); save();
  }
  function clearBets() {
    if (rolling) return;
    state.balance += totalStake();
    state.bets = {}; state.stack = [];
    clearMarks(); renderTable(); renderMeters(); save();
  }
  function repeatBets() {
    if (rolling) return;
    var need = 0, k;
    for (k in state.last) need += state.last[k];
    if (!need) { toast('還沒有上一局的注碼。'); return; }
    var back = totalStake();
    if (need > state.balance + back) { toast('餘額不足以重複上一局（需要 ' + money(need) + '）。'); return; }
    state.balance += back;
    state.bets = {}; state.stack = [];
    for (k in state.last) { state.bets[k] = state.last[k]; state.stack.push({ id: k, amt: state.last[k] }); }
    state.balance -= need;
    clearMarks(); renderTable(); renderMeters(); save();
  }
  function doubleBets() {
    if (rolling) return;
    var extra = 0, k;
    for (k in state.bets) extra += Math.min(state.bets[k], SPOT_MAX - state.bets[k]);
    if (!extra) { toast(totalStake() ? '已達單一注區限紅。' : '請先下注。'); return; }
    if (extra > state.balance) { toast('餘額不足以加倍（需要 ' + money(extra) + '）。'); return; }
    for (k in state.bets) {
      var addAmt = Math.min(state.bets[k], SPOT_MAX - state.bets[k]);
      if (addAmt > 0) { state.bets[k] += addAmt; state.stack.push({ id: k, amt: addAmt }); }
    }
    state.balance -= extra;
    clearMarks(); renderTable(); renderMeters(); save();
  }

  /* ---------------- 開骰 ---------------- */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function roll() {
    if (rolling) return;
    var stake = totalStake();
    if (!stake) { toast('請先下注：選籌碼後點桌面注區。'); return; }
    rolling = true; setBusy(true);
    var dice = rollDice();

    var dome = $('dome');
    if (reduced) {
      showDice(dice, false); settle(dice, stake);
      return;
    }
    rattle();
    dome.classList.remove('shaking');
    void dome.offsetWidth;
    dome.classList.add('shaking');
    wait(620).then(function () {
      dome.classList.remove('shaking');
      showDice(dice, true);
      return wait(950);
    }).then(function () { settle(dice, stake); });
  }

  function settle(dice, stake) {
    var st = state.stats, id, bet, m, ret, rows = [], returned = 0, evRound = 0;

    for (id in state.bets) {
      bet = BY_ID[id]; m = bet.resolve(dice);
      ret = m > 0 ? state.bets[id] * (1 + m) : 0;
      returned += ret; evRound += state.bets[id] * bet.ev;
      rows.push({ id: id, label: bet.label, group: bet.group, stake: state.bets[id], net: ret - state.bets[id], won: m > 0, mult: m });
      var g = st.groups[bet.group] || (st.groups[bet.group] = { n: 0, wagered: 0, net: 0 });
      g.n++; g.wagered += state.bets[id]; g.net += ret - state.bets[id];
    }

    state.balance += returned;
    st.rounds++; st.wagered += stake; st.returned += returned; st.evSum += evRound;
    var tot = sum(dice);
    st.dist[tot] = (st.dist[tot] || 0) + 1;

    var kind = isTriple(dice) ? 'triple' : (tot >= 11 ? 'big' : 'small');
    state.road.push({ t: tot, k: kind, d: dice.slice() });
    if (state.road.length > 60) state.road = state.road.slice(-60);

    state.last = JSON.parse(JSON.stringify(state.bets));
    var net = returned - stake;

    // 標記中獎／落空的注區
    clearMarks();
    BETS.forEach(function (bt) {
      var hit = bt.resolve(dice) > 0;
      var el = cellEls[bt.id];
      if (hit) el.classList.add(state.bets[bt.id] ? 'win' : 'hit');
      else if (state.bets[bt.id]) el.classList.add('lost');
    });

    state.bets = {}; state.stack = [];
    renderResult(dice, tot, kind, rows, stake, returned, net);
    renderTable(); renderMeters(); renderRoad(); renderStats(); save();
    chime(net >= 0);
    if (net > 0) toast('本局 ' + signed(net) + '　派彩 ' + money(returned));
    else if (net < 0) toast('本局 ' + signed(net));
    if (state.balance <= 0 && !totalStake()) toast('籌碼用完了 — 到「統計」分頁按「重置牌局」再來一輪。');

    rolling = false; setBusy(false);
  }

  function setBusy(on) {
    ['btnRoll', 'btnRepeat', 'btnUndo', 'btnClear', 'btnDouble'].forEach(function (id) { $(id).disabled = on; });
    $('btnRoll').textContent = on ? '搖骰中…' : '開　骰';
  }

  /* ---------------- 畫面 ---------------- */
  function renderTable() {
    for (var id in cellEls) {
      var el = cellEls[id], amt = state.bets[id] || 0, old = el.querySelector('.stack');
      if (old) old.remove();
      el.classList.toggle('has-bet', amt > 0);
      if (amt > 0) {
        var cs = chipStyle(amt);
        var s = document.createElement('span');
        s.className = 'stack' + (cs.dark ? ' dark' : '');
        s.style.background = cs.bg;
        s.textContent = amt >= 1000 ? (amt / 1000) + 'K' : amt;
        el.appendChild(s);
      }
    }
  }

  function renderMeters() {
    var stake = totalStake(), ev = evOfTable(), spots = Object.keys(state.bets).length;
    $('mBalance').textContent = money(state.balance);
    $('mStake').textContent = money(stake);
    $('mStakeSub').textContent = spots + ' 個注區';
    var evEl = $('mEv');
    evEl.textContent = stake ? signed2(ev) : '0';
    evEl.className = 'v num ' + (stake ? netClass(ev) : '');
    $('mEvSub').textContent = stake ? '長期平均 ' + pct(ev / stake) + '／局' : '尚未下注';
    $('railRounds').textContent = money(state.stats.rounds);
    var net = state.stats.returned - state.stats.wagered;
    var rn = $('railNet');
    rn.textContent = signed(net);
    rn.className = 'v num ' + (net === 0 ? 'gold' : netClass(net));
    $('mBalanceSub').textContent = '起始 ' + money(START);
    $('btnRoll').disabled = rolling;
  }

  function renderRoad() {
    var el = $('road');
    el.classList.toggle('is-empty', !state.road.length);
    if (!state.road.length) {
      el.innerHTML = '<span class="road-empty">開骰後，每局結果會依序記在這裡（由左至右、由上而下）。</span>';
      return;
    }
    var LABEL = { big: '大', small: '小', triple: '圍' };
    el.innerHTML = state.road.map(function (r) {
      return '<span class="bead" data-t="' + r.k + '" title="' + r.t + ' 點 · ' + LABEL[r.k] + '">' + r.t + '</span>';
    }).join('');
    el.scrollLeft = el.scrollWidth;
  }

  function showPlate(dice, tot, kind) {
    $('plate').classList.remove('idle');
    $('totalNum').textContent = tot;
    var v = $('verdict');
    var LABEL = { big: '大', small: '小', triple: '圍骰' };
    var parity = tot % 2 === 1 ? '單' : '雙';
    v.dataset.v = kind;
    v.textContent = kind === 'triple'
      ? '圍骰 ' + dice[0] + '（大小單雙通殺）'
      : LABEL[kind] + ' · ' + parity + ' · ' + dice.join(' + ');
  }

  function renderResult(dice, tot, kind, rows, stake, returned, net) {
    showPlate(dice, tot, kind);
    rows.sort(function (x, y) { return y.net - x.net; });
    var html = '<div class="row' + (net > 0 ? ' won' : '') + '" style="border-color:var(--gold-dim)">' +
      '<span class="r-name"><b>本局 ' + dice.join(' · ') + '　共 ' + tot + ' 點</b></span>' +
      '<span class="r-stake">注 ' + money(stake) + '</span>' +
      '<span class="r-net ' + netClass(net) + '">' + signed(net) + '</span></div>';
    html += rows.map(function (r) {
      var extra = r.won && r.group === 'single' ? '（中 ' + r.mult + ' 顆）' : '';
      return '<div class="row' + (r.won ? ' won' : '') + '">' +
        '<span class="r-name">' + r.label + extra + '</span>' +
        '<span class="r-stake">' + money(r.stake) + '</span>' +
        '<span class="r-net ' + netClass(r.net) + '">' + signed(r.net) + '</span></div>';
    }).join('');
    html += '<p class="empty">按「重複下注」可原樣再押一次。</p>';
    $('roundRows').innerHTML = html;
  }

  function renderStats() {
    var st = state.stats;
    $('sWager').textContent = money(st.wagered);
    var net = st.returned - st.wagered;
    var ne = $('sNet'); ne.textContent = signed(net); ne.className = 'v num ' + netClass(net);
    $('sRtp').textContent = st.wagered ? pct(st.returned / st.wagered, 1) : '—';
    $('sErtp').textContent = st.wagered ? pct(1 + st.evSum / st.wagered, 1) : '—';

    var tb = $('groupTable').querySelector('tbody');
    var keys = Object.keys(st.groups);
    if (!keys.length) {
      tb.innerHTML = '<tr><td colspan="4" style="color:var(--bone-3);text-align:left">尚無紀錄。</td></tr>';
    } else {
      keys.sort(function (a, b) { return st.groups[b].wagered - st.groups[a].wagered; });
      tb.innerHTML = keys.map(function (k) {
        var g = st.groups[k];
        return '<tr><td style="text-align:left">' + GROUP_LABEL[k] + '</td><td>' + money(g.n) + '</td><td>' +
          money(g.wagered) + '</td><td class="' + netClass(g.net) + '">' + signed(g.net) + '</td></tr>';
      }).join('');
    }
    drawChart();
  }

  /* --------- 分佈圖：實際 vs 理論 --------- */
  function drawChart() {
    var svg = $('chart'), W = 360, H = 168, L = 30, R = 6, T = 10, B = 26;
    var iw = W - L - R, ih = H - T - B;
    var st = state.stats, rounds = st.rounds || 0;
    $('chartN').textContent = money(rounds);

    var maxP = 0.125, t;
    for (t = 3; t <= 18; t++) {
      var act = rounds ? (st.dist[t] || 0) / rounds : 0;
      if (act > maxP) maxP = act;
    }
    var yMax = Math.ceil(maxP * 100 / 5) * 5 / 100;
    var bw = iw / 16, gw = bw * 0.68, aw = bw * 0.34;
    var s = '';

    // 網格
    for (var gi = 0; gi <= 2; gi++) {
      var val = yMax * gi / 2, y = T + ih - (val / yMax) * ih;
      s += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) +
        '" stroke="#20593C" stroke-width="1" opacity="' + (gi === 0 ? '.9' : '.4') + '"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#8FA396">' +
        (val * 100).toFixed(0) + '%</text>';
    }
    // 長條
    for (t = 3; t <= 18; t++) {
      var idx = t - 3, cx = L + idx * bw + bw / 2;
      var pTh = WAYS[t] / 216;
      var cnt = st.dist[t] || 0, pAc = rounds ? cnt / rounds : 0;
      var hTh = (pTh / yMax) * ih, hAc = (pAc / yMax) * ih;
      s += '<g><title>' + t + ' 點　理論 ' + pct(pTh) + '　實際 ' + (rounds ? pct(pAc) + '（' + cnt + ' 次）' : '尚無資料') + '</title>';
      s += '<rect x="' + (cx - gw / 2).toFixed(1) + '" y="' + (T + ih - hTh).toFixed(1) + '" width="' + gw.toFixed(1) +
        '" height="' + Math.max(hTh, 0).toFixed(1) + '" rx="2" fill="#2F6E4C" stroke="#4B8E68" stroke-width="1"/>';
      if (hAc > 0) {
        s += '<rect x="' + (cx - aw / 2).toFixed(1) + '" y="' + (T + ih - hAc).toFixed(1) + '" width="' + aw.toFixed(1) +
          '" height="' + hAc.toFixed(1) + '" rx="2" fill="#D2A24E"/>';
      }
      s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + ih +
        '" fill="transparent"/></g>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (H - B + 14) + '" text-anchor="middle" font-size="9" fill="' +
        (t >= 11 && t <= 17 ? '#EF7E6F' : t >= 4 && t <= 10 ? '#4C9BD6' : '#8FA396') + '">' + t + '</text>';
    }
    s += '<text x="' + (L + iw / 2) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="9" fill="#8FA396">三顆骰子總點數</text>';
    svg.innerHTML = s;
  }

  /* --------- 賠率表 --------- */
  function buildOddsTable() {
    var pick = ['big', 'small', 'odd', 'even', 'combo12', 'single1', 'total7', 'total8', 'total10',
      'total9', 'total6', 'total5', 'total4', 'anytriple', 'double1', 'triple1'];
    var NAME = {
      big: '大（11–17）', small: '小（4–10）', odd: '單', even: '雙', combo12: '二骰組合（任一組）',
      single1: '單骰（任一點）', total7: '點數 7 或 14', total8: '點數 8 或 13', total10: '點數 10 或 11',
      total9: '點數 9 或 12', total6: '點數 6 或 15', total5: '點數 5 或 16', total4: '點數 4 或 17',
      anytriple: '全圍（任意三同點）', double1: '長骰（指定對子）', triple1: '圍骰（指定三同點）'
    };
    var rows = pick.map(function (id) { return BY_ID[id]; });
    rows.sort(function (x, y) { return x.he - y.he; });
    var maxHe = 0.19;
    $('oddsTable').querySelector('tbody').innerHTML = rows.map(function (bt) {
      var cls = bt.he < 0.05 ? ' good' : bt.he > 0.15 ? ' bad' : '';
      return '<tr><td style="text-align:left">' + NAME[bt.id] + '</td>' +
        '<td>' + bt.oddsText.replace(' : 1', '') + '</td>' +
        '<td>' + bt.ways + '</td>' +
        '<td>' + pct(bt.ways / 216, 1) + '</td>' +
        '<td>' + pct(bt.he) + '<span class="he-bar' + cls + '"><i style="width:' +
        Math.min(100, bt.he / maxHe * 100).toFixed(0) + '%"></i></span></td></tr>';
    }).join('');
  }

  /* --------- 快速模擬 --------- */
  function simulate(rounds) {
    var stake = totalStake();
    if (!stake) { toast('先在桌上放好注碼，再跑模擬。'); return; }
    var wag = 0, ret = 0, id, bet, m, i2, dice, best = -Infinity, worst = Infinity;
    var betIds = Object.keys(state.bets);
    for (i2 = 0; i2 < rounds; i2++) {
      dice = rollDice();
      var r = 0;
      for (var k = 0; k < betIds.length; k++) {
        id = betIds[k]; bet = BY_ID[id]; m = bet.resolve(dice);
        r += m > 0 ? state.bets[id] * (1 + m) : 0;
      }
      wag += stake; ret += r;
      var nt = r - stake;
      if (nt > best) best = nt;
      if (nt < worst) worst = nt;
    }
    var net = ret - wag, theo = evOfTable() / stake;
    var out = $('simOut');
    out.innerHTML =
      '<div class="row" style="border-color:var(--gold-dim)"><span class="r-name"><b>' + money(rounds) +
      ' 局模擬</b>（不動用你的餘額）</span><span class="r-stake">注 ' + money(stake) + '／局</span>' +
      '<span class="r-net ' + netClass(net) + '">' + signed(net) + '</span></div>' +
      '<div class="row"><span class="r-name">實際返還率</span><span class="r-stake">投注 ' + money(wag) +
      '</span><span class="r-net">' + pct(ret / wag, 1) + '</span></div>' +
      '<div class="row"><span class="r-name">理論返還率</span><span class="r-stake">莊家優勢 ' + pct(-theo) +
      '</span><span class="r-net">' + pct(1 + theo, 1) + '</span></div>' +
      '<div class="row"><span class="r-name">單局最好／最差</span><span class="r-stake"></span>' +
      '<span class="r-net"><span class="pos">' + signed(best) + '</span> / <span class="neg">' + signed(worst) + '</span></span></div>';
    toast(money(rounds) + ' 局模擬完成：' + signed(net) + '（返還 ' + pct(ret / wag, 1) + '）');
  }

  /* --------- 重置 --------- */
  function resetAll() {
    if (!window.confirm('重置牌局：餘額回到 ' + money(START) + '，統計、珠盤路全部清空。要繼續嗎？')) return;
    state.balance = START; state.bets = {}; state.stack = []; state.last = {}; state.road = [];
    state.stats = { rounds: 0, wagered: 0, returned: 0, evSum: 0, dist: {}, groups: {} };
    $('plate').classList.add('idle');
    $('totalNum').textContent = '—';
    $('verdict').textContent = '請下注'; $('verdict').dataset.v = '';
    $('roundRows').innerHTML = '<p class="empty">牌局已重置。選籌碼、點注區、開骰。</p>';
    $('simOut').innerHTML = '';
    clearMarks(); renderTable(); renderMeters(); renderRoad(); renderStats(); save();
    toast('已重置，餘額 ' + money(START) + '。');
  }

  /* --------- 分頁 --------- */
  function setupTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute('aria-selected', String(on));
          $(t.getAttribute('aria-controls')).hidden = !on;
        });
        if (tab.id === 'tab-stats') drawChart();
      });
    });
  }

  /* ---------------- 啟動 ---------------- */
  function init() {
    toastEl = $('toast');
    buildDice();
    buildLayout();
    buildTray();
    buildOddsTable();
    setupTabs();

    // 模擬結果的容器
    var simOut = document.createElement('div');
    simOut.className = 'rows'; simOut.id = 'simOut'; simOut.style.marginTop = '10px';
    $('p-stats').appendChild(simOut);

    var restored = load();
    setChip(state.chip);
    $('railLimit').textContent = '1 – ' + money(SPOT_MAX);
    $('btnSound').setAttribute('aria-pressed', String(state.sound));
    $('btnSound').textContent = '音效：' + (state.sound ? '開' : '關');

    var lastRound = state.road.length ? state.road[state.road.length - 1] : null;
    showDice(lastRound && lastRound.d ? lastRound.d : [3, 5, 6], false);
    if (lastRound && lastRound.d) showPlate(lastRound.d, lastRound.t, lastRound.k);

    if (!restored) {
      // 開場示範：先幫使用者放一注，讓期望值面板有東西可看
      state.bets.small = 10; state.balance -= 10; state.stack.push({ id: 'small', amt: 10 });
      seeded = true;
    }

    renderTable(); renderMeters(); renderRoad(); renderStats();
    if (seeded) toast('已示範放 10 在「小」— 可按「清除全部」改押。');

    $('btnRoll').addEventListener('click', roll);
    $('btnRepeat').addEventListener('click', repeatBets);
    $('btnUndo').addEventListener('click', undo);
    $('btnClear').addEventListener('click', clearBets);
    $('btnDouble').addEventListener('click', doubleBets);
    $('btnSim').addEventListener('click', function () { simulate(1000); });
    $('btnReset').addEventListener('click', resetAll);
    $('btnSound').addEventListener('click', function () {
      state.sound = !state.sound;
      this.setAttribute('aria-pressed', String(state.sound));
      this.textContent = '音效：' + (state.sound ? '開' : '關');
      if (state.sound) { ac(); tick(); }
      save();
    });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = e.key.toLowerCase();
      if (e.code === 'Space' || k === ' ') {
        if (tag === 'BUTTON') return;          // 讓焦點在按鈕上時維持原生行為
        e.preventDefault(); roll();
      } else if (k === 'r') { repeatBets(); }
      else if (k === 'z') { undo(); }
      else if (k === 'c') { clearBets(); }
      else if (k >= '1' && k <= '5') { setChip(CHIPS[Number(k) - 1].v); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
