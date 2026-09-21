/* =========================================================================
   半条命 3：重返黑山  ——  mobile.js
   触屏控制层：虚拟摇杆 + 拖动转视角 + 触屏按钮
   仅在有触摸能力的设备上激活；桌面端可用 ?mobile=1 强制开启来试玩
   ========================================================================= */
(function () {
  'use strict';
  var G = window.G || (window.G = {});
  var PLAT = G.PLATFORM || {};
  /* 控制层始终加载：桌面端也可以在主菜单切到触屏操作。
     是否显示由 game.js 的 applyInputMode() 决定（增删 .on 与 body.touch）。 */

  var input = null, A = null;
  var joy = { id: null, bx: 0, by: 0, r: 1, vx: 0, vy: 0, active: false };
  var look = { id: null, x: 0, y: 0, moved: 0 };
  var crouchOn = false;
  var booted = false;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* =====================================================================
     启动检测：等 game.js 准备好并且玩家点了“开始游戏”
     ===================================================================== */
  function tryBoot() {
    if (booted) return;
    if (!G.game || !G.game.input) return;
    A = G.game;
    input = A.input;
    booted = true;
    bindJoystick();
    bindLookPad();
    bindButtons();
    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', function () { setTimeout(updateLayout, 250); });
    console.log('[HL3] 触屏控制层已启用');
  }

  /* =====================================================================
     虚拟摇杆
     ===================================================================== */
  function bindJoystick() {
    var base = $('joyBase'), knob = $('joyKnob');
    if (!base || !knob) return;

    function place() {
      var r = base.getBoundingClientRect();
      joy.bx = r.left + r.width / 2;
      joy.by = r.top + r.height / 2;
      joy.r = r.width / 2;
    }
    function setKnob(dx, dy) {
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    function update(px, py) {
      var dx = px - joy.bx, dy = py - joy.by;
      var d = Math.hypot(dx, dy);
      var max = joy.r * 0.92;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; d = max; }
      setKnob(dx, dy);
      joy.vx = dx / max;
      joy.vy = dy / max;
      applyMove();
    }
    function release() {
      joy.id = null; joy.active = false; joy.vx = joy.vy = 0;
      setKnob(0, 0);
      applyMove();
    }

    base.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      place();
      joy.id = e.pointerId; joy.active = true;
      if (base.setPointerCapture) { try { base.setPointerCapture(e.pointerId); } catch (err) {} }
      update(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', function (e) {
      if (joy.id !== e.pointerId) return;
      e.preventDefault();
      update(e.clientX, e.clientY);
    });
    function up(e) { if (joy.id === e.pointerId) release(); }
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
    base.addEventListener('pointerleave', function (e) { if (joy.id === e.pointerId && !joy.active) return; });
    place();
  }

  function applyMove() {
    if (!input) return;
    var dz = 0.26;
    var vx = joy.vx, vy = joy.vy;
    input.key('KeyW', vy < -dz);
    input.key('KeyS', vy > dz);
    input.key('KeyD', vx > dz);
    input.key('KeyA', vx < -dz);
    /* 推到底自动疾跑 */
    input.key('ShiftLeft', Math.hypot(vx, vy) > 0.86);
  }

  /* =====================================================================
     拖动转视角（整个屏幕，按钮会被上层元素截获）
     ===================================================================== */
  function bindLookPad() {
    var pad = $('lookPad');
    if (!pad) return;
    var SENS = 2.6;   /* 触摸灵敏度倍率 */

    pad.addEventListener('pointerdown', function (e) {
      if (look.id !== null) return;      /* 已经有手指在转视角 */
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; look.moved = 0;
      if (pad.setPointerCapture) { try { pad.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    pad.addEventListener('pointermove', function (e) {
      if (look.id !== e.pointerId) return;
      var dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY;
      look.moved += Math.abs(dx) + Math.abs(dy);
      input.look(dx * SENS, dy * SENS);
    });
    function up(e) { if (look.id === e.pointerId) look.id = null; }
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
  }

  /* =====================================================================
     触屏按钮
     ===================================================================== */
  function hold(el, downFn, upFn) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
      el.classList.add('act');
      downFn();
    });
    function up(e) {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('act');
      if (upFn) upFn();
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function tap(el, fn) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('act');
      fn();
    });
    function up(e) { e.preventDefault(); e.stopPropagation(); el.classList.remove('act'); }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function bindButtons() {
    var map = {
      btnFire: ['hold', function () { input.trigger(true); }, function () { input.trigger(false); }],
      btnJump: ['hold', function () { input.jump(true); }, function () { input.jump(false); }],
      btnSecond: ['tap', function () { input.secondary(); }],
      btnReload: ['tap', function () { input.reload(); }],
      btnGrenade: ['tap', function () { input.grenade(); }],
      btnInspect: ['tap', function () { input.inspect(); }],
      btnFlash: ['tap', function () { input.flashlight(); }],
      btnPrev: ['tap', function () { input.cycleWeapon(-1); }],
      btnNext: ['tap', function () { input.cycleWeapon(1); }],
      btnPauseM: ['tap', function () { input.pause(); }]
    };
    for (var id in map) {
      var el = $(id);
      if (!el) continue;
      if (map[id][0] === 'hold') hold(el, map[id][1], map[id][2]);
      else tap(el, map[id][1]);
    }
    /* 蹲下做成一键切换（手机上按住蹲很别扭） */
    var cr = $('btnCrouch');
    if (cr) {
      tap(cr, function () {
        crouchOn = !crouchOn;
        input.crouch(crouchOn);
        cr.classList.toggle('on', crouchOn);
      });
    }
    /* 交互键需要长按（关闭阀门） */
    var it = $('btnUse');
    if (it) hold(it, function () { input.interact(true); }, function () { input.interact(false); });
  }

  /* =====================================================================
     横竖屏提示 + 全屏
     ===================================================================== */
  function updateLayout() {
    var portrait = window.innerHeight > window.innerWidth * 1.05;
    var hint = $('rotateHint');
    if (hint) hint.style.display = portrait ? 'flex' : 'none';
  }

  function requestFull() {
    var el = document.documentElement;
    try {
      if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(function () {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(function () {});
      }
    } catch (e) {}
  }

  /* 点“开始游戏”时进入全屏（必须在用户手势里） */
  window.addEventListener('pointerdown', function once(e) {
    var t = e.target;
    if (t && t.id === 'btnStart') {
      requestFull();
      window.removeEventListener('pointerdown', once, true);
    }
  }, true);

  /* =====================================================================
     等待 game.js 就绪
     ===================================================================== */
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (G.game && G.game.input) { clearInterval(timer); tryBoot(); }
    else if (tries > 200) clearInterval(timer);
  }, 30);

  /* 触屏设备上禁用双击缩放 / 长按菜单 */
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
})();

