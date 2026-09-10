/* =============================================================
   骰寶練習桌 — Sic Bo practice table
   標準賠率表；所有機率與莊家優勢皆由 216 種等機率結果算出。
   ============================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 機率模型（bets.js） ---------------- */
  var S = (typeof SicBo !== 'undefined') ? SicBo : window.SicBo;
  var WAYS = S.WAYS, BETS = S.BETS, BY_ID = S.BY_ID, GROUP_LABEL = S.GROUP_LABEL;
  var rollDice = S.rollDice, netOf = S.netOf, isTriple = S.isTriple, sum = S.sum;


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
    open: null,               // 各注區分類是否展開（手機預設只開常用的）
    tourDone: false,
    pt: 'standard',           // 使用中的賠率表
    ptCustom: null,
    quiz: null,               // 快問快答的成績紀錄
    tips: true,               // 新手提示
    stats: { rounds: 0, wagered: 0, returned: 0, evSum: 0, dist: {}, groups: {}, rS: 0, rS2: 0 }
  };
  var rolling = false;

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        balance: state.balance, chip: state.chip, last: state.last,
        road: state.road.slice(-60), sound: state.sound, stats: state.stats,
        open: state.open, tourDone: state.tourDone,
        pt: state.pt, ptCustom: state.ptCustom, quiz: state.quiz, tips: state.tips
      }));
    } catch (e) { /* 私密瀏覽或封鎖儲存時忽略 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE); if (!raw) return false;
      var o = JSON.parse(raw); if (!o || typeof o.balance !== 'number') return false;
      state.balance = o.balance; state.chip = o.chip || 25; state.last = o.last || {};
      state.road = o.road || []; state.sound = !!o.sound;
      state.open = o.open || null; state.tourDone = !!o.tourDone;
      state.pt = o.pt || 'standard'; state.ptCustom = o.ptCustom || null;
      state.quiz = o.quiz || null;
      state.tips = o.tips !== false;        // 舊存檔沒有這個欄位時預設開啟
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
  function buzz(pattern) {
    if (reduced) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 不支援就算了 */ }
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
  var bandEls = {};
  function band(key, title, odds, hint, gridCls) {
    var sec = document.createElement('section'); sec.className = 'band';
    var head = document.createElement('button'); head.type = 'button'; head.className = 'band-head';
    head.innerHTML = '<span class="chev" aria-hidden="true">▶</span><h3>' + title + '</h3>' +
      (odds ? '<span class="odds">' + odds + '</span>' : '') +
      '<span class="count" id="count-' + key + '"></span>' +
      (hint ? '<span class="hint">' + hint + '</span>' : '');
    var grid = document.createElement('div'); grid.className = 'grid ' + gridCls;
    grid.id = 'band-' + key;
    head.setAttribute('aria-controls', grid.id);
    head.addEventListener('click', function () { toggleBand(key); });
    sec.appendChild(head); sec.appendChild(grid);
    bandEls[key] = { sec: sec, head: head, grid: grid };
    return { sec: sec, grid: grid };
  }
  function applyBands() {
    for (var k in bandEls) {
      var on = !!state.open[k];
      bandEls[k].sec.classList.toggle('collapsed', !on);
      bandEls[k].head.setAttribute('aria-expanded', String(on));
    }
  }
  function toggleBand(key) {
    state.open[key] = !state.open[key];
    applyBands(); save();
  }
  function openBand(key) {
    if (!state.open[key]) { state.open[key] = true; applyBands(); save(); }
  }
  function buildLayout() {
    var root = $('layout'), k;

    var b1 = band('triple', '圍骰', '', '三顆同點', 'g-triples');
    for (k = 1; k <= 6; k++) {
      b1.grid.appendChild(makeCell(BY_ID['triple' + k], mini(k) + mini(k) + mini(k), 'tall'));
    }
    b1.grid.appendChild(makeCell(BY_ID.anytriple, '', 'tall'));
    root.appendChild(b1.sec);

    var b2 = band('main', '大 · 小 · 單 · 雙', '賠 1 : 1', '開圍骰通殺', 'g-main');
    ['small', 'odd', 'even', 'big'].forEach(function (id) { b2.grid.appendChild(makeCell(BY_ID[id], '', 'main tall')); });
    root.appendChild(b2.sec);

    var b3 = band('double', '長骰（對子）', '賠 10 : 1', '指定點數至少出現兩次', 'g-doubles');
    for (k = 1; k <= 6; k++) b3.grid.appendChild(makeCell(BY_ID['double' + k], mini(k) + mini(k)));
    root.appendChild(b3.sec);

    var b4 = band('total', '點數總和', '', '賠率印在格內', 'g-totals');
    for (k = 4; k <= 17; k++) b4.grid.appendChild(makeCell(BY_ID['total' + k], '', 'num-cell'));
    root.appendChild(b4.sec);

    var b5 = band('combo', '二骰組合', '賠 6 : 1', '兩個不同點數各至少一顆', 'g-combos');
    BETS.forEach(function (bet) {
      if (bet.group === 'combo') b5.grid.appendChild(makeCell(bet, mini(bet.dice[0]) + mini(bet.dice[1])));
    });
    root.appendChild(b5.sec);

    var b6 = band('single', '單骰', '中 1 / 2 / 3 顆　賠 1 / 2 / 3', '', 'g-singles');
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
    tick(); buzz(10); renderTable(); renderMeters(); save();
    maybeTip(id);
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

  function roll() {
    if (rolling) return Promise.resolve();
    var stake = totalStake();
    if (!stake) { toast('請先下注：選籌碼後點桌面注區。'); return Promise.resolve(); }
    rolling = true; setBusy(true);
    var dice = rollDice();

    var dome = $('dome');
    if (reduced) {
      showDice(dice, false); settle(dice, stake);
      return Promise.resolve();
    }
    rattle(); buzz([16, 60, 16, 60, 22]);
    dome.classList.remove('shaking');
    void dome.offsetWidth;
    dome.classList.add('shaking');
    return wait(620).then(function () {
      dome.classList.remove('shaking');
      showDice(dice, true);
      return wait(950);
    }).then(function () { settle(dice, stake); });
  }

  function settle(dice, stake) {
    var st = state.stats, id, bet, m, ret, rows = [], returned = 0, evRound = 0;

    for (id in state.bets) {
      bet = BY_ID[id]; m = netOf(bet, dice);
      ret = m > 0 ? state.bets[id] * (1 + m) : 0;
      returned += ret; evRound += state.bets[id] * bet.ev;
      rows.push({ id: id, label: bet.label, group: bet.group, stake: state.bets[id], net: ret - state.bets[id], won: m > 0, mult: m });
      var g = st.groups[bet.group] || (st.groups[bet.group] = { n: 0, wagered: 0, net: 0 });
      g.n++; g.wagered += state.bets[id]; g.net += ret - state.bets[id];
    }

    state.balance += returned;
    st.rounds++; st.wagered += stake; st.returned += returned; st.evSum += evRound;
    var ratio = returned / stake;                  // 這一局每一元本金拿回多少
    st.rS = (st.rS || 0) + ratio; st.rS2 = (st.rS2 || 0) + ratio * ratio;
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
      var hit = bt.win(dice) ? true : false;
      var el = cellEls[bt.id];
      if (hit) el.classList.add(state.bets[bt.id] ? 'win' : 'hit');
      else if (state.bets[bt.id]) el.classList.add('lost');
    });

    state.bets = {}; state.stack = [];
    renderResult(dice, tot, kind, rows, stake, returned, net);
    renderTable(); renderMeters(); renderRoad(); renderStats(); showSheet(dice, tot, kind, net); save();
    chime(net >= 0); buzz(net > 0 ? [22, 50, 22] : 14);
    speak(kind === 'triple' ? ('圍骰，' + dice[0] + '點') : (tot + '點，' + (kind === 'big' ? '大' : '小')));
    if (net > 0) toast('本局 ' + signed(net) + '　派彩 ' + money(returned));
    else if (net < 0) toast('本局 ' + signed(net));
    if (state.balance <= 0 && !totalStake()) toast('籌碼用完了 — 到「統計」分頁按「重置牌局」再來一輪。');

    rolling = false; setBusy(false);
  }

  var sheetTimer = null;
  function showSheet(dice, tot, kind, net) {
    var el = $('sheet');
    // 停在工具列正上方（工具列高度會隨機型與安全區改變）
    el.style.bottom = ($('dock').offsetHeight + 10) + 'px';
    $('sheetDice').innerHTML = dice.map(function (v) { return mini(v, 'lg'); }).join('');
    $('sheetTotal').textContent = tot;
    var LABEL = { big: '大', small: '小', triple: '圍骰' };
    $('sheetVerdict').textContent = kind === 'triple'
      ? '圍骰 ' + dice[0] + '，大小單雙通殺'
      : LABEL[kind] + ' · ' + (tot % 2 === 1 ? '單' : '雙') + ' · ' + dice.join('+');
    var n = $('sheetNet');
    n.textContent = signed(net);
    n.className = 'sheet-net num ' + netClass(net);
    el.hidden = false;
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(hideSheet, 4200);
  }
  function hideSheet() { clearTimeout(sheetTimer); $('sheet').hidden = true; }

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
    renderBandCounts();
  }

  /* 收合起來的分類若藏著注碼，在標題上標出金額，才不會忘記 */
  function renderBandCounts() {
    var per = {};
    for (var id in state.bets) {
      var g = BY_ID[id].group;
      per[g] = (per[g] || 0) + state.bets[id];
    }
    for (var k in bandEls) {
      var badge = bandEls[k].head.querySelector('.count');
      if (per[k]) { badge.textContent = money(per[k]); badge.classList.add('on'); }
      else { badge.textContent = ''; badge.classList.remove('on'); }
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
    var ci = $('sRtpCi');
    if (st.rounds >= 2) {
      var mean = st.rS / st.rounds;
      var vr = (st.rS2 - st.rounds * mean * mean) / (st.rounds - 1);
      var se = Math.sqrt(Math.max(vr, 0) / st.rounds);
      ci.textContent = '95% 約 ±' + pct(1.96 * se, 1) + '，' + money(st.rounds) + ' 局';
    } else ci.textContent = '派彩 ÷ 投注';
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
    var rows = S.KINDS.slice().sort(function (x, y) { return BY_ID[x.id].he - BY_ID[y.id].he; });
    var maxHe = 0.19;
    $('oddsTable').querySelector('tbody').innerHTML = rows.map(function (kind) {
      var bt = BY_ID[kind.id];
      var cls = bt.he < 0.05 ? ' good' : bt.he > 0.15 ? ' bad' : '';
      return '<tr><td style="text-align:left">' + kind.name + '</td>' +
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
        id = betIds[k]; bet = BY_ID[id]; m = netOf(bet, dice);
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
    state.stats = { rounds: 0, wagered: 0, returned: 0, evSum: 0, dist: {}, groups: {}, rS: 0, rS2: 0 };
    $('plate').classList.add('idle');
    $('totalNum').textContent = '—';
    $('verdict').textContent = '請下注'; $('verdict').dataset.v = '';
    $('roundRows').innerHTML = '<p class="empty">牌局已重置。選籌碼、點注區、開骰。</p>';
    $('simOut').innerHTML = '';
    clearMarks(); renderTable(); renderMeters(); renderRoad(); renderStats(); save();
    toast('已重置，餘額 ' + money(START) + '。');
  }



  /* --------- 賠率表：切換與自訂 --------- */
  var PT_ROWS = [
    { k: 'anytriple', label: '全圍', hint: '常見 24–31', sec: '高賠注區' },
    { k: 'triple', label: '圍骰（指定三同點）', hint: '常見 150–180' },
    { k: 'double', label: '長骰（指定對子）', hint: '常見 8–11' },
    { k: 'combo', label: '二骰組合', hint: '常見 5–6' },
    { k: 't4', label: '點數 4 / 17', pair: [4, 17], sec: '點數總和' },
    { k: 't5', label: '點數 5 / 16', pair: [5, 16] },
    { k: 't6', label: '點數 6 / 15', pair: [6, 15] },
    { k: 't7', label: '點數 7 / 14', pair: [7, 14] },
    { k: 't8', label: '點數 8 / 13', pair: [8, 13] },
    { k: 't9', label: '點數 9 / 12', pair: [9, 12] },
    { k: 't10', label: '點數 10 / 11', pair: [10, 11] }
  ];

  function paytableById(id) {
    if (id === 'custom') return state.ptCustom || (state.ptCustom = S.clonePaytable(S.STANDARD));
    for (var i2 = 0; i2 < S.PAYTABLES.length; i2++) if (S.PAYTABLES[i2].id === id) return S.clonePaytable(S.PAYTABLES[i2]);
    return S.clonePaytable(S.STANDARD);
  }

  function setPaytable(id, skipSave) {
    state.pt = id;
    S.applyPaytable(paytableById(id));
    Array.prototype.forEach.call($('ptPick').children, function (el) {
      el.setAttribute('aria-pressed', String(el.dataset.pt === id));
    });
    var pt = S.currentPaytable();
    $('ptNote').textContent = id === 'custom'
      ? '照你面前那張桌子印的賠率填進去，機率與莊家優勢會即時重算。單骰的 1／2／3 倍各家都一樣，所以固定不動。'
      : pt.note;
    $('ptEditor').hidden = id !== 'custom';
    if (id === 'custom') buildPtEditor();
    refreshOdds();
    if (!skipSave) save();
  }

  function buildPtEditor() {
    var pt = S.currentPaytable(), box = $('ptEditor');
    box.innerHTML = PT_ROWS.map(function (r) {
      var val = r.pair ? pt.totals[r.pair[0]] : pt[r.k];
      return (r.sec ? '<div class="sec">' + r.sec + '</div>' : '') +
        '<label class="f"><span>' + r.label + '</span>' +
        '<em>' + (r.hint || '') + '</em>' +
        '<input type="number" min="1" max="1000" step="1" value="' + val + '" data-pt-row="' + r.k +
        '" inputmode="numeric"></label>';
    }).join('') + '<button class="btn sm pt-reset" type="button" id="ptReset">還原成標準賠率</button>';
    box.oninput = onPtInput;   // 重建時直接覆寫，不會疊監聽器
    $('ptReset').onclick = function () {
      state.ptCustom = S.clonePaytable(S.STANDARD);
      S.applyPaytable(state.ptCustom);
      buildPtEditor(); refreshOdds(); save();
      toast('自訂賠率已還原成標準賠率。');
    };
  }

  function onPtInput(e) {
    var key = e.target.getAttribute && e.target.getAttribute('data-pt-row');
    if (!key) return;
    var v = Math.max(1, Math.min(1000, Math.round(Number(e.target.value) || 1)));
    var pt = state.ptCustom, row = null;
    for (var i2 = 0; i2 < PT_ROWS.length; i2++) if (PT_ROWS[i2].k === key) row = PT_ROWS[i2];
    if (!row) return;
    if (row.pair) { pt.totals[row.pair[0]] = v; pt.totals[row.pair[1]] = v; }
    else pt[row.k] = v;
    S.applyPaytable(pt);
    refreshOdds();
    save();
  }

  /* 賠率變了：檯面印刷、賠率表、教學卡片、期望值全部重畫 */
  function refreshOdds() {
    for (var id in cellEls) {
      var bt = BY_ID[id], el = cellEls[id];
      var o = el.querySelector('.odds');
      if (o) o.textContent = bt.oddsText;
      el.title = bt.label + ' · 賠 ' + bt.oddsText + ' · 中獎組合 ' + bt.ways + '/216（' + pct(bt.ways / 216) +
        '）· 莊家優勢 ' + pct(bt.he);
      el.setAttribute('aria-label', bt.label + '，賠 ' + bt.oddsText + '，莊家優勢 ' + pct(bt.he));
    }
    buildOddsTable();
    buildLearn();
    renderMeters();
  }

  /* --------- 投注系統實驗室 --------- */
  var SYSTEMS = [
    { id: 'flat', name: '平注', note: '每局都押一樣' },
    { id: 'martingale', name: '馬丁格爾', note: '輸了加倍，贏了歸零' },
    { id: 'paroli', name: '反馬丁格爾', note: '贏了加倍，連贏三把歸零' },
    { id: 'dalembert', name: '達倫貝爾', note: '輸加一注，贏減一注' }
  ];

  function simSession(sysId, o, roll, betObj) {
    var bank = o.bank, cur = o.unit, streak = 0, wagered = 0, maxBet = 0, busted = false, r;
    for (r = 0; r < o.rounds; r++) {
      var stake = Math.min(cur, o.limit, bank);
      if (stake < 1) { busted = true; break; }
      if (stake > maxBet) maxBet = stake;
      wagered += stake;
      var won = !!betObj.win(roll());
      bank += won ? stake : -stake;
      if (sysId === 'flat') cur = o.unit;
      else if (sysId === 'martingale') cur = won ? o.unit : cur * 2;
      else if (sysId === 'paroli') {
        if (won) { streak++; cur = streak >= 3 ? (streak = 0, o.unit) : cur * 2; }
        else { streak = 0; cur = o.unit; }
      } else if (sysId === 'dalembert') cur = won ? Math.max(o.unit, cur - o.unit) : cur + o.unit;
      if (bank < 1) { busted = true; break; }
    }
    return { bank: bank, wagered: wagered, maxBet: maxBet, busted: busted };
  }

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  var labResults = null, labPick = 'flat';

  function runLab() {
    var o = {
      betId: $('labBet').value,
      bank: clampNum($('labBank'), 10, 1000000, 1000),
      unit: clampNum($('labUnit'), 1, 10000, 25),
      rounds: clampNum($('labRounds'), 10, 2000, 200),
      sessions: clampNum($('labSessions'), 100, 20000, 2000),
      limit: clampNum($('labLimit'), 1, 1000000, 1000)
    };
    if (o.unit > o.bank) { toast('基礎注碼不能大於起始本金。'); return; }
    var betObj = BY_ID[o.betId];
    var seed = 0;
    try { seed = crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { seed = Date.now(); }

    $('btnLab').disabled = true; $('btnLab').textContent = '模擬中…';
    setTimeout(function () {
      var out = SYSTEMS.map(function (sys, si) {
        var roll = S.makeDiceRoller(S.makeRng(seed + si * 7919));
        var banks = [], bust = 0, wag = 0, mx = 0, net = 0;
        for (var s = 0; s < o.sessions; s++) {
          var res = simSession(sys.id, o, roll, betObj);
          banks.push(res.bank); wag += res.wagered; net += res.bank - o.bank;
          if (res.busted) bust++;
          if (res.maxBet > mx) mx = res.maxBet;
        }
        return {
          sys: sys, banks: banks, bustRate: bust / o.sessions,
          med: median(banks), mean: banks.reduce(function (a2, b2) { return a2 + b2; }, 0) / o.sessions,
          wagered: wag / o.sessions, maxBet: mx, edge: wag ? net / wag : 0,
          up: banks.filter(function (v) { return v > o.bank; }).length / o.sessions
        };
      });
      labResults = { o: o, rows: out, bet: betObj };
      labPick = 'flat';
      renderLab();
      $('btnLab').disabled = false; $('btnLab').textContent = '再跑一次';
    }, 30);
  }

  function clampNum(el, lo, hi, dflt) {
    var v = Math.round(Number(el.value));
    if (!isFinite(v)) v = dflt;
    v = Math.max(lo, Math.min(hi, v));
    el.value = v;
    return v;
  }

  function renderLab() {
    var R = labResults; if (!R) return;
    var o = R.o;
    var rows = R.rows.map(function (r) {
      return '<tr data-sys="' + r.sys.id + '"' + (r.sys.id === labPick ? ' class="on"' : '') + '>' +
        '<td>' + r.sys.name + '</td>' +
        '<td class="' + (r.bustRate > 0.02 ? 'neg' : '') + '">' + pct(r.bustRate, 1) + '</td>' +
        '<td>' + money(r.med) + '</td>' +
        '<td class="' + netClass(r.edge) + '">' + pct(r.edge) + '</td>' +
        '<td>' + money(r.maxBet) + '</td></tr>';
    }).join('');

    var flat = R.rows[0], mart = R.rows[1];
    var take = '四種系統的「損益 ÷ 總投注」全部落在 <b>' + pct(-R.bet.he) +
      '</b> 附近——那就是「' + R.bet.label + '」的莊家優勢，<b>沒有任何一種下注法動得了它</b>。' +
      '會變的只有分佈：馬丁格爾在 ' + money(o.rounds) + ' 局內破產的機率是 <b>' + pct(mart.bustRate, 1) +
      '</b>，平注只有 ' + pct(flat.bustRate, 1) + '。';
    take += mart.up > flat.up
      ? '它換到的是比較常小贏：' + pct(mart.up, 1) + ' 的場次收在起始本金之上（平注 ' + pct(flat.up, 1) +
        '）——但那些小贏，會被歸零的那幾場一次收回去。'
      : '而在這組參數下，它連「比較常贏」都做不到：收在起始本金之上的場次只有 ' + pct(mart.up, 1) +
        '，平注是 ' + pct(flat.up, 1) + '。把「每場局數」調短一點再跑，就會看到它短期好看的那一面。';
    take += '<br><span class="lab-cap">「損益/投注」欄會有些許抖動：進階系統的投注額被少數幾筆大注主導，' +
      '把「模擬場次」拉高就會更貼近理論值。</span>';

    $('labOut').innerHTML =
      '<div class="scroll" style="max-height:none;overflow-x:auto"><table class="lab-table" id="labTable">' +
      '<thead><tr><th>系統</th><th>破產率</th><th>中位數本金</th><th>損益/投注</th><th>最大單注</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="lab-cap">' + money(o.sessions) + ' 場 × 每場最多 ' + money(o.rounds) + ' 局，押「' + R.bet.label +
      '」，起始 ' + money(o.bank) + '、基礎注碼 ' + money(o.unit) + '、限紅 ' + money(o.limit) +
      '。破產＝本金不足以再下一注；系統要求的注碼超過限紅或剩餘本金時，就押到上限／全押。' +
      '點表格任一列可切換下方分佈圖。</p>' +
      '<h2 style="margin:4px 0 6px">結束本金分佈</h2>' +
      '<div class="chart-legend"><span><i style="background:#D2A24E"></i>' +
      SYSTEMS.filter(function (s) { return s.id === labPick; })[0].name +
      '</span><span><i style="background:#D9483C"></i>破產</span>' +
      '<span style="color:var(--bone-3)">虛線＝起始本金</span></div>' +
      '<div class="chart-wrap"><svg class="chart" id="labChart" viewBox="0 0 360 168" role="img" ' +
      'aria-label="結束本金分佈"></svg></div>' +
      '<div class="lab-take">' + take + '</div>';

    $('labTable').addEventListener('click', function (e) {
      var tr = e.target.closest && e.target.closest('tr[data-sys]');
      if (!tr) return;
      labPick = tr.dataset.sys; renderLab();
    });
    drawLabChart();
  }

  function drawLabChart() {
    var R = labResults; if (!R) return;
    var row = R.rows.filter(function (r) { return r.sys.id === labPick; })[0];
    var banks = row.banks, start = R.o.bank;
    var W = 360, H = 168, L = 34, Rp = 8, T = 10, B = 30;
    var iw = W - L - Rp, ih = H - T - B;

    var mx = 0;
    for (var i2 = 0; i2 < banks.length; i2++) if (banks[i2] > mx) mx = banks[i2];
    var top = Math.max(mx, start * 2), N = 16, w = top / N;
    var bins = new Array(N + 1).fill(0);          // bins[0] = 破產（<1）
    for (i2 = 0; i2 < banks.length; i2++) {
      var v = banks[i2];
      if (v < 1) { bins[0]++; continue; }
      var b2 = Math.min(N, Math.floor(v / w) + 1);
      bins[b2]++;
    }
    var maxCount = Math.max.apply(null, bins) || 1;
    var bw = iw / (N + 1), s = '';

    for (var g = 0; g <= 2; g++) {
      var val = maxCount * g / 2, y = T + ih - (val / maxCount) * ih;
      s += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - Rp) + '" y2="' + y.toFixed(1) +
        '" stroke="#20593C" stroke-width="1" opacity="' + (g === 0 ? '.9' : '.4') + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#8FA396">' +
        pct(val / banks.length, 0) + '</text>';
    }
    for (var k2 = 0; k2 <= N; k2++) {
      var h2 = (bins[k2] / maxCount) * ih, x = L + k2 * bw;
      var lo = k2 === 0 ? 0 : Math.round((k2 - 1) * w), hi = k2 === 0 ? 0 : Math.round(k2 * w);
      s += '<g><title>' + (k2 === 0 ? '破產（本金歸零）' : money(lo) + ' – ' + money(hi)) + '：' +
        pct(bins[k2] / banks.length, 1) + '（' + bins[k2] + ' 場）</title>' +
        '<rect x="' + (x + bw * 0.14).toFixed(1) + '" y="' + (T + ih - h2).toFixed(1) + '" width="' +
        (bw * 0.72).toFixed(1) + '" height="' + Math.max(h2, 0).toFixed(1) + '" rx="2" fill="' +
        (k2 === 0 ? '#D9483C' : '#D2A24E') + '"/>' +
        '<rect x="' + x.toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + ih +
        '" fill="transparent"/></g>';
    }
    var sx = L + bw + (start / top) * (iw - bw);
    s += '<line x1="' + sx.toFixed(1) + '" y1="' + T + '" x2="' + sx.toFixed(1) + '" y2="' + (T + ih) +
      '" stroke="#B9C6BB" stroke-width="1" stroke-dasharray="3 3"/>';
    s += '<text x="' + L + '" y="' + (H - 4) + '" text-anchor="start" font-size="9" fill="#D9483C">破產</text>';
    s += '<text x="' + (W - Rp) + '" y="' + (H - 4) + '" text-anchor="end" font-size="9" fill="#8FA396">結束本金 →</text>';
    $('labChart').innerHTML = s;
  }

  /* --------- 語音報點 --------- */
  function speak(text) {
    if (!state.sound || typeof speechSynthesis === 'undefined') return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW'; u.rate = 1.05;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* 不支援就算了 */ }
  }



  /* 注區的完整顯示名稱：檯面上「9」就夠了，但講到期望值時要說「點數 9」。 */
  function betName(bet) {
    if (bet.group === 'total') return '點數 ' + bet.label;
    if (bet.group === 'double') return '長骰 ' + bet.label.slice(2);
    if (bet.group === 'triple' && bet.id !== 'anytriple') return '圍骰 ' + bet.label.slice(2);
    return bet.label;
  }

  /* --------- 一晚要花多少 --------- */
  function buildCostBet() {
    $('costBet').innerHTML = S.KINDS.map(function (k) {
      return '<option value="' + k.id + '">' + k.short + '</option>';
    }).join('');
    $('costBet').value = 'big';
  }

  function runCost() {
    var betId = $('costBet').value;
    var stake = clampNum($('costStake'), 1, 100000, 100);
    var rate = clampNum($('costRate'), 5, 200, 40);
    var hours = clampNum($('costHours'), 1, 24, 4);
    var bank = clampNum($('costBank'), 10, 10000000, 10000);
    var rounds = rate * hours;
    var seed = 0;
    try { seed = crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { seed = Date.now(); }

    var o = S.outlook({ betId: betId, stake: stake, rounds: rounds, bankroll: bank, sessions: 4000, seed: seed });
    var bet = BY_ID[betId];
    var cost = -o.mean, perHour = cost / hours;

    var rows =
      row('總投注額', money(o.wagered), '') +
      row('九成的情況落在', signed(o.p05) + ' ～ ' + signed(o.p95), '') +
      row('中位數（最典型的結果）', signed(o.p50), netClass(o.p50)) +
      row('收在正的機率', pct(o.aheadRate, 1), '') +
      row('帶的錢撐不完 ' + hours + ' 小時的機率', pct(o.bustRate, 1), o.bustRate > 0.15 ? 'neg' : '');

    var note = '把它當<b>門票錢</b>：' + money(cost) + ' 買 ' + hours + ' 小時，等於每小時約 ' +
      money(perHour) + '。玩完就走，那一晚就是划算的。';

    if (bet.he > BY_ID.big.he + 1e-9) {
      var better = S.outlook({ betId: 'big', stake: stake, rounds: rounds, bankroll: bank, sessions: 1000, seed: seed });
      note += '<br><br>同樣的時間與注碼，改押<b>「大」或「小」</b>，期望成本會從 ' + money(cost) +
        ' 降到 <b>' + money(-better.mean) + '</b>——什麼都不用改，只是換一格押。';
    }
    if (o.bustRate > 0.2) {
      note += '<br><br>另外：你帶的 ' + money(bank) + ' 有 <b>' + pct(o.bustRate, 0) +
        '</b> 的機率撐不完，會提早結束。想玩滿就得多帶，或把每注調小。';
    }

    $('costOut').innerHTML =
      '<div class="cost-hero"><div class="k">這一晚的期望成本</div>' +
      '<div class="v">−' + money(cost) + '</div>' +
      '<div class="s">押「' + betName(bet) + '」，' + hours + ' 小時 × 每小時 ' + rate + ' 局 ＝ <b>' +
      money(rounds) + ' 局</b>，每注 ' + money(stake) + '</div></div>' +
      '<div class="cost-rows">' + rows + '</div>' +
      '<div class="cost-note">' + note + '</div>';

    function row(k, v, cls) {
      return '<div class="cost-row"><span class="k">' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>';
    }
  }

  /* --------- 新手提示 --------- */
  var tipShown = {};
  function maybeTip(id) {
    if (!state.tips) return;
    var bet = BY_ID[id];
    if (bet.he <= 0.05) return;                       // 大小單雙、二骰組合就別囉嗦了
    var key = bet.group + ':' + bet.he.toFixed(4);
    if (tipShown[key]) return;                        // 同一種注區一輪提醒一次就好
    tipShown[key] = 1;
    toast(betName(bet) + '：莊家優勢 ' + pct(bet.he) + '，同桌的大／小只有 ' + pct(BY_ID.big.he) + '。');
  }

  /* --------- 賠率快問快答 --------- */
  var QZ_LEN = 10;
  var quiz = null, quizDom = null;

  function buildQuizDom() {
    var el = document.createElement('div');
    el.className = 'quiz'; el.id = 'quiz'; el.hidden = true;
    el.innerHTML = '<div class="quiz-card" id="quizCard" role="dialog" aria-modal="true" aria-label="賠率快問快答"></div>';
    document.body.appendChild(el);
    quizDom = el;
    el.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-qz]');
      if (!a) return;
      var act = a.getAttribute('data-qz');
      if (act === 'close') closeQuiz();
      else if (act === 'next') stepQuiz();
      else if (act === 'again') startQuiz();
      else answerQuiz(Number(act));
    });
  }

  function startQuiz() {
    if (typeof SicBoQuiz === 'undefined') { toast('快問快答載入失敗。'); return; }
    hideSheet();
    quiz = {
      qs: SicBoQuiz.make().round(QZ_LEN),
      i: 0, answered: null, score: 0, marks: [],
      per: { better: { ok: 0, n: 0 }, payout: { ok: 0, n: 0 }, hit: { ok: 0, n: 0 } }
    };
    quizDom.hidden = false;
    renderQuiz();
  }
  function closeQuiz() { quizDom.hidden = true; quiz = null; }
  function stepQuiz() { if (!quiz) return; quiz.i++; quiz.answered = null; renderQuiz(); }

  function answerQuiz(idx) {
    if (!quiz || quiz.answered !== null || !quiz.qs[quiz.i]) return;
    var q = quiz.qs[quiz.i], ok = !!q.options[idx].correct;
    quiz.answered = idx;
    quiz.marks[quiz.i] = ok;
    quiz.per[q.type].n++;
    if (ok) { quiz.score++; quiz.per[q.type].ok++; }
    tick(); buzz(ok ? 12 : [10, 40, 10]);
    renderQuiz();
    if (quiz.i === QZ_LEN - 1) finishQuiz();
  }

  function finishQuiz() {
    var s = state.quiz || (state.quiz = { best: 0, rounds: 0, ok: 0, n: 0 });
    s.rounds++; s.ok += quiz.score; s.n += QZ_LEN;
    if (quiz.score > s.best) s.best = quiz.score;
    save();
  }

  var QZ_TYPE_NAME = { better: '挑注區', payout: '記賠率', hit: '判輸贏' };

  function renderQuiz() {
    if (!quiz) return;
    var card = $('quizCard');
    var best = (state.quiz && state.quiz.best) || 0;

    if (quiz.i >= QZ_LEN) { card.innerHTML = quizEndHTML(best); return; }

    var q = quiz.qs[quiz.i], done = quiz.answered !== null;
    var head = '<div class="quiz-head"><h3>賠率快問快答</h3>' +
      '<span class="n">第 ' + (quiz.i + 1) + ' / ' + QZ_LEN + ' 題' +
      (best ? '　最佳 ' + best + '/' + QZ_LEN : '') + '</span>' +
      '<button class="quiz-x" type="button" data-qz="close" aria-label="關閉">×</button></div>';

    var dots = '<div class="quiz-dots">' + quiz.qs.map(function (_, k) {
      var cls = k < quiz.i || (k === quiz.i && done) ? (quiz.marks[k] ? 'ok' : 'no') : (k === quiz.i ? 'now' : '');
      return '<i class="' + cls + '"></i>';
    }).join('') + '</div>';

    var art = q.dice
      ? '<div class="quiz-dice">' + q.dice.map(function (v) { return mini(v, 'lg'); }).join('') +
        '<span class="tot">共 ' + q.total + ' 點</span></div>'
      : '';

    var opts = '<div class="quiz-opts">' + q.options.map(function (o, k) {
      var cls = '', mark = '';
      if (done) {
        if (o.correct) { cls = ' right'; mark = '✔'; }
        else if (k === quiz.answered) { cls = ' wrong'; mark = '✕'; }
        else cls = ' faded';
      }
      return '<button class="quiz-opt' + cls + '" type="button" data-qz="' + k + '"' + (done ? ' disabled' : '') + '>' +
        '<span class="t">' + o.label + '</span>' +
        (o.sub ? '<span class="s">' + o.sub + '</span>' : '') +
        '<span class="mark">' + mark + '</span></button>';
    }).join('') + '</div>';

    var fb = '';
    if (done) {
      var right = quiz.marks[quiz.i];
      fb = '<div class="quiz-fb ' + (right ? 'ok' : 'no') + '"><span class="v">' +
        (right ? '答對了' : '答錯了') + '</span>' + q.explain + '</div>' +
        '<button class="btn primary quiz-next" type="button" data-qz="next">' +
        (quiz.i === QZ_LEN - 1 ? '看結果' : '下一題') + '</button>';
    }

    card.innerHTML = head + dots + art +
      '<p class="quiz-q">' + q.prompt + '</p>' +
      (q.hint ? '<p class="quiz-hint">' + q.hint + '</p>' : '') + opts + fb;
  }

  function quizEndHTML(best) {
    var s = quiz.score;
    var verdict = s === QZ_LEN ? '滿分。你比檯面上多數人清楚自己在押什麼。'
      : s >= 8 ? '很穩。錯的那幾題翻一下「賠率」分頁就補起來了。'
      : s >= 5 ? '一半左右——莊家優勢的排序值得再看一次。'
      : '先去「賠率」分頁把注區依莊家優勢從低到高看一遍，再回來考。';

    var rows = Object.keys(QZ_TYPE_NAME).map(function (t) {
      var p = quiz.per[t];
      return '<div class="r"><span>' + QZ_TYPE_NAME[t] + '</span><b>' + p.ok + ' / ' + p.n + '</b></div>';
    }).join('');

    var all = state.quiz || { rounds: 0, ok: 0, n: 0 };
    return '<div class="quiz-head"><h3>賠率快問快答</h3><span class="n">第 ' + all.rounds + ' 輪</span>' +
      '<button class="quiz-x" type="button" data-qz="close" aria-label="關閉">×</button></div>' +
      '<div class="quiz-end">' +
      '<div class="quiz-score">' + s + '<small> / ' + QZ_LEN + '</small></div>' +
      '<p class="quiz-verdict">' + verdict + '</p>' +
      '<div class="quiz-break">' + rows +
      '<div class="r" style="border-top:1px solid var(--seam-soft);padding-top:6px">' +
      '<span>最佳紀錄</span><b>' + best + ' / ' + QZ_LEN + '</b></div>' +
      '<div class="r"><span>累計答對率</span><b>' + (all.n ? pct(all.ok / all.n, 0) : '—') + '</b></div>' +
      '</div>' +
      '<div class="quiz-again"><button class="btn" type="button" data-qz="close">關閉</button>' +
      '<button class="btn primary" type="button" data-qz="again">再來一輪</button></div></div>';
  }

  /* --------- 教學導覽 --------- */
  var TOUR = [
    { title: '這是骰寶練習桌',
      body: '骰寶就是荷官搖<b>三顆骰子</b>，你在搖之前押注。這個導覽會帶你走完一整局，大約四十秒。' },

    { el: '#tray', title: '① 先選籌碼',
      body: '點一個面額；之後你每點一次注區，就放上這個金額的籌碼。我先幫你選了 <b>25</b>。',
      before: function () { setChip(25); } },

    { el: '[data-bet="small"]', title: '② 押第一注：小',
      body: '總點 <b>4–10</b> 是「小」、<b>11–17</b> 是「大」，都賠 1:1。我幫你在「小」放了 25。<br>要退回一注：電腦按<b>右鍵</b>、手機<b>長按</b>那一格。',
      before: function () { openBand('main'); if (!state.bets.small) place('small'); } },

    { el: '#evMeter', title: '③ 全場最該看的一格',
      body: '「本局期望值」即時算出這組注碼<b>長期平均每局會賠掉多少</b>。押大小只有 −2.78%，是最划算的注；待會你可以改押點數 9，看它掉到 −18.98%。' },

    { el: '#btnRoll', title: '④ 開骰',
      body: '按下去荷官就搖骰。點「下一步」，我直接幫你開這一局。',
      after: function () { return roll(); } },

    { title: '⑤ 讀結果',
      dyn: function () {
        var s = $('sheet');
        return (!s.hidden && getComputedStyle(s).display !== 'none') ? '#sheet' : '#plate';
      },
      body: '三顆骰子的總點決定輸贏。<b>你押中的注區會發亮</b>；沒押到但有開出的格子會描上金邊，一眼看得出錯過了什麼。' },

    { el: '.road-wrap', title: '⑥ 珠盤路',
      body: '每局結果依序記在這裡：<b>紅大、藍小、綠圍骰</b>。提醒一句——骰子沒有記憶，路紋好看，但不能拿來預測下一局。' },

    { el: '.tabs', title: '⑦ 另外四個分頁',
      body: '<b>統計</b>：實際 vs 理論返還率，還能跑 1,000 局快速模擬。<br>' +
        '<b>實驗室</b>：把馬丁格爾這類投注系統跑幾千場，看它們到底改變了什麼。<br>' +
        '<b>賠率</b>：所有注區依莊家優勢排序，也可以改成你面前那張桌子的賠率。<br>' +
        '<b>教學</b>：完整玩法、常見迷思、練習建議。' },

    { title: '就這樣，開始玩吧',
      body: '隨時按標題列的<b>「教學導覽」</b>可以再看一次。<br>手機建議用瀏覽器選單<b>「加入主畫面」</b>裝起來，離線也能玩。' }
  ];

  var tourIdx = -1, tourDom = null;

  function buildTour() {
    var t = document.createElement('div');
    t.className = 'tour'; t.id = 'tour'; t.hidden = true;
    t.innerHTML =
      '<div class="tour-mask" id="tourMask"></div>' +
      '<div class="tour-card" id="tourCard" role="dialog" aria-modal="true" aria-labelledby="tourTitle">' +
        '<div class="tour-step" id="tourStep"></div>' +
        '<h4 id="tourTitle"></h4>' +
        '<p id="tourBody"></p>' +
        '<div class="tour-actions">' +
          '<button class="btn sm" type="button" data-tour="skip">略過</button>' +
          '<span class="spacer"></span>' +
          '<button class="btn sm" type="button" data-tour="prev">上一步</button>' +
          '<button class="btn primary sm" type="button" data-tour="next">下一步</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(t);
    tourDom = t;
    t.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-tour');
      if (a === 'skip') endTour();
      else if (a === 'prev') { if (tourIdx > 0) showStep(tourIdx - 1); }
      else if (a === 'next') nextStep();
    });
    window.addEventListener('resize', function () { if (!tourDom.hidden) positionTour(); });
  }

  function startTour() {
    hideSheet();
    if (tourDom.hidden) { tourDom.hidden = false; }
    showStep(0);
  }
  function endTour() {
    tourDom.hidden = true;
    state.tourDone = true; save();
  }
  function nextStep() {
    var s = TOUR[tourIdx], btn = tourDom.querySelector('[data-tour="next"]');
    var go = function () { if (tourIdx >= TOUR.length - 1) endTour(); else showStep(tourIdx + 1); };
    if (s && s.after) {
      btn.disabled = true; btn.textContent = '搖骰中…';
      Promise.resolve(s.after()).then(function () {
        btn.disabled = false; btn.textContent = '下一步';
        go();
      });
      return;
    }
    go();
  }

  var tourTarget = null;
  function showStep(i) {
    tourIdx = i;
    var s = TOUR[i];
    if (s.before) s.before();
    $('tourStep').textContent = (i + 1) + ' / ' + TOUR.length;
    $('tourTitle').textContent = s.title;
    $('tourBody').innerHTML = s.body;
    tourDom.querySelector('[data-tour="prev"]').hidden = i === 0;
    var next = tourDom.querySelector('[data-tour="next"]');
    next.textContent = i === TOUR.length - 1 ? '開始玩' : '下一步';
    next.disabled = false;

    var sel = s.dyn ? s.dyn() : s.el;
    tourTarget = sel ? document.querySelector(sel) : null;
    if (tourTarget && tourTarget.scrollIntoView) {
      tourTarget.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }
    positionTour();
    if (!reduced && tourTarget) setTimeout(positionTour, 420);
  }

  function positionTour() {
    var mask = $('tourMask'), card = $('tourCard');
    var vw = window.innerWidth, vh = window.innerHeight, pad = 6;
    var rect = tourTarget ? tourTarget.getBoundingClientRect() : null;

    if (!rect || (!rect.width && !rect.height)) {
      mask.classList.add('center');
      mask.style.top = (vh / 2) + 'px'; mask.style.left = (vw / 2) + 'px';
      mask.style.width = '0px'; mask.style.height = '0px';
    } else {
      mask.classList.remove('center');
      mask.style.top = (rect.top - pad) + 'px';
      mask.style.left = (rect.left - pad) + 'px';
      mask.style.width = (rect.width + pad * 2) + 'px';
      mask.style.height = (rect.height + pad * 2) + 'px';
    }

    var ch = card.offsetHeight, cw = card.offsetWidth;
    if (vw <= 860) {
      card.style.left = '10px'; card.style.right = '10px'; card.style.width = 'auto';
      if (!rect) { card.style.top = Math.max(14, (vh - ch) / 2) + 'px'; card.style.bottom = 'auto'; }
      else if (rect.top > vh * 0.42) { card.style.top = '14px'; card.style.bottom = 'auto'; }
      else { card.style.top = Math.min(vh - ch - 14, rect.bottom + 14) + 'px'; card.style.bottom = 'auto'; }
      return;
    }
    card.style.right = 'auto'; card.style.width = '';
    if (!rect) {
      card.style.top = Math.max(14, (vh - ch) / 2) + 'px';
      card.style.left = Math.max(12, (vw - cw) / 2) + 'px';
      return;
    }
    var top = rect.bottom + 14;
    if (top + ch > vh - 12) top = rect.top - ch - 14;
    card.style.top = Math.max(12, Math.min(top, vh - ch - 12)) + 'px';
    card.style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - cw / 2, vw - cw - 12)) + 'px';
  }

  /* --------- 教學分頁的注區說明（數字取自同一份定義） --------- */
  var LEARN = [
    { id: 'big', name: '大 / 小', art: [], when: '三顆總點 <b>11–17</b> 開大、<b>4–10</b> 開小。開圍骰兩邊都輸。' },
    { id: 'odd', name: '單 / 雙', art: [], when: '看總點是奇數還是偶數。一樣，開圍骰兩邊都輸。' },
    { id: 'combo12', name: '二骰組合', art: [1, 2], when: '你買的兩個不同點數<b>各至少出現一顆</b>。買「1 和 2」，開 1-2-5 就中。' },
    { id: 'single1', name: '單骰', art: [3], when: '你買的點數<b>至少出現一顆</b>；出現 1／2／3 顆分別賠 1／2／3 倍。' },
    { id: 'total7', name: '點數 4–17', art: [], when: '三顆加起來剛好等於你買的數字。<b>每個點數賠率都不同</b>：7 或 14 賠 12:1，9 或 12 只賠 6:1。' },
    { id: 'double1', name: '長骰（指定對子）', art: [4, 4], when: '你買的點數<b>至少出現兩顆</b>。開該點的圍骰也算中。' },
    { id: 'anytriple', name: '全圍', art: [], when: '開出<b>任意</b>三顆同點（1-1-1 到 6-6-6 都算）。' },
    { id: 'triple1', name: '圍骰（指定三同點）', art: [5, 5, 5], when: '開出你<b>指定</b>的那一種三同點。全場賠率最高，也最難中。' }
  ];
  function buildLearn() {
    $('learnBets').innerHTML = LEARN.map(function (o) {
      var bt = BY_ID[o.id];
      var cls = bt.he < 0.05 ? ' good' : bt.he > 0.15 ? ' bad' : '';
      var art = o.art.length ? '<span class="lb-art">' + o.art.map(function (v) { return mini(v); }).join('') + '</span>' : '<span></span>';
      return '<div class="lb">' + art + '<div><div class="lb-name">' + o.name + '</div>' +
        '<div class="lb-when">' + o.when + '</div>' +
        '<div class="lb-meta"><span>賠率 <b>' + bt.oddsText + '</b></span>' +
        '<span>機率 ' + pct(bt.ways / 216, 1) + '</span>' +
        '<span class="he' + cls + '">莊家優勢 ' + pct(bt.he) + '</span></div></div></div>';
    }).join('');
  }

  /* --------- PWA：離線、安裝、更新 --------- */
  var waitingWorker = null, installPrompt = null, updateRequested = false;
  function setupPWA() {
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); installPrompt = e; $('btnInstall').hidden = false;
    });
    window.addEventListener('appinstalled', function () {
      installPrompt = null; $('btnInstall').hidden = true; toast('已加入主畫面，離線也能玩。');
    });
    if (isIOS && !standalone) $('btnInstall').hidden = false;

    $('btnInstall').addEventListener('click', function () {
      if (installPrompt) { installPrompt.prompt(); installPrompt = null; $('btnInstall').hidden = true; return; }
      toast('Safari：分享按鈕 → 加入主畫面。');
    });
    $('btnUpdate').addEventListener('click', function () {
      updateRequested = true;
      if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      else location.reload();
    });

    // 單檔版（Artifact）沒有 manifest，也就沒有 service worker 可註冊
    if (!document.querySelector('link[rel="manifest"]')) return;
    if (!('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;

    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = nw; $('btnUpdate').hidden = false;
          }
        });
      });
    }).catch(function () { /* 離線或不支援時忽略 */ });

    // 只有在使用者按下「有新版本」時才重新整理；
    // 第一次註冊時 clients.claim() 也會觸發這個事件，那時重整只會打斷人。
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!updateRequested || reloading) return;
      reloading = true; location.reload();
    });
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

    buildLearn();
    buildTour();
    buildQuizDom();
    buildCostBet();

    var restored = load();

    // 手機螢幕短，第一次只展開最常用的兩區；桌機全開
    if (!state.open) {
      var narrow = window.innerWidth <= 860;
      state.open = { triple: !narrow, main: true, double: !narrow, total: true, combo: !narrow, single: !narrow };
    }
    applyBands();

    setPaytable(state.pt || 'standard', true);
    $('ptPick').addEventListener('click', function (e) {
      var b2 = e.target.closest && e.target.closest('.pt');
      if (b2) setPaytable(b2.dataset.pt);
    });
    $('btnLab').addEventListener('click', runLab);

    setChip(state.chip);
    $('railLimit').textContent = '1 – ' + money(SPOT_MAX);
    $('btnTips').setAttribute('aria-pressed', String(state.tips));
    $('btnTips').textContent = '提示：' + (state.tips ? '開' : '關');
    $('btnSound').setAttribute('aria-pressed', String(state.sound));
    $('btnSound').textContent = '音效：' + (state.sound ? '開' : '關');

    var lastRound = state.road.length ? state.road[state.road.length - 1] : null;
    showDice(lastRound && lastRound.d ? lastRound.d : [3, 5, 6], false);
    if (lastRound && lastRound.d) showPlate(lastRound.d, lastRound.t, lastRound.k);

    renderTable(); renderMeters(); renderRoad(); renderStats();
    setupPWA();

    // 第一次來就直接帶一次導覽
    if (!restored && !state.tourDone) setTimeout(startTour, 800);

    $('btnRoll').addEventListener('click', roll);
    $('btnRepeat').addEventListener('click', repeatBets);
    $('btnUndo').addEventListener('click', undo);
    $('btnClear').addEventListener('click', clearBets);
    $('btnDouble').addEventListener('click', doubleBets);
    $('btnSim').addEventListener('click', function () { simulate(1000); });
    $('btnReset').addEventListener('click', resetAll);
    $('btnTour').addEventListener('click', startTour);
    $('btnTour2').addEventListener('click', startTour);
    $('btnQuiz').addEventListener('click', startQuiz);
    $('btnQuiz2').addEventListener('click', startQuiz);
    $('btnCost').addEventListener('click', runCost);
    $('btnTips').addEventListener('click', function () {
      state.tips = !state.tips;
      this.setAttribute('aria-pressed', String(state.tips));
      this.textContent = '提示：' + (state.tips ? '開' : '關');
      tipShown = {};
      save();
      toast(state.tips ? '新手提示已開啟：押到高莊家優勢的注區時會提醒你。' : '新手提示已關閉。');
    });
    $('sheet').addEventListener('click', hideSheet);
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
      if (quiz && !quizDom.hidden) {
        if (e.key === 'Escape') closeQuiz();
        else if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (quiz.answered !== null || quiz.i >= QZ_LEN) stepQuiz();
        } else if (k >= '1' && k <= '4' && quiz.answered === null && quiz.qs[quiz.i]) {
          answerQuiz(Number(k) - 1);
        }
        return;
      }
      if (!tourDom.hidden) {
        if (e.key === 'Escape') endTour();
        else if (e.key === 'Enter') nextStep();
        return;
      }
      if (e.key === 'Escape') { hideSheet(); return; }
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
