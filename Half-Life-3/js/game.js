/* =========================================================================
   半条命 3：重返黑山  ——  game.js
   玩家 / 武器 / 敌人 AI / 战斗 / 任务流程 / HUD
   ========================================================================= */
(function () {
  'use strict';
  var T = THREE, G = window.G;
  var $ = function (id) { return document.getElementById(id); };

  /* =====================================================================
     武器数据（定义在 js/weapons.js）
     ===================================================================== */
  var WEAPONS = G.WEAPONS;
  var WORDER = G.WORDER;
  var WKEYS = WORDER;

  /* =====================================================================
     敌人数据
     ===================================================================== */
  var ETYPE = {
    headcrab: {
      name: '猎头蟹', hp: 28, speed: 5.0, dmg: 9, radius: 0.34, height: 0.66,
      sight: 34, melee: 1.7, cd: 1.05, gib: 0xa89070, blood: 0x9a8a1a, score: 1, leap: true
    },
    zombie: {
      name: '僵尸', hp: 95, speed: 1.75, dmg: 17, radius: 0.44, height: 1.8,
      sight: 30, melee: 2.2, cd: 1.55, gib: 0x8a7a60, blood: 0x8a1414, score: 2
    },
    soldier: {
      name: '联合军士兵', hp: 78, speed: 3.5, dmg: 7, radius: 0.42, height: 1.82,
      sight: 38, melee: 0, cd: 1.35, gib: 0x3b4550, blood: 0x8a1414, score: 3,
      ranged: true, rangeMin: 5, rangeMax: 26, burst: 3
    },
    guard: {
      name: '蚁狮守卫', hp: 1250, speed: 3.1, dmg: 42, radius: 1.15, height: 2.7,
      sight: 70, melee: 3.6, cd: 1.25, gib: 0x6a7a3a, blood: 0x5a7a10, score: 25,
      boss: true
    }
  };

  /* =====================================================================
     难度系统
     hp/dmg/speed/cd = 敌人属性的倍率；acc = 士兵命中率倍率；
     count = 触发点刷怪数量倍率；armor = 护甲吸收比例（越小越疼）；
     pickup = 补给数量倍率；noise = 枪声惊动半径
     ===================================================================== */
  var DIFFS = {
    '简单': { hp: 0.80, dmg: 0.70, speed: 0.90, acc: 0.70, cd: 1.25, count: 0.75, armor: 0.60, pickup: 1.35, noise: 9, rage: 0 },
    '普通': { hp: 1.00, dmg: 1.00, speed: 1.00, acc: 0.92, cd: 1.00, count: 1.00, armor: 0.50, pickup: 1.00, noise: 15, rage: 0 },
    '困难': { hp: 1.30, dmg: 1.45, speed: 1.12, acc: 1.06, cd: 0.85, count: 1.35, armor: 0.36, pickup: 0.80, noise: 22, rage: 1 },
    '噩梦': { hp: 1.70, dmg: 1.90, speed: 1.25, acc: 1.18, cd: 0.70, count: 1.70, armor: 0.25, pickup: 0.62, noise: 28, rage: 1 }
  };
  var diffName = '困难';                     /* 默认难度 */
  var DIF = DIFFS[diffName];
  var DIFF_DESC = {
    '简单': '敌人 ×0.8 血量 / ×0.7 伤害 · 补给 ×1.35 · 枪声传播近',
    '普通': '敌人 ×1.0 血量 / ×1.0 伤害 · 补给 ×1.0',
    '困难': '敌人 ×1.3 血量 / ×1.45 伤害 · 数量 ×1.35 · 补给 ×0.8 · Boss 狂暴',
    '噩梦': '敌人 ×1.7 血量 / ×1.9 伤害 · 数量 ×1.7 · 补给 ×0.62 · Boss 狂暴'
  };
  function applyDifficulty(name) {
    if (!DIFFS[name]) return;
    diffName = name;
    DIF = DIFFS[name];
    var el = document.getElementById('diffLabel');
    if (el) {
      el.textContent = name;
      el.style.color = (name === '噩梦' ? '#ff4530' : name === '困难' ? '#ffa028' : name === '简单' ? '#7fe3ff' : '#e8cfa8');
    }
  }
  function difficultyIsHard() { return DIF.armor <= 0.40; }

  /* =====================================================================
     全局
     ===================================================================== */
  var scene, camera, renderer, viewScene, viewCamera, viewRoot, worldRoot;
  var fx, clock, motes = null, postfx = null;
  var enemies = [], grenades = [], booms = [];
  var pending = [];                      /* 延时事件（随游戏时间推进，暂停时不结算） */
  function schedule(delay, fn) { pending.push({ t: delay, fn: fn }); }
  function updatePending(dt) {
    for (var i = pending.length - 1; i >= 0; i--) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) {
        var fn = pending[i].fn;
        pending.splice(i, 1);
        try { fn(); } catch (err) { console.warn('[HL3] 延时事件异常', err); }
      }
    }
  }
  var state = 'menu';                    /* menu | playing | paused | dead | win */
  var stats = { kills: 0, time: 0, shots: 0, hits: 0 };
  var mouseSens = 1.0;
  var lastHud = {};
  var QUALITY = { pixelRatio: 1.5, level: '高' };   /* 稍后按平台覆盖 */
  var fpsFrames = 0, fpsAcc = 0, fpsVal = 0, relockShown = null;
  /* 触屏模式：不做指针锁定，改用虚拟摇杆 + 触摸转视角 */
  var touchMode = false;
  var PLAT = G.PLATFORM || { mobile: false, antialias: true, pixelRatio: 1.5, lightPool: 8, defaultQuality: '高' };
  /* 自动化测试用：?norender=1 只跑逻辑不渲染 */
  var NO_RENDER = /(^|[?&])norender=1/.test(window.location.search);

  var player = {
    pos: { x: 0, y: 0.1, z: 18 }, vel: { x: 0, y: 0, z: 0 },
    radius: 0.38, height: 1.72, stepHeight: 0.45, grounded: false,
    yaw: 0, pitch: 0, eye: 1.62, crouch: false, targetHeight: 1.72,
    health: 100, maxHealth: 100, suit: 100, maxSuit: 100,
    weapons: { crowbar: true, pistol: false, smg: false, shotgun: false, magnum: false, crossbow: false, ar2: false, gravgun: false },
    has: ['crowbar'], cur: 0,
    clip: { pistol: 0, smg: 0, shotgun: 0 },
    reserve: { pistol: 0, smg: 0, shotgun: 0 },
    grenades: 2, flashlight: false, flashBattery: 100,
    reloading: 0, cd: 0, bob: 0, bobPhase: 0, speed: 0,
    shake: 0, hurtFlash: 0, dead: false, deadTimer: 0,
    stepDist: 0, lean: 0, recoil: 0, switching: 0, interactT: 0
  };
  var flashlight, flashTarget = null;
  var keys = {};
  var mouseDown = false;

  /* =====================================================================
     工具
     ===================================================================== */
  function mk(v) { return new T.Vector3(v.x, v.y, v.z); }
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    var mx = ox - cx, my = oy - cy, mz = oz - cz;
    var b = mx * dx + my * dy + mz * dz;
    var c = mx * mx + my * my + mz * mz - r * r;
    if (c > 0 && b > 0) return -1;
    var disc = b * b - c;
    if (disc < 0) return -1;
    var t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t;
  }
  function forward() {
    var cp = Math.cos(player.pitch);
    return {
      x: -Math.sin(player.yaw) * cp,
      y: Math.sin(player.pitch),
      z: -Math.cos(player.yaw) * cp
    };
  }
  function eyePos() {
    return { x: player.pos.x, y: player.pos.y + player.eye, z: player.pos.z };
  }

  /* =====================================================================
     音效 / 字幕 / 提示
     ===================================================================== */
  var subtitleTimer = 0;
  function say(text, dur) {
    var el = $('subtitle');
    el.textContent = text;
    el.classList.add('on');
    subtitleTimer = dur || 4.2;
  }
  function toast(text, cls) {
    var box = $('toast');
    var d = document.createElement('div');
    d.className = 'toastItem' + (cls ? ' ' + cls : '');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 2200);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3000);
  }
  function setObjective(text) {
    var el = $('objective');
    el.textContent = '目标：' + text;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    $('objBox').style.opacity = 1;
  }

  /* =====================================================================
     场景初始化
     ===================================================================== */
  function initThree() {
    renderer = new T.WebGLRenderer({
      antialias: PLAT.antialias !== false,
      powerPreference: 'high-performance'
    });
    renderer.outputEncoding = T.sRGBEncoding;
    QUALITY.level = PLAT.defaultQuality || '高';
    QUALITY.pixelRatio = (QUALITY.level === '低') ? 0.7 : (QUALITY.level === '中' ? 1.0 : (PLAT.pixelRatio || 1.5));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    try {
      postfx = new G.PostFX(renderer);
      postfx.setSize(window.innerWidth, window.innerHeight);
      postfx.setQuality(QUALITY.level);
    } catch (err) { postfx = null; console.warn('[HL3] 后期处理不可用，已回退', err); }
    $('app').insertBefore(renderer.domElement, $('app').firstChild);

    scene = new T.Scene();
    scene.background = new T.Color(0x05070a);
    scene.fog = new T.FogExp2(0x070a0e, 0.017);

    camera = new T.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 400);

    /* 手电（聚光灯，挂相机） */
    flashlight = new T.SpotLight(0xffeecc, 0, 26, 0.55, 0.45, 1.6);
    flashlight.position.set(0, -0.1, 0.1);
    flashTarget = new T.Object3D();
    flashTarget.position.set(0, 0, -1);
    camera.add(flashlight);
    camera.add(flashTarget);
    flashlight.target = flashTarget;

    /* 视角模型（独立场景，避免穿墙） */
    viewScene = new T.Scene();
    viewCamera = new T.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 12);
    viewScene.add(new T.AmbientLight(0xffffff, 0.55));
    var vl = new T.DirectionalLight(0xfff0dd, 0.85);
    vl.position.set(0.6, 1, 1.2);
    viewScene.add(vl);
    var vl2 = new T.DirectionalLight(0x88aaff, 0.25);
    vl2.position.set(-1, 0.2, -0.6);
    viewScene.add(vl2);
    viewRoot = new T.Group();
    viewScene.add(viewRoot);

    /* 环境光 */
    scene.add(new T.AmbientLight(0x30384a, 0.55));
    var hemi = new T.HemisphereLight(0x5a6a88, 0x1a1a1a, 0.30);
    scene.add(hemi);

    window.addEventListener('resize', onResize);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    viewCamera.aspect = camera.aspect;
    viewCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (postfx) postfx.setSize(window.innerWidth, window.innerHeight);
  }

  /* =====================================================================
     视角模型（武器装配台，模型与动画定义在 js/weapons.js）
     ===================================================================== */
  var rig = null;
  var gravHeld = null;          /* 重力枪当前抓着的道具 */
  var projectiles = [];         /* AR2 能量球 / 弩箭等飞行物 */

  function buildViewModels() {
    while (viewRoot.children.length) viewRoot.remove(viewRoot.children[0]);
    rig = new G.WeaponRig(viewRoot);
  }

  /** 武器模型材质自检（构建失败时给出明确提示，而不是静默黑屏） */
  function verifyWeaponModels() {
    var bad = [];
    for (var i = 0; i < WORDER.length; i++) {
      if (!rig.exists(WORDER[i])) bad.push(WORDER[i]);
    }
    if (bad.length) console.warn('[HL3] 武器模型缺失：' + bad.join(','));
    return bad;
  }

  /* =====================================================================
     敌人生成
     ===================================================================== */
  /* =====================================================================
     敌人模型（精细版：关节四肢 / 面部细节 / 装备分件）
     ===================================================================== */
  var BOXG = new T.BoxGeometry(1, 1, 1);
  function eb(mat, w, h, d, x, y, z, parent, rot) {
    var m = new T.Mesh(BOXG, mat);
    m.scale.set(w, h, d);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (parent) parent.add(m);
    return m;
  }
  function es(mat, r, x, y, z, parent, sx, sy, sz) {
    var m = new T.Mesh(new T.SphereGeometry(r, 10, 8), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.scale.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    if (parent) parent.add(m);
    return m;
  }
  function ec(mat, rt, rb, h, x, y, z, parent, rot, seg) {
    var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 8), mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (parent) parent.add(m);
    return m;
  }
  function eco(mat, r, h, x, y, z, parent, rot, seg) {
    var m = new T.Mesh(new T.ConeGeometry(r, h, seg || 6), mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (parent) parent.add(m);
    return m;
  }

  function buildEnemyMesh(type) {
    var g = new T.Group();
    var parts = { legs: [], arms: [], head: null };

    /* ================= 猎头蟹 ================= */
    if (type === 'headcrab') {
      var shell = G.plain(0x8f7a58, { shin: 48, spec: 0x554433 });
      var belly = G.plain(0xbca887, { shin: 20, spec: 0x332211 });
      var legMat = G.plain(0x6d5c42, { shin: 26 });

      var bodyRoot = new T.Group();
      bodyRoot.position.y = 0.34;
      g.add(bodyRoot);
      /* 甲壳：主体 + 背部隆起 */
      var shellM = es(shell, 0.30, 0, 0, 0.02, bodyRoot, 1.02, 0.70, 1.42);
      es(shell, 0.22, 0, 0.10, 0.14, bodyRoot, 0.90, 0.55, 1.0);   /* 背部鼓起 */
      /* 背脊棱 */
      for (var sr = 0; sr < 4; sr++) {
        eb(shell, 0.055 - sr * 0.008, 0.045, 0.10, 0, 0.20 - sr * 0.012, 0.10 - sr * 0.17, bodyRoot);
      }
      /* 腹部浅色 */
      es(belly, 0.24, 0, -0.10, 0.02, bodyRoot, 1.0, 0.42, 1.30);
      /* 头部与前吻 */
      var headG = new T.Group();
      headG.position.set(0, -0.04, -0.30);
      bodyRoot.add(headG);
      es(shell, 0.16, 0, 0, 0, headG, 1.0, 0.85, 1.25);
      eco(G.plain(0x4a3d2a), 0.10, 0.22, 0, -0.04, -0.17, headG, [Math.PI / 2.15, 0, 0]);
      /* 獠牙 */
      for (var fg = -1; fg <= 1; fg += 2) {
        eco(G.plain(0xe8e0c8, { shin: 60 }), 0.022, 0.10, fg * 0.045, -0.09, -0.22, headG, [Math.PI / 1.7, 0, 0]);
      }
      /* 眼睛 */
      for (var ey = -1; ey <= 1; ey += 2) {
        es(G.plain(0x2a0808, { emis: 0xbb2a12, emisI: 0.85 }), 0.040, ey * 0.085, 0.055, -0.13, headG);
      }
      parts.head = shellM;

      /* 四对节肢（髋 → 大腿 → 小腿 → 爪尖） */
      for (var li = 0; li < 4; li++) {
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var hip = new T.Group();
          hip.position.set(sgn * 0.20, -0.06, 0.16 - li * 0.17);
          bodyRoot.add(hip);
          hip.rotation.y = sgn * (0.42 + li * 0.16);
          eb(legMat, 0.055, 0.20, 0.055, 0, -0.02, -0.11, hip, [0.85, 0, 0]);      /* 大腿 */
          var knee = new T.Group();
          knee.position.set(0, -0.10, -0.20);
          hip.add(knee);
          eb(legMat, 0.045, 0.24, 0.045, 0, -0.09, -0.04, knee, [-0.55, 0, 0]);     /* 小腿 */
          eb(legMat, 0.040, 0.05, 0.10, 0, -0.20, -0.10, knee, [0.5, 0, 0]);        /* 爪尖 */
          parts.legs.push(hip);
        }
      }
    }

    /* ================= 僵尸 ================= */
    else if (type === 'zombie') {
      var shirt = G.plain(0xa9a496, { shin: 12, spec: 0x222222 });
      var shirt2 = G.plain(0x8d8878, { shin: 10, spec: 0x222222 });
      var pants = G.plain(0x39414a, { shin: 12, spec: 0x222222 });
      var skin = G.plain(0x9c8b72, { shin: 10, spec: 0x332211 });
      var gore = G.plain(0x6a1010, { shin: 40, spec: 0x552222 });
      var bone = G.plain(0xd8cfb4, { shin: 30 });

      /* 躯干 */
      var torso = new T.Group();
      torso.position.y = 0.80;
      g.add(torso);
      eb(shirt, 0.60, 0.56, 0.34, 0, 0.30, 0, torso);              /* 胸 */
      eb(shirt2, 0.52, 0.30, 0.30, 0, -0.02, 0.01, torso);         /* 腹 */
      /* 撕破的衣角 + 露出的肋 */
      eb(gore, 0.30, 0.22, 0.03, 0.12, 0.20, -0.175, torso, [0, 0, 0.25]);
      for (var rb = 0; rb < 3; rb++) eb(bone, 0.20, 0.030, 0.05, -0.10, 0.34 - rb * 0.085, -0.165, torso);
      /* 血迹 */
      eb(gore, 0.22, 0.16, 0.02, -0.14, 0.12, -0.18, torso);
      eb(gore, 0.16, 0.12, 0.02, 0.16, -0.02, -0.17, torso);
      /* 肩 */
      es(shirt, 0.14, 0.34, 0.50, 0, torso);
      es(shirt, 0.14, -0.34, 0.50, 0, torso);

      /* 头 */
      var headG2 = new T.Group();
      headG2.position.y = 1.62;
      g.add(headG2);
      var skull = es(skin, 0.175, 0, 0.06, 0, headG2, 1.0, 1.08, 1.0);
      eb(skin, 0.17, 0.10, 0.16, 0, -0.02, -0.07, headG2);          /* 下颌 */
      es(G.plain(0x1a0a08), 0.035, 0.075, 0.09, -0.15, headG2);     /* 眼窝 */
      es(G.plain(0x1a0a08), 0.035, -0.075, 0.09, -0.15, headG2);
      /* 头上的猎头蟹 */
      var hc = new T.Group();
      hc.position.set(0, 0.21, 0.02);
      hc.rotation.x = -0.25;
      headG2.add(hc);
      es(G.plain(0x8f7a58, { shin: 40 }), 0.17, 0, 0, 0, hc, 1.05, 0.62, 1.30);
      es(G.plain(0xbca887, { shin: 18 }), 0.13, 0, -0.05, 0, hc, 1.0, 0.40, 1.10);
      for (var hl = 0; hl < 3; hl++) {
        for (var hs = -1; hs <= 1; hs += 2) {
          eb(G.plain(0x6d5c42), 0.04, 0.04, 0.17, hs * 0.13, -0.05, 0.03 - hl * 0.06, hc, [0, hs * 0.5, 0]);
        }
      }
      parts.head = skull;

      /* 手臂（肩 → 上臂 → 肘 → 前臂 → 手） */
      for (var a = -1; a <= 1; a += 2) {
        var arm = new T.Group();
        arm.position.set(a * 0.36, 1.30, 0);
        arm.rotation.x = -1.15;
        g.add(arm);
        eb(shirt2, 0.155, 0.34, 0.155, 0, -0.17, 0, arm);
        var elbow = new T.Group();
        elbow.position.y = -0.34;
        arm.add(elbow);
        eb(skin, 0.125, 0.30, 0.125, 0, -0.15, 0, elbow);
        eb(gore, 0.13, 0.05, 0.13, 0, -0.06, 0, elbow);
        /* 手：掌 + 四指 */
        var hand = new T.Group();
        hand.position.y = -0.31;
        elbow.add(hand);
        eb(skin, 0.115, 0.10, 0.13, 0, 0, 0, hand);
        for (var fi = 0; fi < 4; fi++) {
          eb(skin, 0.026, 0.10, 0.028, -0.038 + fi * 0.025, -0.10, -0.02, hand, [0.35, 0, 0]);
        }
        parts.arms.push(arm);
      }

      /* 腿（髋 → 大腿 → 膝 → 小腿 → 靴） */
      for (var l = -1; l <= 1; l += 2) {
        var leg = new T.Group();
        leg.position.set(l * 0.16, 0.80, 0);
        g.add(leg);
        eb(pants, 0.19, 0.42, 0.20, 0, -0.21, 0, leg);
        var knee = new T.Group();
        knee.position.y = -0.42;
        leg.add(knee);
        eb(pants, 0.165, 0.38, 0.175, 0, -0.19, 0, knee);
        eb(G.plain(0x2a2a2c, { shin: 40 }), 0.175, 0.10, 0.26, 0, -0.40, -0.03, knee);
        parts.legs.push(leg);
      }
    }

    /* ================= 联合军士兵 ================= */
    else if (type === 'soldier') {
      var armor = G.mat('combine', 1, 1);
      var armorD = G.plain(0x2b323a, { shin: 40, spec: 0x556677 });
      var suit = G.plain(0x39414c, { shin: 26, spec: 0x445566 });
      var metal = G.plain(0x59616b, { shin: 80, spec: 0x99aabb });

      var body3 = new T.Group();
      body3.position.y = 0.84;
      g.add(body3);
      eb(suit, 0.58, 0.44, 0.32, 0, 0.14, 0, body3);               /* 腹 */
      eb(armor, 0.62, 0.40, 0.36, 0, 0.46, 0, body3);              /* 胸甲 */
      eb(metal, 0.50, 0.10, 0.38, 0, 0.64, 0, body3);              /* 颈护 */
      /* 肩甲 */
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        eb(armorD, 0.20, 0.16, 0.30, s2 * 0.34, 0.58, 0, body3, [0, 0, s2 * 0.35]);
      }
      /* 背包 + 气罐 */
      eb(armorD, 0.34, 0.34, 0.16, 0, 0.42, 0.24, body3);
      ec(metal, 0.055, 0.055, 0.24, 0.09, 0.42, 0.34, body3, [0.25, 0, 0]);
      ec(metal, 0.055, 0.055, 0.24, -0.09, 0.42, 0.34, body3, [0.25, 0, 0]);
      /* 腰部装备袋 */
      eb(armorD, 0.16, 0.14, 0.10, 0.24, -0.10, 0.06, body3);
      eb(armorD, 0.16, 0.14, 0.10, -0.24, -0.10, 0.06, body3);

      /* 头：头盔 + 面罩 + 呼吸管 */
      var headG3 = new T.Group();
      headG3.position.y = 1.66;
      g.add(headG3);
      var helm = es(metal, 0.205, 0, 0.05, 0, headG3, 1.0, 1.10, 1.05);
      eb(armorD, 0.30, 0.07, 0.26, 0, 0.13, -0.02, headG3, [0.18, 0, 0]);   /* 盔檐 */
      eb(G.plain(0x161a1f, { shin: 70, spec: 0x556677 }), 0.22, 0.12, 0.10, 0, 0.03, -0.16, headG3); /* 面罩 */
      ec(metal, 0.075, 0.085, 0.13, 0, -0.02, -0.20, headG3, [Math.PI / 2, 0, 0]);   /* 滤毒罐 */
      ec(G.plain(0x22262c), 0.028, 0.028, 0.22, 0.09, -0.06, -0.10, headG3, [0.9, 0, 0.5]); /* 呼吸管 */
      var eye1 = es(G.plain(0x330000, { emis: 0xff3010, emisI: 1.0 }), 0.045, 0.085, 0.07, -0.17, headG3);
      var eye2 = es(G.plain(0x330000, { emis: 0xff3010, emisI: 1.0 }), 0.045, -0.085, 0.07, -0.17, headG3);
      parts.head = helm;

      /* 手臂 + 手中脉冲步枪 */
      for (var a2 = -1; a2 <= 1; a2 += 2) {
        var arm2 = new T.Group();
        arm2.position.set(a2 * 0.36, 1.32, 0);
        arm2.rotation.x = -1.30;
        g.add(arm2);
        eb(suit, 0.16, 0.32, 0.16, 0, -0.16, 0, arm2);
        var el2 = new T.Group();
        el2.position.y = -0.32;
        arm2.add(el2);
        eb(armorD, 0.135, 0.28, 0.135, 0, -0.14, 0, el2);
        eb(G.plain(0x1e2228, { shin: 60 }), 0.14, 0.10, 0.14, 0, -0.29, 0, el2);  /* 手套 */
        parts.arms.push(arm2);
      }
      var rifle = new T.Group();
      rifle.position.set(0.14, 1.24, -0.34);
      g.add(rifle);
      eb(G.plain(0x2a3038, { shin: 70, spec: 0x889999 }), 0.09, 0.12, 0.62, 0, 0, 0, rifle);
      eb(G.plain(0x1a1e24), 0.07, 0.20, 0.08, 0, -0.15, 0.06, rifle);
      cylGlow(rifle);
      function cylGlow(p) {
        var c = ec(new T.MeshBasicMaterial({ color: 0x66ddff }), 0.022, 0.022, 0.10, 0, 0.06, -0.16, p, [Math.PI / 2, 0, 0]);
        return c;
      }
      eb(G.plain(0x1a1e24), 0.05, 0.06, 0.20, 0, 0.02, 0.26, rifle);
      g.userData.muzzle = new T.Object3D();
      g.userData.muzzle.position.set(0.14, 1.24, -0.72);
      g.add(g.userData.muzzle);

      /* 腿 */
      for (var l2 = -1; l2 <= 1; l2 += 2) {
        var leg2 = new T.Group();
        leg2.position.set(l2 * 0.17, 0.84, 0);
        g.add(leg2);
        eb(suit, 0.20, 0.44, 0.21, 0, -0.22, 0, leg2);
        eb(armorD, 0.16, 0.18, 0.20, l2 * 0.06, -0.14, -0.03, leg2);   /* 腿甲 */
        var knee2 = new T.Group();
        knee2.position.y = -0.44;
        leg2.add(knee2);
        eb(suit, 0.17, 0.36, 0.18, 0, -0.18, 0, knee2);
        eb(armorD, 0.14, 0.16, 0.17, l2 * 0.05, -0.10, -0.03, knee2);
        eb(G.plain(0x1e2228, { shin: 40 }), 0.185, 0.11, 0.27, 0, -0.38, -0.04, knee2);
        parts.legs.push(leg2);
      }
    }

    /* ================= 蚁狮守卫 ================= */
    else if (type === 'guard') {
      var hide = G.plain(0x69773a, { shin: 24, spec: 0x334422 });
      var hideD = G.plain(0x4e5a2c, { shin: 20 });
      var belly2 = G.plain(0xa8ae6a, { shin: 16 });
      var claw = G.plain(0xd8c890, { shin: 55, spec: 0x776644 });

      var torso2 = new T.Group();
      torso2.position.y = 1.55;
      g.add(torso2);
      /* 甲壳分节 */
      es(hide, 0.85, 0, 0, 0.05, torso2, 1.05, 0.92, 0.82);
      eb(hideD, 1.70, 0.28, 1.20, 0, 0.34, 0.06, torso2);           /* 背甲 */
      eb(hide, 1.86, 0.22, 1.34, 0, 0.02, 0.0, torso2);
      es(belly2, 0.62, 0, -0.42, -0.24, torso2, 1.2, 0.62, 1.0);    /* 腹部浅色 */
      /* 背刺 */
      for (var sp = 0; sp < 3; sp++) {
        eco(claw, 0.10, 0.30 - sp * 0.05, 0, 0.52 - sp * 0.04, 0.40 - sp * 0.34, torso2, [-0.35, 0, 0]);
      }
      /* 头 */
      var headG4 = new T.Group();
      headG4.position.set(0, 0.30, -0.92);
      torso2.add(headG4);
      es(hide, 0.46, 0, 0, 0, headG4, 1.25, 0.85, 1.05);
      eb(hideD, 0.78, 0.20, 0.44, 0, 0.22, 0.02, headG4);
      /* 四根颚须 */
      for (var mm = -1; mm <= 1; mm += 2) {
        for (var mi = 0; mi < 2; mi++) {
          eco(claw, 0.075, 0.52 - mi * 0.10, mm * (0.22 + mi * 0.09), -0.18 - mi * 0.05, -0.36 - mi * 0.06,
            headG4, [-1.15 - mi * 0.25, 0, mm * 0.22]);
        }
      }
      for (var geye = -1; geye <= 1; geye += 2) {
        es(G.plain(0x2a2200, { emis: 0xffcc33, emisI: 0.9 }), 0.085, geye * 0.24, 0.16, -0.40, headG4);
      }
      parts.head = headG4.children[0];

      /* 四条粗腿 */
      for (var gl = -1; gl <= 1; gl += 2) {
        for (var gf = 0; gf < 2; gf++) {
          var ghip = new T.Group();
          ghip.position.set(gl * 0.78, -0.42, gf === 0 ? -0.42 : 0.50);
          torso2.add(ghip);
          eb(hide, 0.34, 0.66, 0.34, 0, -0.30, 0, ghip, [gf === 0 ? 0.22 : -0.22, 0, gl * 0.12]);
          var gknee = new T.Group();
          gknee.position.set(0, -0.60, 0);
          ghip.add(gknee);
          eb(hideD, 0.28, 0.60, 0.28, 0, -0.26, 0, gknee, [gf === 0 ? -0.30 : 0.30, 0, 0]);
          eb(claw, 0.34, 0.14, 0.42, 0, -0.58, -0.06, gknee);
          parts.legs.push(ghip);
        }
      }
      /* 前肢（小） */
      for (var ga = -1; ga <= 1; ga += 2) {
        var garm = new T.Group();
        garm.position.set(ga * 0.86, 0.10, -0.50);
        garm.rotation.x = -0.55;
        torso2.add(garm);
        eb(hideD, 0.20, 0.52, 0.20, 0, -0.24, 0, garm);
        eb(claw, 0.14, 0.30, 0.14, 0, -0.52, 0, garm);
        parts.arms.push(garm);
      }
    }
    g.userData.parts = parts;
    return g;
  }

  function spawnEnemy(type, x, z, y) {
    if (enemies.length > 46) return null;
    var D = ETYPE[type];
    if (y === undefined) {
      var gy = G.groundAt(x, z, 1.6, 0.4);
      y = (gy > -Infinity) ? gy + 0.05 : 0;
    }
    var mesh = buildEnemyMesh(type);
    mesh.position.set(x, y, z);
    worldRoot.add(mesh);
    var ehp = Math.max(1, Math.round(D.hp * DIF.hp));
    var e = {
      type: type, def: D, mesh: mesh, parts: mesh.userData.parts,
      pos: { x: x, y: y, z: z }, vel: { x: 0, y: 0, z: 0 },
      radius: D.radius, height: D.height, stepHeight: 0.5, grounded: false,
      hp: ehp, maxHp: ehp, state: 'idle', cd: G.rand(0, 0.6),
      alert: 0, t: Math.random() * 10, yaw: 0, dead: false,
      anim: Math.random() * 6.28, burstLeft: 0, burstCd: 0, aim: 0,
      hitFlash: 0, leapT: 0, charge: 0, chargeCd: G.rand(3, 6), soundT: G.rand(2, 8),
      hopCd: G.rand(0, 0.4), leapVX: 0, leapVZ: 0,
      stuck: 0, detourT: 0, detourSign: Math.random() < 0.5 ? 1 : -1, hopFromX: x, hopFromZ: z, hopCount: 0, meshYOff: 0,
      lastSeen: null, killTimer: 0, boss: !!D.boss
    };
    enemies.push(e);
    return e;
  }

  /* =====================================================================
     敌人 AI
     ===================================================================== */
  function enemyEye(e) { return { x: e.pos.x, y: e.pos.y + e.height * 0.85, z: e.pos.z }; }

  /* ---------- 近战判定工具（按真实体积 / 正锥判定，不再隔空咬人） ---------- */
  /** 敌人身体与玩家胶囊在垂直方向是否重叠 */
  function enemyVertOverlap(e, slack) {
    slack = slack === undefined ? 0.15 : slack;
    var pFeet = player.pos.y, pTop = player.pos.y + player.height;
    return (e.pos.y < pTop + slack) && (e.pos.y + e.height > pFeet - slack);
  }
  /** 猎头蟹是否真的贴到了玩家身上（按体积） */
  function headcrabTouching(e, extra) {
    var d = G.distXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z);
    var reach = e.radius + player.radius + (extra === undefined ? 0.22 : extra);
    return d <= reach && enemyVertOverlap(e, 0.22);
  }
  /** 敌人是否正对玩家（正锥判定，防止背对着也能咬） */
  function facingPlayer(e, minDot) {
    var dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    var fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    return (dx / d) * fx + (dz / d) * fz > (minDot === undefined ? 0.2 : minDot);
  }
  /** 通用近战命中：真实触及距离 + 垂直重叠 + 正锥 */
  function meleeConnects(e, reach, vertSlack, minDot) {
    var d = G.distXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z);
    if (d > reach) return false;
    if (!enemyVertOverlap(e, vertSlack)) return false;
    return facingPlayer(e, minDot);
  }
  /** 咬中玩家：伤害 + 血花 + 震动 */
  function bitePlayer(e, dmg) {
    damagePlayer(dmg, e.pos.x, e.pos.y, e.pos.z);
    fx.chunks.burst(player.pos.x, player.pos.y + 0.4, player.pos.z, 3, 0x8a1414, 2.8, 0.055, 1.1);
    player.shake = Math.min(1.3, player.shake + 0.4);
  }
  /** 枪声/爆炸惊动附近敌人 */
  function alertArea(x, z, radius) {
    if (radius <= 0) return 0;
    var n = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (G.distXZ(x, z, e.pos.x, e.pos.z) < radius) { e.alert = 9; n++; }
    }
    return n;
  }

  function canSee(e) {
    var a = enemyEye(e), p = eyePos();
    var dx = p.x - a.x, dy = p.y - a.y, dz = p.z - a.z;
    var d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > e.def.sight * e.def.sight) return false;
    return G.lineOfSight(a.x, a.y, a.z, p.x, p.y, p.z);
  }

  function damageEnemy(e, dmg, head, ix, iy, iz) {
    if (e.dead) return false;
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.alert = 8;
    if (e.state === 'idle') e.state = 'chase';
    stats.hits++;
    fx.impact({ x: ix, y: iy, z: iz }, 0, 0.4, 0, 'flesh');
    G.audio.play('hitmark', 0.6);
    if (e.hp <= 0) killEnemy(e);
    else if (e.def.ranged && e.hp < e.maxHp * 0.5 && Math.random() < 0.3) G.audio.play('combine', 0.5);
    return true;
  }

  function killEnemy(e) {
    e.dead = true;
    e.killTimer = 0;
    stats.kills++;
    startCorpse(e);
    var m = e.mesh;
    fx.chunks.burst(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z, e.boss ? 22 : 8, e.def.blood, e.boss ? 6 : 3.6, 0.085, e.boss ? 2.4 : 1.6);
    fx.glow.burst(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z, e.boss ? 26 : 10, 0xaa2222, 3.4, 0.5, -5);
    if (e.boss) {
      fx.explode(e.pos.x, e.pos.y + 1.2, e.pos.z, 1.6);
      G.audio.play('reveal', 1);
      say('蚁狮守卫倒下了……反应堆舱门开始泄压。', 5);
      activatePortal();
      setObjective('进入传送门，离开黑山');
    } else {
      G.audio.play(e.type === 'headcrab' ? 'headcrab' : 'flesh', 0.9);
    }
    /* 僵尸死后爬出猎头蟹 */
    if (e.type === 'zombie' && Math.random() < 0.55) {
      for (var i = 0; i < 2; i++) {
        spawnEnemy('headcrab', e.pos.x + G.rand(-0.7, 0.7), e.pos.z + G.rand(-0.7, 0.7), e.pos.y + 1.1);
      }
      say('猎头蟹从尸体里爬出来了！', 2.2);
    }
  }

  /* =====================================================================
     尸体：倒地姿态 / 血泊 / 存留与沉降
     ===================================================================== */
  var corpses = [];
  var CORPSE_MAX = 26, CORPSE_LIFE = 70;
  /* tilt=最终倾倒角(弧度), yOff=躺平后抬升量, roll=侧翻, dur=倒地耗时,
     pool=血泊半径, sprawl=四肢摊开程度 */
  var DEATH_POSE = {
    headcrab: { tilt: -2.70, yOff: 0.30, roll: 0.55, dur: 0.42, pool: 0.95, sprawl: 0.45, big: false },
    zombie: { tilt: -1.63, yOff: 0.20, roll: 0.24, dur: 0.72, pool: 1.20, sprawl: 0.75, big: false },
    soldier: { tilt: -1.55, yOff: 0.21, roll: 0.18, dur: 0.78, pool: 1.05, sprawl: 0.55, big: false },
    guard: { tilt: -1.38, yOff: 0.62, roll: 0.12, dur: 1.15, pool: 2.30, sprawl: 0.85, big: true }
  };

  /* ---- 血泊 ---- */
  var pools = [], POOL_MAX = 18, bloodMatBase = null;
  function bloodMaterial() {
    if (!bloodMatBase) {
      bloodMatBase = new T.MeshBasicMaterial({
        map: G.tex('blood'), transparent: true, depthWrite: false, opacity: 0.92,
        /* 不要用激进的 polygonOffset：偏移过大会让血泊「穿」过地板/箱子画在前面，
           看起来就像一块有体积的实体。抬高 2cm 贴在ground上即可。 */
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      });
    }
    return bloodMatBase;
  }
  function spawnBloodPool(e) {
    var D = DEATH_POSE[e.type] || DEATH_POSE.zombie;
    var gy = G.groundAt(e.pos.x, e.pos.z, e.pos.y + 1.4, 0.6);
    if (gy === -Infinity) return;
    var m = new T.Mesh(new T.PlaneGeometry(1, 1), bloodMaterial().clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6.283;
    m.position.set(e.pos.x + G.rand(-0.25, 0.25), gy + 0.022, e.pos.z + G.rand(-0.25, 0.25));
    m.scale.set(0.18, 0.18, 1);
    m.renderOrder = 1;
    m.matrixAutoUpdate = true;
    worldRoot.add(m);
    pools.push({ mesh: m, t: 0, target: D.pool * G.rand(0.85, 1.2), life: 34 });
    if (pools.length > POOL_MAX) {
      var old = pools.shift();
      worldRoot.remove(old.mesh);
    }
  }
  function updateBloodPools(dt) {
    for (var i = pools.length - 1; i >= 0; i--) {
      var p = pools[i];
      p.t += dt;
      var g = Math.min(1, p.t / 1.6);
      var s = p.target * (0.22 + 0.78 * (1 - Math.pow(1 - g, 2)));
      p.mesh.scale.set(s, s, 1);
      if (p.t > p.life) {
        var f = 1 - (p.t - p.life) / 4;
        if (f <= 0) { worldRoot.remove(p.mesh); pools.splice(i, 1); continue; }
        p.mesh.material.opacity = 0.92 * f;
      }
    }
  }
  function clearPools() {
    for (var i = 0; i < pools.length; i++) worldRoot.remove(pools[i].mesh);
    pools.length = 0;
    corpses.length = 0;
  }

  /** 敌人倒地（在 killEnemy 里调用） */
  function startCorpse(e) {
    var D = DEATH_POSE[e.type] || DEATH_POSE.zombie;
    e.fallYaw = G.rand(-0.75, 0.75);
    e.fallSign = Math.random() < 0.5 ? 1 : -1;
    e.limpSeed = Math.random();
    e.landed = false;
    e.sink = 0;
    e.corpseT = 0;
    corpses.push(e);
    if (corpses.length > CORPSE_MAX) {
      var old = corpses.shift();
      old.mesh.visible = false;
    }
    spawnBloodPool(e);
  }

  /** 每帧的尸体更新（由 updateEnemy 的死亡分支调用） */
  function updateCorpse(e, dt) {
    e.killTimer += dt;
    /* 被抓 / 正在飞行的尸体不做躺平姿态，交给对应逻辑处理 */
    if (e.held || e.flying) { e.corpseT = (e.corpseT || 0); return; }
    var D = DEATH_POSE[e.type] || DEATH_POSE.zombie;
    var p = Math.min(1, e.killTimer / D.dur);
    var k = 1 - Math.pow(1 - p, 3);                          /* ease-out cubic */
    var wobble = Math.sin(p * Math.PI * 1.7) * (1 - p) * 0.11; /* 落地回弹 */
    e.mesh.rotation.x = D.tilt * k - wobble;
    e.mesh.rotation.y = e.yaw + Math.PI + (e.fallYaw || 0) * k;
    e.mesh.rotation.z = D.roll * k * (e.fallSign || 1);
    e.meshYOff = D.yOff * k;

    /* 四肢松软摊开 */
    var Pt = e.parts;
    if (Pt) {
      var sp = D.sprawl * k;
      var limpX = -0.12 - (e.limpSeed || 0) * 0.45;
      for (var ai = 0; ai < Pt.arms.length; ai++) {
        Pt.arms[ai].rotation.x = G.lerp(-1.15, limpX, k);
        Pt.arms[ai].rotation.z = (ai % 2 ? 1 : -1) * sp;
      }
      for (var li = 0; li < Pt.legs.length; li++) {
        Pt.legs[li].rotation.x *= 0.5;
        Pt.legs[li].rotation.z = (li % 2 ? 1 : -1) * sp * 0.55;
        Pt.legs[li].position.z *= 0.6;
      }
    }

    /* 落地那一下：闷响 + 灰尘 */
    if (!e.landed && p >= 1) {
      e.landed = true;
      G.audio.play(D.big ? 'thudBig' : 'thud', 1);
      fx.dust.burst(e.pos.x, e.pos.y + 0.12, e.pos.z, D.big ? 14 : 7,
        D.big ? 1.3 : 0.9);
      if (D.big) player.shake = Math.min(1.2, player.shake + 0.35);
    }

    /* 存留：超时后缓缓沉入地面再隐藏（不做突然消失） */
    e.corpseT += dt;
    if (e.corpseT > CORPSE_LIFE) {
      e.sink += dt * 0.32;
      e.meshYOff = D.yOff - e.sink;
      if (e.sink > D.yOff + 1.4) e.mesh.visible = false;
    }
  }

  function damagePlayer(amount, srcX, srcY, srcZ, kind) {
    if (player.dead || state !== 'playing') return;
    /* 敌人伤害随难度放大；毒素/坠落等环境伤害不受难度影响 */
    var dmg = (kind === 'sludge' || kind === 'fall') ? amount : amount * DIF.dmg;
    if (player.suit > 0) {
      var absorbed = Math.min(player.suit, dmg * DIF.armor);
      player.suit -= absorbed;
      dmg -= absorbed;
    }
    player.health -= dmg;
    player.hurtFlash = Math.min(1, player.hurtFlash + dmg / 45 + 0.25);
    player.shake = Math.min(1.4, player.shake + dmg / 60);
    G.audio.play('hurt', kind === 'sludge' ? 0.4 : 1);
    if (player.health <= 0) {
      player.health = 0;
      playerDie();
    }
  }

  function playerDie() {
    if (player.dead) return;
    player.dead = true;
    player.deadTimer = 0;
    state = 'dead';
    G.audio.play('die', 1);
    document.exitPointerLock();
    $('death').classList.add('on');
    $('deathStats').textContent = '击杀 ' + stats.kills + ' · 存活 ' + fmtTime(stats.time);
    $('hud').classList.remove('on');
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), q = Math.floor(s % 60);
    return m + ':' + (q < 10 ? '0' : '') + q;
  }

  function activatePortal() {
    var L = G.level;
    if (!L.portal) return;
    L.portal.active = true;
    G.audio.play('portal', 1);
    fx.flashes.flash(L.portal.pos.x, L.portal.pos.y, L.portal.pos.z, 0x66ccff, 4, 30, 0.5);
  }

  function updateEnemy(e, dt) {
    e.meshYOff = 0;
    enemyLogic(e, dt);
    /* 模型位置统一在逻辑之后同步，保证零迟滞 */
    e.mesh.position.set(e.pos.x, e.pos.y + e.meshYOff, e.pos.z);
  }

  /**
   * 带绕障的移动：直行受阻时沿切线绕行一段时间。
   * 没有它，敌人会永远顶在墙/柱子前原地不动。
   */
  function moveSteered(e, dirx, dirz, speed, dt) {
    var bx = e.pos.x, bz = e.pos.z, dm;
    if (e.detourT > 0) {
      e.detourT -= dt;
      var tx = -dirz * e.detourSign, tz = dirx * e.detourSign;
      e.vel.x = tx * speed; e.vel.z = tz * speed;
      G.moveBody(e, dt);
      dm = G.distXZ(e.pos.x, e.pos.z, bx, bz);
      if (dm < speed * dt * 0.35) { e.detourT = 0; e.detourSign = -e.detourSign; }  /* 切向也被挡，换一边 */
      return dm;
    }
    e.vel.x = dirx * speed; e.vel.z = dirz * speed;
    G.moveBody(e, dt);
    dm = G.distXZ(e.pos.x, e.pos.z, bx, bz);
    if (speed > 0.1 && dm < speed * dt * 0.45) {
      e.stuck += dt;
      if (e.stuck > 0.16) {
        e.stuck = 0;
        /* 保持同一侧绕行（绕柱子时才不会来回抵消），只在切向也受阻时换边 */
        e.detourT = G.rand(0.6, 1.3);
      }
    } else if (e.stuck > 0) {
      e.stuck = Math.max(0, e.stuck - dt * 2);
    }
    return dm;
  }

  function enemyLogic(e, dt) {
    var D = e.def;
    e.t += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;

    /* 死亡动画 */
    if (e.dead) {
      updateCorpse(e, dt);
      return;
    }

    var px = player.pos.x, pz = player.pos.z, py = player.pos.y + player.eye;
    var dx = px - e.pos.x, dz = pz - e.pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var sees = canSee(e);
    if (sees) e.alert = 7;
    else e.alert -= dt;

    /* 材质闪烁 */
    if (e.parts && e.parts.head && e.parts.head.material.emissive) {
      e.parts.head.material.emissiveIntensity = e.hitFlash > 0 ? 0.9 : 0;
    }

    /* 朝向 */
    var targetYaw = Math.atan2(dx, dz);
    var dyaw = G.wrapAngle(targetYaw - e.yaw);
    e.yaw += G.clamp(dyaw, -6 * dt, 6 * dt);
    e.mesh.rotation.y = e.yaw + Math.PI;

    if (e.alert <= 0 && !sees) {
      e.state = 'idle';
      e.vel.x = e.vel.z = 0;
      idleAnim(e, dt, 0.3);
      G.moveBody(e, dt);
      return;
    }

    /* 音效 */
    e.soundT -= dt;
    if (e.soundT <= 0 && dist < 26) {
      e.soundT = G.rand(2.5, 7);
      if (e.type === 'headcrab') G.audio.play('headcrab', 0.35);
      else if (e.type === 'zombie') G.audio.play('zombie', 0.4);
      else if (e.type === 'soldier') G.audio.play('combine', 0.3);
    }

    e.cd -= dt;
    /* 被重力枪冲击波掀翻：短暂失去控制，只能被动能推着走 */
    if (e.stun > 0) {
      e.stun -= dt;
      e.vel.x *= 0.90; e.vel.z *= 0.90;
      e.vel.y -= 20 * dt;
      G.moveBody(e, dt);
      idleAnim(e, dt, 0);
      return;
    }
    var moved = 0;
    var dirx = dx / (dist || 1), dirz = dz / (dist || 1);
    e.vel.y -= 20 * dt;                     /* 重力 */
    if (e.vel.y < -45) e.vel.y = -45;

    /* ---------------- 近战型 ---------------- */
    if (!D.ranged && !D.boss) {
      if (e.type === 'headcrab') {
        /* ============ 猎头蟹 ============ */
        e.hopCd -= dt;
        if (e.grounded && e.hopCd <= 0) {
          /* 上一次跳跃前进了多少？没动就换个方向绕 */
          var hopDist = G.distXZ(e.pos.x, e.pos.z, e.hopFromX, e.hopFromZ);
          if (e.hopCount > 0 && hopDist < 0.35) {
            e.stuck += 0.5;
            e.detourSign = Math.random() < 0.5 ? 1 : -1;
          } else e.stuck = Math.max(0, e.stuck - 0.4);
          e.hopFromX = e.pos.x; e.hopFromZ = e.pos.z; e.hopCount = 1;
          var hx = dirx, hz = dirz;
          if (e.stuck > 0.4) { hx = -dirz * e.detourSign; hz = dirx * e.detourSign; }
          e.hopCd = G.rand(0.30, 0.48) * DIF.cd;        /* 跳得更勤 */
          e.vel.y = 4.6;
          e.leapVX = hx * D.speed * DIF.speed * 1.7;
          e.leapVZ = hz * D.speed * DIF.speed * 1.7;
          if (dist < 22 && Math.random() < 0.35) G.audio.play('headcrab', 0.3);
        }
        if (!e.grounded) { e.vel.x = e.leapVX; e.vel.z = e.leapVZ; }
        else { e.vel.x *= 0.55; e.vel.z *= 0.55; }
        /* 中距离飞扑（更远、更快、冷却更短） */
        if (dist < 11 && dist > 2.8 && e.grounded && sees && e.hopCd > 0.16 && e.cd <= 0) {
          e.cd = 1.15 * DIF.cd;
          e.state = 'attack';
          e.vel.y = 6.0;
          e.leapVX = dirx * 13 * DIF.speed; e.leapVZ = dirz * 13 * DIF.speed;
          G.audio.play('headcrab', 0.65);
        }
        G.moveBody(e, dt);

        /* ① 扑击中「接触即咬」——判定用真实体积重叠，跳到你身上才咬得到 */
        if (e.cd <= 0 && !e.grounded && headcrabTouching(e)) {
          e.cd = 1.0 * DIF.cd;
          bitePlayer(e, D.dmg);
        }
        /* ② 落地贴身：短前摇 → 向前一扑 → 按真实触及距离判定（有正锥要求，不会背对着咬） */
        else if (e.cd <= 0 && e.grounded && headcrabTouching(e, 0.75) && sees) {
          e.cd = D.cd * DIF.cd;
          e.state = 'attack';
          e.anim = 0;
          G.audio.play('headcrab', 0.75);
          schedule(0.16, function () {
            if (e.dead || state !== 'playing') return;
            var ddx = player.pos.x - e.pos.x, ddz = player.pos.z - e.pos.z;
            var dd = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
            e.vel.x = ddx / dd * 6.5; e.vel.z = ddz / dd * 6.5;
            if (e.grounded) e.vel.y = 2.4;
            if (headcrabTouching(e, 0.50) && facingPlayer(e, 0.15)) {
              bitePlayer(e, D.dmg);
            } else {
              fx.glow.burst(e.pos.x, e.pos.y + 0.4, e.pos.z, 4, 0xffcc88, 1.6, 0.15, -6);
            }
          });
        }
      } else if (dist > D.melee * 0.85) {
        var sp = D.speed * DIF.speed;
        if (e.type === 'zombie' && Math.abs(dyaw) > 1.4) sp *= 0.45;
        moved = moveSteered(e, dirx, dirz, sp, dt);
      } else {
        /* ============ 僵尸 ============ */
        e.vel.x = e.vel.z = 0;
        G.moveBody(e, dt);
        if (e.cd <= 0 && sees) {
          e.cd = D.cd * DIF.cd;
          e.state = 'attack';
          e.anim = 0;
          G.audio.play('zombie', 0.4);
          schedule(0.34, function () {
            if (e.dead || state !== 'playing') return;
            /* 挥臂：真实臂展 + 垂直重叠 + 正锥，取消原来 +0.9m 的宽松补偿 */
            if (meleeConnects(e, D.melee, 0.75, -0.05)) {
              damagePlayer(D.dmg, e.pos.x, e.pos.y, e.pos.z);
              player.shake = Math.min(1.2, player.shake + 0.25);
            }
          });
        }
      }
      idleAnim(e, dt, moved * 60);
      return;
    }

    /* ---------------- 联合军士兵 ---------------- */
    if (e.type === 'soldier') {
      var mx, mz, msp = D.speed * DIF.speed;
      if (!sees || dist > D.rangeMax) {
        mx = dirx; mz = dirz;                       /* 拉近 */
      } else if (dist < D.rangeMin) {
        mx = -dirx; mz = -dirz; msp = D.speed * DIF.speed * 0.8; /* 拉开 */
      } else {
        var sgn = (e.t % 4 < 2) ? 1 : -1;            /* 横向游走 */
        mx = -dirz * sgn; mz = dirx * sgn; msp = D.speed * DIF.speed * 0.55;
      }
      moveSteered(e, mx, mz, msp, dt);
      /* 射击 */
      e.burstCd -= dt;
      if (sees && dist < D.rangeMax + 4 && e.burstCd <= 0) {
        if (e.burstLeft <= 0) {
          e.burstLeft = D.burst + (difficultyIsHard() ? 1 : 0);
          e.burstCd = (D.cd + G.rand(0.2, 0.7)) * DIF.cd;
        }
        if (e.cd <= 0 && e.burstLeft > 0) {
          e.cd = 0.13 * DIF.cd;
          e.burstLeft--;
          enemyShoot(e);
        }
      }
      idleAnim(e, dt, 20);
      return;
    }

    /* ---------------- 蚁狮守卫（首领） ---------------- */
    if (e.boss) {
      /* 困难以上：血量低于 42% 进入狂暴 */
      var enraged = !!DIF.rage && e.hp < e.maxHp * 0.42;
      if (enraged && !e.enraged) {
        e.enraged = true;
        G.audio.play('reveal', 1);
        say('蚁狮守卫狂暴了！', 3);
      }
      var rageMul = enraged ? 1.35 : 1;
      e.chargeCd -= dt;
      if (e.charge > 0) {
        e.charge -= dt;
        var cx = Math.sin(e.yaw), cz = Math.cos(e.yaw);
        e.vel.x = cx * 16 * DIF.speed * rageMul;
        e.vel.z = cz * 16 * DIF.speed * rageMul;
        G.moveBody(e, dt);
        fx.dust.burst(e.pos.x, e.pos.y + 0.2, e.pos.z, 2, 0x8a7a5a, 2.2, 0.6, -1);
        if (dist < D.melee * (enraged ? 1.2 : 1) && e.cd <= 0) {
          e.cd = D.cd * DIF.cd;
          damagePlayer(D.dmg, e.pos.x, e.pos.y, e.pos.z);
          player.shake = 1.4;
        }
        idleAnim(e, dt, 60);
        return;
      }
      if (e.chargeCd <= 0 && dist > 7 && dist < 24 && sees) {
        e.charge = enraged ? 1.25 : 1.0;
        e.chargeCd = G.rand(4.5, 7) * DIF.cd / rageMul;
        G.audio.play('zombie', 0.9);
        G.audio.play('reveal', 0.5);
        e.mesh.rotation.x = 0;
        return;
      }
      if (dist > D.melee * 0.8) {
        moveSteered(e, dirx, dirz, D.speed * DIF.speed * rageMul, dt);
      } else {
        e.vel.x = e.vel.z = 0;
        G.moveBody(e, dt);
        if (e.cd <= 0 && sees) {
          e.cd = D.cd * DIF.cd;
          G.audio.play('zombie', 1);
          /* 范围震地 */
          fx.flashes.flash(e.pos.x, e.pos.y + 0.5, e.pos.z, 0xaaaa66, 3, 16, 0.25);
          fx.dust.burst(e.pos.x, e.pos.y + 0.2, e.pos.z, 20, 0x9a8a5a, 5, 0.9, -2);
          player.shake = Math.min(1.5, player.shake + 0.8);
          schedule(0.30, function () {
            if (e.dead || state !== 'playing') return;
            /* 震地是全向范围攻击，不做正锥要求 */
            if (meleeConnects(e, D.melee + 1.4, 2.6, -2)) {
              damagePlayer(D.dmg, e.pos.x, e.pos.y, e.pos.z);
            }
          });
        }
      }
      idleAnim(e, dt, 26);
      /* 首领血条 */
      $('bossBar').classList.add('on');
      $('bossFill').style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
      return;
    }
    idleAnim(e, dt, 0);
  }

  function idleAnim(e, dt, speed) {
    var P = e.parts;
    if (!P) return;
    e.anim += dt * (2 + speed * 0.14);
    var s = Math.sin(e.anim);
    var s2 = Math.cos(e.anim * 0.5);
    if (e.type === 'headcrab') {
      for (var i = 0; i < P.legs.length; i++) {
        P.legs[i].rotation.x = s * 0.5 * (i % 2 ? 1 : -1);
      }
    } else if (e.type === 'guard') {
      for (var j = 0; j < P.legs.length; j++) {
        P.legs[j].rotation.x = Math.sin(e.anim + j * 1.6) * 0.45;
      }
      for (var k = 0; k < P.arms.length; k++) {
        P.arms[k].rotation.x = -0.7 + Math.sin(e.anim + k * 3.1) * 0.3;
      }
    } else {
      for (var L = 0; L < P.legs.length; L++) {
        P.legs[L].rotation.x = s * 0.55 * (L % 2 ? 1 : -1);
        P.legs[L].position.z = s * 0.22 * (L % 2 ? 1 : -1);
      }
      for (var A = 0; A < P.arms.length; A++) {
        P.arms[A].rotation.x = (e.type === 'zombie' ? -1.15 : -1.3) + s2 * 0.22 * (A % 2 ? 1 : -1);
      }
    }
  }

  function enemyShoot(e) {
    var D = e.def;
    var a = enemyEye(e);
    var p = eyePos();
    var mx = a.x, my = a.y, mz = a.z;
    var mz2 = e.mesh.userData.muzzle ? e.mesh.userData.muzzle : null;
    if (mz2) {
      var wp = new T.Vector3();
      mz2.getWorldPosition(wp);
      mx = wp.x; my = wp.y; mz = wp.z;
    }
    var dx = p.x - mx, dy = p.y - my, dz = p.z - mz;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    /* 命中率：距离越远越不准 */
    var acc = G.clamp((0.94 - len * 0.012) * DIF.acc, 0.30, 0.95);
    var hit = Math.random() < acc;
    var tx, ty, tz;
    if (hit) { tx = p.x; ty = p.y; tz = p.z; }
    else {
      tx = p.x + G.rand(-1.1, 1.1); ty = p.y + G.rand(-1.0, 1.0); tz = p.z + G.rand(-1.1, 1.1);
    }
    fx.tracers.fire(mx, my, mz, tx, ty, tz, 0x66aaff, 0.028);
    fx.flashes.flash(mx, my, mz, 0x88bbff, 2.2, 12, 0.07);
    G.audio.play('pulse', 0.8);
    if (hit) damagePlayer(D.dmg, mx, my, mz);
    else {
      /* 打偏了：在玩家附近产生弹着 */
      var wh = G.rayWorld(mx, my, mz, (tx - mx) / len, (ty - my) / len, (tz - mz) / len, len);
      if (wh) fx.impact({ x: mx + (tx - mx) / len * wh.t, y: my + (ty - my) / len * wh.t, z: mz + (tz - mz) / len * wh.t }, wh.nx, wh.ny, wh.nz, 'concrete');
    }
  }

  /* =====================================================================
     玩家射击
     ===================================================================== */
  function currentWeaponKey() { return player.has[player.cur]; }
  function currentWeapon() { return WEAPONS[currentWeaponKey()]; }

  function tryFire() {
    var W = currentWeapon();
    if (!W || player.reloading > 0 || player.cd > 0 || state !== 'playing' || player.dead) return;
    if (rig.isInspecting()) rig.anim.inspect = -1;      /* 开火打断检视 */
    var key = currentWeaponKey();

    /* ---------------- 重力枪 ---------------- */
    if (W.kind === 'gravity') {
      player.cd = W.rate;
      player.recoil = Math.min(2.4, player.recoil + 0.25);
      if (gravHeld) launchGrabbed();
      else gravBlast();
      return;
    }

    /* ---------------- 近战（撬棍） ---------------- */
    if (W.kind === 'melee') {
      player.cd = W.rate;
      player.recoil = Math.min(2.4, player.recoil + (W.recoil || 0.4));
      rig.triggerMelee();
      G.audio.play('crowbarSwing', 1);
      stats.shots++;
      alertArea(player.pos.x, player.pos.z, DIF.noise * 0.35);
      /* 等挥击动作打到位置再判定，画面与手感一致 */
      schedule(0.16, function () {
        if (state !== 'playing' || player.dead) return;
        var f = forward(), eye = eyePos();
        for (var i = 0; i < enemies.length; i++) {
          var e = enemies[i];
          if (e.dead) continue;
          var ex = e.pos.x - eye.x, ey = (e.pos.y + e.height * 0.5) - eye.y, ez = e.pos.z - eye.z;
          var d = Math.sqrt(ex * ex + ey * ey + ez * ez);
          if (d > W.range + e.radius) continue;
          if ((ex * f.x + ey * f.y + ez * f.z) / (d || 1) < 0.5) continue;
          var hx = e.pos.x, hy = e.pos.y + e.height * 0.55, hz = e.pos.z;
          damageEnemy(e, W.dmg, false, hx, hy, hz);
          fx.flashes.flash(hx, hy, hz, 0xff6644, 1.2, 8, 0.1);
          player.shake = Math.min(0.6, player.shake + 0.18);
          return;
        }
        var wh = G.rayWorld(eye.x, eye.y, eye.z, f.x, f.y, f.z, W.range);
        if (wh) {
          var px = eye.x + f.x * wh.t, py = eye.y + f.y * wh.t, pz = eye.z + f.z * wh.t;
          fx.glow.burst(px, py, pz, 8, 0xffcc66, 3, 0.25, -10, wh.nx, wh.ny, wh.nz, 0.7);
          G.audio.play('crowbarHit', 0.9);
          explodeBarrelAt(px, py, pz, 20);
        }
      });
      return;
    }

    /* ---------------- 射线武器 ---------------- */
    var clip = player.clip[key];
    if (clip <= 0) { G.audio.play('deny', 0.9); player.cd = 0.25; return; }
    player.clip[key] = clip - 1;
    player.cd = W.rate;
    player.recoil = Math.min(2.4, player.recoil + (W.recoil || 0.4));
    rig.triggerFire();
    G.audio.play(W.sound, 1);
    fx.flashes.flash(player.pos.x, player.pos.y + player.eye, player.pos.z, 0xffcc66, 2.4, 14, 0.06);
    stats.shots++;
    alertArea(player.pos.x, player.pos.z, DIF.noise);

    var f2 = forward(), eye2 = eyePos();
    var sx = eye2.x + f2.x * 0.3, sy = eye2.y + f2.y * 0.3, sz = eye2.z + f2.z * 0.3;
    var pellets = W.pellets || 1;
    var maxHits = W.pierce || 1;

    for (var p = 0; p < pellets; p++) {
      var sp = W.spread * (pellets > 1 ? 1.6 : 1);
      var dx = f2.x + G.rand(-sp, sp), dy = f2.y + G.rand(-sp, sp), dz = f2.z + G.rand(-sp, sp);
      var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;

      var wh2 = G.rayWorld(sx, sy, sz, dx, dy, dz, W.range);
      var wallT = wh2 ? wh2.t : W.range;
      var nx = wh2 ? wh2.nx : 0, ny = wh2 ? wh2.ny : 0, nz = wh2 ? wh2.nz : 0;

      /* 收集这条线上的所有敌人（支持穿透） */
      var hits = [];
      for (var j = 0; j < enemies.length; j++) {
        var en = enemies[j];
        if (en.dead) continue;
        var assist = touchMode ? 1.45 : 1.0;      /* 触屏瞄准辅助 */
        var hr = (en.type === 'guard' ? 0.55 : 0.19) * assist;
        var hy = en.pos.y + en.height * (en.type === 'guard' ? 0.95 : 0.93);
        var th = raySphere(sx, sy, sz, dx, dy, dz, en.pos.x, hy, en.pos.z, hr);
        var tb = raySphere(sx, sy, sz, dx, dy, dz, en.pos.x, en.pos.y + en.height * 0.5, en.pos.z, en.radius * 1.05 * assist);
        var t = -1, head = false;
        if (th >= 0 && tb >= 0) { if (th < tb) { t = th; head = true; } else t = tb; }
        else if (th >= 0) { t = th; head = true; }
        else if (tb >= 0) t = tb;
        if (t >= 0 && t < wallT) hits.push({ e: en, t: t, head: head });
      }
      hits.sort(function (a, b) { return a.t - b.t; });

      var nh = Math.min(maxHits, hits.length);
      var endT = nh > 0 ? hits[nh - 1].t : wallT;
      fx.tracers.fire(sx, sy, sz, sx + dx * endT, sy + dy * endT, sz + dz * endT,
        W.tracer, W.bolt ? 0.028 : (pellets > 1 ? 0.012 : 0.018));
      if (W.bolt) spawnBolt(sx, sy, sz, dx, dy, dz, endT);

      for (var hh = 0; hh < nh; hh++) {
        var hx2 = sx + dx * hits[hh].t, hy2 = sy + dy * hits[hh].t, hz2 = sz + dz * hits[hh].t;
        damageEnemy(hits[hh].e, W.dmg * (hits[hh].head ? 3 : 1), hits[hh].head, hx2, hy2, hz2);
        if (hits[hh].head && W.dmg >= 40) say('爆头！', 1.0);
      }
      if (wallT < W.range && nh < maxHits) {
        var wx = sx + dx * wallT, wy = sy + dy * wallT, wz = sz + dz * wallT;
        fx.impact({ x: wx, y: wy, z: wz }, nx, ny, nz, 'concrete');
        explodeBarrelAt(wx, wy, wz, 26);
      }
    }
  }

  /* =====================================================================
     副武器：AR2 能量球（鼠标右键）
     ===================================================================== */
  function tryAltFire() {
    var W = currentWeapon();
    if (!W || !W.alt || state !== 'playing' || player.dead || player.cd > 0) return;
    var key = currentWeaponKey();
    if (player.clip[key] < W.alt.cost) { G.audio.play('deny', 0.9); player.cd = 0.3; return; }
    player.clip[key] -= W.alt.cost;
    player.cd = 0.9;
    player.recoil = Math.min(2.4, player.recoil + 1.6);
    rig.triggerAlt();
    G.audio.play(W.alt.sound, 1);
    alertArea(player.pos.x, player.pos.z, DIF.noise * 1.3);
    var f = forward(), eye = eyePos();
    spawnOrb(eye.x + f.x * 0.6, eye.y + f.y * 0.6, eye.z + f.z * 0.6, f, W.alt);
  }

  /* =====================================================================
     飞行物：能量球 / 弩箭
     ===================================================================== */
  function spawnOrb(x, y, z, f, alt) {
    var m = new T.Mesh(new T.SphereGeometry(0.15, 12, 10), new T.MeshBasicMaterial({
      color: 0xaaeeff, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false
    }));
    m.position.set(x, y, z);
    var halo = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), new T.MeshBasicMaterial({
      color: 0x3399ff, transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false
    }));
    m.add(halo);
    worldRoot.add(m);
    projectiles.push({
      kind: 'orb', mesh: m, pos: { x: x, y: y, z: z },
      dir: { x: f.x, y: f.y, z: f.z }, speed: 36, life: 6,
      dmg: alt.dmg, splash: alt.splash, splashDmg: alt.splashDmg
    });
    fx.flashes.flash(x, y, z, 0x66ccff, 2.6, 14, 0.12);
  }

  function spawnBolt(sx, sy, sz, dx, dy, dz, len) {
    var m = new T.Mesh(new T.CylinderGeometry(0.013, 0.013, 0.6, 6), G.plain(0x6a6a6a, { shin: 80, spec: 0xaaaaaa }));
    var back = Math.max(0.3, len - 0.28);
    m.position.set(sx + dx * back, sy + dy * back, sz + dz * back);
    m.lookAt(sx + dx * len, sy + dy * len, sz + dz * len);
    m.rotateX(Math.PI / 2);
    worldRoot.add(m);
    projectiles.push({ kind: 'bolt', mesh: m, life: 7, pos: { x: m.position.x, y: m.position.y, z: m.position.z } });
  }

  function orbExplode(p, x, y, z) {
    worldRoot.remove(p.mesh);
    var idx = projectiles.indexOf(p);
    if (idx >= 0) projectiles.splice(idx, 1);
    fx.explode(x, y, z, 0.9);
    fx.flashes.flash(x, y, z, 0x66ccff, 5, 26, 0.3);
    alertArea(x, z, 30);
    radialDamage(x, y, z, p.splash, p.splashDmg, true);
    var L = G.level;
    for (var b = 0; b < L.barrels.length; b++) {
      var bb = L.barrels[b];
      if (bb.exploded) continue;
      var d2 = (bb.mesh.position.x - x) * (bb.mesh.position.x - x) + (bb.mesh.position.z - z) * (bb.mesh.position.z - z);
      if (d2 < 20) explodeBarrel(bb);
    }
    player.shake = Math.min(1.4, player.shake + 0.5);
  }

  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        worldRoot.remove(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }
      if (p.kind !== 'orb') continue;
      var step = p.speed * dt;
      var bestT = step, hitE = null;
      for (var j = 0; j < enemies.length; j++) {
        var e = enemies[j];
        if (e.dead) continue;
        var t = raySphere(p.pos.x, p.pos.y, p.pos.z, p.dir.x, p.dir.y, p.dir.z,
          e.pos.x, e.pos.y + e.height * 0.5, e.pos.z, e.radius + 0.22);
        if (t >= 0 && t < bestT) { bestT = t; hitE = e; }
      }
      var wh = G.rayWorld(p.pos.x, p.pos.y, p.pos.z, p.dir.x, p.dir.y, p.dir.z, bestT);
      if (wh) {
        orbExplode(p, p.pos.x + p.dir.x * wh.t, p.pos.y + p.dir.y * wh.t, p.pos.z + p.dir.z * wh.t);
      } else if (hitE) {
        var ix = p.pos.x + p.dir.x * bestT, iy = p.pos.y + p.dir.y * bestT, iz = p.pos.z + p.dir.z * bestT;
        damageEnemy(hitE, p.dmg, false, ix, iy, iz);
        orbExplode(p, ix, iy, iz);
      } else {
        p.pos.x += p.dir.x * step;
        p.pos.y += p.dir.y * step;
        p.pos.z += p.dir.z * step;
        p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        fx.glow.burst(p.pos.x, p.pos.y, p.pos.z, 2, 0x88ddff, 0.8, 0.28, -1);
      }
    }
  }

  /* =====================================================================
     重力枪：抓取 / 投掷 / 冲击波
     ===================================================================== */
  function resetProps() {
    var all = (G.level && G.level.props) || [];
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      p.vel = { x: 0, y: 0, z: 0 };
      p.thrown = false;
      p.held = false;
      p.vx = 0;
      if (p.solid) { p.solid.ignore = !!p.exploded; syncPropSolid(p); }
    }
    gravHeld = null;
  }

  function syncPropSolid(p) {    var s = p.solid, m = p.mesh;
    if (!s) return;
    s.min.x = m.position.x - p.hw; s.max.x = m.position.x + p.hw;
    s.min.y = m.position.y - p.hh; s.max.y = m.position.y + p.hh;
    s.min.z = m.position.z - p.hw; s.max.z = m.position.z + p.hw;
  }

  /* ---------- 可抓取对象统一处理：道具 / 尸体 / 掉落物 ---------- */

  /** 对象的抓取中心点（尸体躺着，中心要抬起来） */
  function gravCenter(o, type) {
    if (type === 'corpse') {
      return { x: o.pos.x, y: o.pos.y + (o.meshYOff || 0.2) + 0.25, z: o.pos.z };
    }
    return o.mesh.position;
  }

  var ITEM_LABEL = {
    medkit: '医疗包', battery: '电池', grenade: '手雷',
    ammo_pistol: '弹药', ammo_smg: '弹药', ammo_shotgun: '霰弹',
    ammo_magnum: '.357 弹药', ammo_crossbow: '弩箭', ammo_ar2: '脉冲弹药'
  };
  var PROP_LABEL = { crate: '木箱', barrel: '油桶', bench: '实验台' };

  /** 汇总当前场景里所有可抓取的对象 */
  function gravCandidates() {
    var list = [], i, o, c;
    var props = (G.level && G.level.props) || [];
    for (i = 0; i < props.length; i++) {
      o = props[i];
      if (o.exploded || o.held) continue;
      list.push({ o: o, type: 'prop', hw: o.hw, hh: o.hh, c: o.mesh.position });
    }
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      if (!o.dead || o.held || o.flying || o.mesh.visible === false) continue;
      c = gravCenter(o, 'corpse');
      list.push({ o: o, type: 'corpse', hw: Math.max(0.45, o.radius), hh: o.height * 0.45, c: c });
    }
    var items = (G.level && G.level.pickups) || [];
    for (i = 0; i < items.length; i++) {
      o = items[i];
      if (o.taken || o.held || o.flying) continue;
      list.push({ o: o, type: 'item', hw: 0.28, hh: 0.28, c: o.mesh.position });
    }
    return list;
  }

  function findGrabTarget(range) {
    var f = forward(), eye = eyePos();
    var cands = gravCandidates();
    var best = null, bestT = range;
    var wall = G.rayWorld(eye.x, eye.y, eye.z, f.x, f.y, f.z, range);
    for (var i = 0; i < cands.length; i++) {
      var k = cands[i], c = k.c;
      var dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > range + k.hw) continue;
      if ((dx * f.x + dy * f.y + dz * f.z) / (dist || 1) < 0.82) continue;
      if (wall && wall.t < dist - k.hw - 0.05) continue;
      if (dist < bestT) { bestT = dist; best = k; }
    }
    return best;
  }

  function grabProp(k) {
    if (!k) return;
    var o = k.o;
    gravHeld = k;
    o.held = true;
    if (k.type === 'prop') {
      o.vel.x = o.vel.y = o.vel.z = 0;
      if (o.solid) o.solid.ignore = true;
      toast(o.explosive ? '已抓住：爆炸桶（左键投掷）' : '已抓住：' + (PROP_LABEL[o.kind] || '物体'), 'good');
    } else if (k.type === 'corpse') {
      toast('已抓住：尸体（左键抛出去砸人）', 'good');
    } else {
      toast('已抓住：' + (G.WEAPONS[o.type] ? G.WEAPONS[o.type].name : (ITEM_LABEL[o.type] || '物品')), 'good');
      o.gravPhase = 'pull';
    }
    G.audio.play('gravPull', 1);
    var c = gravCenter(o, k.type);
    fx.glow.burst(c.x, c.y, c.z, 14, 0x66ddff, 4, 0.4, -2);
  }

  function dropGrabbed() {
    if (!gravHeld) return;
    var k = gravHeld, o = k.o;
    o.held = false;
    if (k.type === 'prop') {
      if (o.solid) { o.solid.ignore = false; syncPropSolid(o); }
    } else {
      /* 尸体与掉落物放开后自然落地 */
      o.flying = true;
      o.vel = { x: 0, y: -1, z: 0 };
      o.spinSign = Math.random() < 0.5 ? 1 : -1;
    }
    gravHeld = null;
  }

  function launchGrabbed() {
    var k = gravHeld;
    if (!k) return;
    var o = k.o, f = forward(), eye = eyePos();
    o.held = false;
    if (k.type === 'prop') {
      if (o.solid) { o.solid.ignore = false; syncPropSolid(o); }
      o.thrown = true;
      o.vel.x = f.x * 30; o.vel.y = f.y * 30 + 2.2; o.vel.z = f.z * 30;
    } else if (k.type === 'corpse') {
      o.flying = true;
      o.vel = { x: f.x * 26, y: f.y * 26 + 2.6, z: f.z * 26 };
    } else {
      o.flying = true;
      o.vel = { x: f.x * 22, y: f.y * 22 + 3.0, z: f.z * 22 };
    }
    o.spinSign = Math.random() < 0.5 ? 1 : -1;
    gravHeld = null;
    G.audio.play('gravLaunch', 1);
    player.shake = Math.min(0.8, player.shake + 0.22);
    fx.flashes.flash(eye.x + f.x * 1.2, eye.y + f.y * 1.2, eye.z + f.z * 1.2, 0x66ddff, 3, 16, 0.15);
    fx.glow.burst(eye.x + f.x * 1.2, eye.y + f.y * 1.2, eye.z + f.z * 1.2, 10, 0x88eeff, 6, 0.3, -2);
  }

  function updateGrabbed(dt) {
    if (!gravHeld) return;
    var k = gravHeld, o = k.o;
    var f = forward(), eye = eyePos();
    var holdDist = (k.type === 'item') ? 1.9 : 2.3;
    var tx = eye.x + f.x * holdDist, ty = eye.y + f.y * holdDist, tz = eye.z + f.z * holdDist;
    var c = gravCenter(o, k.type);
    var kk = 1 - Math.exp(-14 * dt);
    var nx = c.x + (tx - c.x) * kk;
    var ny = c.y + (ty - c.y) * kk;
    var nz = c.z + (tz - c.z) * kk;

    if (k.type === 'prop') {
      o.mesh.position.set(nx, ny, nz);
      o.mesh.rotation.y += dt * 0.9;
      syncPropSolid(o);
    } else if (k.type === 'corpse') {
      /* 尸体：直接改 pos，模型位置由统一同步逻辑接管 */
      o.pos.x = nx; o.pos.y = ny; o.pos.z = nz;
      o.mesh.rotation.y += dt * 1.4;
      o.mesh.rotation.z += dt * 0.55;
    } else {
      /* 掉落物：先用猛拉方式吸到手上，够近再判定拾取 */
      if (!o.gravPhase) o.gravPhase = 'pull';
      if (o.gravPhase === 'pull') {
        var pdx = eye.x - o.mesh.position.x;
        var pdy = (eye.y - 0.3) - o.mesh.position.y;
        var pdz = eye.z - o.mesh.position.z;
        var pd = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz) || 1;
        var step = Math.min(pd, 17 * dt);
        o.mesh.position.x += pdx / pd * step;
        o.mesh.position.y += pdy / pd * step;
        o.mesh.position.z += pdz / pd * step;
        o.mesh.rotation.y += dt * 7;
        if (pd < 1.3) {
          if (applyPickup(o)) {
            o.taken = true;
            o.held = false;
            worldRoot.remove(o.mesh);
            gravHeld = null;
            G.audio.play('gravLaunch', 0.6);
            return;
          }
          /* 拿不了（血满 / 甲满）就拎在手里，可以扔出去 */
          o.gravPhase = 'hold';
          toast('无需补充，已拎在手中（左键扔出）');
        }
      } else {
        o.mesh.position.set(nx, ny, nz);
        o.mesh.rotation.y += dt * 1.2;
      }
    }
    if (Math.random() < 0.35) fx.glow.burst(nx, ny, nz, 1, 0x66ddff, 1.0, 0.3, 0);
  }

  function gravBlast() {
    var f = forward(), eye = eyePos();
    G.audio.play('gravBlast', 1);
    fx.flashes.flash(eye.x + f.x * 1.5, eye.y + f.y * 1.5, eye.z + f.z * 1.5, 0x66ddff, 3.5, 18, 0.2);
    fx.glow.burst(eye.x + f.x * 1.2, eye.y + f.y * 1.2, eye.z + f.z * 1.2, 26, 0x88eeff, 10, 0.35, -3, f.x, f.y, f.z, 0.8);
    var all = (G.level && G.level.props) || [];
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.exploded || p.held) continue;
      var dx = p.mesh.position.x - eye.x, dy = p.mesh.position.y - eye.y, dz = p.mesh.position.z - eye.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 7) continue;
      if ((dx * f.x + dy * f.y + dz * f.z) / (d || 1) < 0.55) continue;
      var pw = 20 * (1 - d / 7);
      p.vel.x += dx / d * pw; p.vel.y += dy / d * pw + 4; p.vel.z += dz / d * pw;
      p.spinSign = Math.random() < 0.5 ? 1 : -1;
    }
    for (var j = 0; j < enemies.length; j++) {
      var e = enemies[j];
      if (e.dead) continue;
      var ex = e.pos.x - eye.x, ey = (e.pos.y + e.height * 0.5) - eye.y, ez = e.pos.z - eye.z;
      var ed = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (ed > 6) continue;
      if ((ex * f.x + ey * f.y + ez * f.z) / (ed || 1) < 0.5) continue;
      damageEnemy(e, 8, false, e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
      e.alert = 9;
      e.stun = Math.max(e.stun || 0, 0.55);            /* 被掀得踉跄一下 */
      var kb = 9 * (1 - ed / 6);
      e.vel.x += ex / ed * kb; e.vel.z += ez / ed * kb;
    }
    /* 尸体与地上的掉落物也会被吹飞 */
    knockBlast(f, eye, 7, 10, 0.55);
    player.shake = Math.min(1.0, player.shake + 0.28);
  }

  /** 冲击波：把锥形范围内的尸体和掉落物吹开 */
  function knockBlast(f, eye, radius, power, minDot) {
    var i, o, dx, dy, dz, d;
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      if (!o.dead || o.held || o.flying) continue;
      dx = o.pos.x - eye.x; dy = (o.pos.y + 0.3) - eye.y; dz = o.pos.z - eye.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      if ((dx * f.x + dy * f.y + dz * f.z) / (d || 1) < minDot) continue;
      o.flying = true;
      o.vel = { x: dx / d * power, y: 3.4, z: dz / d * power };
      o.spinSign = Math.random() < 0.5 ? 1 : -1;
    }
    var items = (G.level && G.level.pickups) || [];
    for (i = 0; i < items.length; i++) {
      o = items[i];
      if (o.taken || o.held || o.flying) continue;
      dx = o.mesh.position.x - eye.x; dy = o.mesh.position.y - eye.y; dz = o.mesh.position.z - eye.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      if ((dx * f.x + dy * f.y + dz * f.z) / (d || 1) < minDot) continue;
      o.flying = true;
      o.vel = { x: dx / d * power * 0.9, y: 3.0, z: dz / d * power * 0.9 };
      o.spinSign = 1;
    }
  }

  /** 被投掷的道具：物理 + 砸伤敌人 + 撞墙 */
  function updateProps(dt) {
    var all = (G.level && G.level.props) || [];
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.held || p.exploded) continue;
      var v = p.vel;
      if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.05) continue;
      v.y -= 20 * dt;
      var body = {
        pos: { x: p.mesh.position.x, y: p.mesh.position.y - p.hh, z: p.mesh.position.z },
        vel: { x: v.x, y: v.y, z: v.z },
        radius: p.hw, height: p.hh * 2, grounded: false, stepHeight: 0
      };
      var pre = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      /* 关键：道具自己的碰撞体也在世界列表里，推进时必须临时屏蔽，
         否则它会和自己重叠并被逐帧向上推出（表现为箱子「火箭升空」） */
      if (p.solid) p.solid.ignore = true;
      G.moveBody(body, dt);
      if (p.solid) p.solid.ignore = false;
      p.mesh.position.set(body.pos.x, body.pos.y + p.hh, body.pos.z);
      if (p.ring) p.ring.position.copy(p.mesh.position);
      p.mesh.rotation.y += dt * 2.4 * (p.spinSign || 1);
      p.mesh.rotation.x += dt * 3.0 * (p.spinSign || 1);
      syncPropSolid(p);
      var post = Math.sqrt(body.vel.x * body.vel.x + body.vel.y * body.vel.y + body.vel.z * body.vel.z);
      var impact = pre - post;

      /* 砸到敌人 */
      var hitE = null;
      if (pre > 5) {
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (e.dead) continue;
          var dx = e.pos.x - p.mesh.position.x, dz = e.pos.z - p.mesh.position.z;
          var dy = (e.pos.y + e.height * 0.5) - p.mesh.position.y;
          var rr = e.radius + p.hw + 0.2;
          if (dx * dx + dy * dy + dz * dz < rr * rr) { hitE = e; break; }
        }
      }
      if (hitE) {
        var dmg = Math.min(150, pre * 2.6);
        fx.flashes.flash(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0x88ddff, 3, 14, 0.15);
        damageEnemy(hitE, dmg, false, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
        G.audio.play('flesh', 1);
        /* 爆炸桶砸到敌人直接炸 */
        if (p.explosive) { explodeBarrel(p.barrel || p); continue; }
        body.vel.x *= -0.25; body.vel.z *= -0.25; body.vel.y = Math.max(1.5, body.vel.y * -0.2);
      }

      /* 撞击声 / 爆炸桶 / 弹跳 */
      if (impact > 6) {
        fx.dust.burst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 6, 0x9a9a90, 2.2, 0.5, -3);
        G.audio.play('land', Math.min(1, impact / 20));
        if (p.explosive && impact > 8) {
          explodeBarrel(p.barrel || p);
          continue;
        }
        body.vel.x *= 0.45; body.vel.z *= 0.45;
        if (Math.abs(body.vel.y) < 2.2) body.vel.y = 0;
      }
      v.x = body.vel.x; v.y = body.vel.y; v.z = body.vel.z;
      /* 撞飞旁边的尸体和掉落物 */
      if (impact > 6 || hitE) {
        var i2, o2;
        for (i2 = 0; i2 < enemies.length; i2++) {
          o2 = enemies[i2];
          if (!o2.dead || o2.held || o2.flying) continue;
          var kx = o2.pos.x - p.mesh.position.x, kz = o2.pos.z - p.mesh.position.z;
          var kd = Math.sqrt(kx * kx + kz * kz);
          if (kd > p.hw + 1.0) continue;
          o2.flying = true;
          o2.vel = { x: kx / (kd || 1) * pre * 0.22, y: 2.8, z: kz / (kd || 1) * pre * 0.22 };
          o2.spinSign = Math.random() < 0.5 ? 1 : -1;
        }
        var it2 = (G.level && G.level.pickups) || [];
        for (i2 = 0; i2 < it2.length; i2++) {
          o2 = it2[i2];
          if (o2.taken || o2.held || o2.flying) continue;
          var ix = o2.mesh.position.x - p.mesh.position.x, iz = o2.mesh.position.z - p.mesh.position.z;
          var id2 = Math.sqrt(ix * ix + iz * iz);
          if (id2 > p.hw + 0.8) continue;
          o2.flying = true;
          o2.vel = { x: ix / (id2 || 1) * pre * 0.25, y: 2.4, z: iz / (id2 || 1) * pre * 0.25 };
        }
      }
      if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.2) {
        v.x = v.y = v.z = 0;
        p.mesh.rotation.x = 0;
      }
    }
  }

  /** 被抛出的尸体：飞行 → 砸人 → 落地恢复躺姿 */
  function updateFlyingCorpses(dt) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.dead || !e.flying) continue;
      var v = e.vel;
      v.y -= 20 * dt;
      var body = {
        pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z },
        vel: { x: v.x, y: v.y, z: v.z },
        radius: Math.max(0.45, e.radius), height: Math.max(0.5, e.height * 0.45),
        grounded: false, stepHeight: 0
      };
      var pre = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      G.moveBody(body, dt);
      e.pos.x = body.pos.x; e.pos.y = body.pos.y; e.pos.z = body.pos.z;
      e.mesh.rotation.x += dt * 3.2 * (e.spinSign || 1);
      e.mesh.rotation.y += dt * 5.0 * (e.spinSign || 1);
      /* 砸到活体 */
      if (pre > 6) {
        for (var j = 0; j < enemies.length; j++) {
          var o = enemies[j];
          if (o.dead || o === e) continue;
          var dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z;
          var dy = (o.pos.y + o.height * 0.5) - (e.pos.y + 0.4);
          var rr = o.radius + Math.max(0.45, e.radius) + 0.2;
          if (dx * dx + dy * dy + dz * dz < rr * rr) {
            damageEnemy(o, Math.min(120, pre * 2.4), false, o.pos.x, o.pos.y + o.height * 0.5, o.pos.z);
            G.audio.play('flesh', 1);
            body.vel.x *= -0.2; body.vel.z *= -0.2;
            break;
          }
        }
      }
      var post = Math.sqrt(body.vel.x * body.vel.x + body.vel.y * body.vel.y + body.vel.z * body.vel.z);
      if (pre - post > 6) {
        fx.dust.burst(e.pos.x, e.pos.y + 0.2, e.pos.z, 6, 0x9a9a90, 2.0, 0.5, -3);
        G.audio.play('thud', 0.8);
      }
      v.x = body.vel.x; v.y = body.vel.y; v.z = body.vel.z;
      if (post < 1.4) {
        e.flying = false;
        e.vel = { x: 0, y: 0, z: 0 };
        settleCorpse(e);
      }
    }
  }

  /** 尸体落定：恢复该类型的躺平姿态 */
  function settleCorpse(e) {
    var D = DEATH_POSE[e.type] || DEATH_POSE.zombie;
    e.flying = false;
    e.mesh.rotation.set(D.tilt, e.yaw + Math.PI + (e.fallYaw || 0), D.roll * (e.fallSign || 1));
    e.meshYOff = D.yOff;
    e.landed = true;
  }

  /** 被抛出的掉落物：飞行 → 落地 → 恢复可拾取 */
  function updateItems(dt) {
    var items = (G.level && G.level.pickups) || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.taken || it.held || !it.flying) continue;
      var v = it.vel;
      v.y -= 20 * dt;
      var body = {
        pos: { x: it.mesh.position.x, y: it.mesh.position.y - 0.16, z: it.mesh.position.z },
        vel: { x: v.x, y: v.y, z: v.z },
        radius: 0.16, height: 0.32, grounded: false, stepHeight: 0
      };
      G.moveBody(body, dt);
      it.mesh.position.set(body.pos.x, body.pos.y + 0.16, body.pos.z);
      it.mesh.rotation.x += dt * 6;
      v.x = body.vel.x; v.y = body.vel.y; v.z = body.vel.z;
      if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.8) {
        it.flying = false;
        v.x = v.y = v.z = 0;
        it.baseY = it.mesh.position.y;
        it.phase = 0;
        it.mesh.rotation.x = 0;
      }
    }
  }

  function explodeBarrelAt(x, y, z, dmg) {
    var L = G.level;
    for (var i = 0; i < L.barrels.length; i++) {
      var b = L.barrels[i];
      if (b.exploded) continue;
      var dx = b.mesh.position.x - x, dy = b.mesh.position.y - y, dz = b.mesh.position.z - z;
      if (dx * dx + dy * dy + dz * dz < 0.36) {
        explodeBarrel(b);
        return true;
      }
    }
    return false;
  }

  function explodeBarrel(b) {
    if (b.exploded) return;
    b.exploded = true;
    b.mesh.visible = false;
    if (b.ring) b.ring.visible = false;
    if (b.solid) b.solid.ignore = true;
    var s = b.mesh.position;
    G.world.solids.forEach(function (sd) {
      if (sd === b.solid) return;
      if (Math.abs((sd.min.x + sd.max.x) / 2 - s.x) < 0.2 &&
          Math.abs((sd.min.z + sd.max.z) / 2 - s.z) < 0.2 &&
          Math.abs((sd.min.y + sd.max.y) / 2 - s.y) < 0.2) sd.ignore = true;
    });
    fx.explode(s.x, s.y, s.z, 1.25);
    alertArea(s.x, s.z, 36);
    radialDamage(s.x, s.y, s.z, 6.5, 95, true);
    /* 把周围尸体和掉落物炸飞 */
    var i2, o2, kx, kz, kd;
    for (i2 = 0; i2 < enemies.length; i2++) {
      o2 = enemies[i2];
      if (!o2.dead || o2.held || o2.flying) continue;
      kx = o2.pos.x - s.x; kz = o2.pos.z - s.z;
      kd = Math.sqrt(kx * kx + kz * kz);
      if (kd > 7) continue;
      o2.flying = true;
      o2.vel = { x: kx / (kd || 1) * 13, y: 4.5, z: kz / (kd || 1) * 13 };
      o2.spinSign = Math.random() < 0.5 ? 1 : -1;
    }
    player.shake = Math.min(1.6, player.shake + 0.9);

    /* 连锁引爆：附近的油桶会被掀爆（延迟一点点，像引信传递） */
    var L2 = G.level, chain = [];
    for (var ci = 0; ci < L2.barrels.length; ci++) {
      var ob = L2.barrels[ci];
      if (ob === b || ob.exploded) continue;
      var cdx = ob.mesh.position.x - s.x, cdz = ob.mesh.position.z - s.z;
      if (cdx * cdx + cdz * cdz < 34) chain.push(ob);
    }
    for (var cj = 0; cj < chain.length; cj++) {
      (function (ob) {
        schedule(0.12 + Math.random() * 0.2, function () { explodeBarrel(ob); });
      })(chain[cj]);
    }
  }

  function radialDamage(x, y, z, radius, dmg, hitPlayer) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var d = Math.sqrt((e.pos.x - x) * (e.pos.x - x) + (e.pos.y + e.height / 2 - y) * (e.pos.y + e.height / 2 - y) + (e.pos.z - z) * (e.pos.z - z));
      if (d < radius) {
        var f = 1 - d / radius;
        damageEnemy(e, dmg * f, false, e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
      }
    }
    if (hitPlayer) {
      var dp = Math.sqrt((player.pos.x - x) * (player.pos.x - x) + (player.pos.y + 0.9 - y) * (player.pos.y + 0.9 - y) + (player.pos.z - z) * (player.pos.z - z));
      if (dp < radius * 1.15) damagePlayer(dmg * (1 - dp / (radius * 1.15)) * 0.55, x, y, z);
    }
  }

  /* =====================================================================
     手雷
     ===================================================================== */
  function throwGrenade() {
    if (player.grenades <= 0) { G.audio.play('deny', 0.8); return; }
    player.grenades--;
    var f = forward(), eye = eyePos();
    var m = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), G.plain(0x4b5a3a, { shin: 40 }));
    m.position.set(eye.x + f.x * 0.5, eye.y + f.y * 0.5, eye.z + f.z * 0.5);
    worldRoot.add(m);
    grenades.push({
      mesh: m, pos: { x: m.position.x, y: m.position.y, z: m.position.z },
      vel: { x: f.x * 15 + player.vel.x * 0.6, y: f.y * 15 + 3.2, z: f.z * 15 + player.vel.z * 0.6 },
      fuse: 2.7
    });
    G.audio.play('crowbarSwing', 0.5);
  }

  function updateGrenades(dt) {
    for (var i = grenades.length - 1; i >= 0; i--) {
      var g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 20 * dt;
      var nx = g.pos.x + g.vel.x * dt, ny = g.pos.y + g.vel.y * dt, nz = g.pos.z + g.vel.z * dt;
      /* 只用 moveBody 做「碰撞解算」：速度置零，否则它会再按 dt 位移一次
         （旧代码写的是 moveBody(body, 1)，手雷每帧被多推 ~15 米，在屋里乱弹） */
      var body = {
        pos: { x: nx, y: ny - 0.12, z: nz },
        vel: { x: 0, y: 0, z: 0 },
        radius: 0.12, height: 0.24, grounded: false, stepHeight: 0
      };
      G.moveBody(body, 1);
      var rx = body.pos.x, ry = body.pos.y, rz = body.pos.z;
      if (Math.abs(rx - nx) > 1e-6) g.vel.x *= -0.45;
      if (Math.abs(rz - nz) > 1e-6) g.vel.z *= -0.45;
      if (Math.abs(ry - (ny - 0.12)) > 1e-6) {
        if (g.vel.y < 0) {
          g.vel.y *= -0.42;
          if (Math.abs(g.vel.y) < 0.9) g.vel.y = 0;
        } else g.vel.y = 0;
        g.vel.x *= 0.72; g.vel.z *= 0.72;
      }
      g.pos.x = rx; g.pos.y = ry + 0.12; g.pos.z = rz;
      g.mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
      if (g.fuse <= 0) {
        worldRoot.remove(g.mesh);
        fx.explode(g.pos.x, g.pos.y, g.pos.z, 1.5);
        alertArea(g.pos.x, g.pos.z, 36);
        radialDamage(g.pos.x, g.pos.y, g.pos.z, 8, 145, true);
        /* 引爆附近油桶 */
        var L = G.level;
        for (var b = 0; b < L.barrels.length; b++) {
          var bb = L.barrels[b];
          if (bb.exploded) continue;
          var d2 = (bb.mesh.position.x - g.pos.x) * (bb.mesh.position.x - g.pos.x) +
                   (bb.mesh.position.z - g.pos.z) * (bb.mesh.position.z - g.pos.z);
          if (d2 < 30) explodeBarrel(bb);
        }
        player.shake = Math.min(1.8, player.shake + 1.1);
        grenades.splice(i, 1);
      }
    }
  }

  /* =====================================================================
     玩家更新
     ===================================================================== */
  function updatePlayer(dt) {
    var P = player;
    /* 蹲下 */
    P.crouch = !!keys['ControlLeft'] || !!keys['KeyC'];
    P.targetHeight = P.crouch ? 1.22 : 1.72;
    var wantEye = P.crouch ? 1.06 : 1.62;
    P.height = G.smooth(P.height, P.targetHeight, 12, dt);
    P.eye = G.smooth(P.eye, wantEye, 12, dt);

    /* 输入方向 */
    var f = 0, s = 0;
    if (keys['KeyW']) f += 1;
    if (keys['KeyS']) f -= 1;
    if (keys['KeyD']) s += 1;
    if (keys['KeyA']) s -= 1;
    var len = Math.sqrt(f * f + s * s);
    if (len > 0) { f /= len; s /= len; }

    var sprint = !!keys['ShiftLeft'] && !P.crouch && f > 0;
    P.sprinting = sprint;
    var speed = P.crouch ? 2.1 : (sprint ? 7.4 : 4.7);
    if (P.dead) speed = 0;

    var sinY = Math.sin(P.yaw), cosY = Math.cos(P.yaw);
    var wx = (-sinY * f + cosY * s) * speed;
    var wz = (-cosY * f - sinY * s) * speed;

    var accel = P.grounded ? 14 : 3.2;
    P.vel.x = G.smooth(P.vel.x, wx, accel, dt);
    P.vel.z = G.smooth(P.vel.z, wz, accel, dt);

    /* 跳跃 */
    if (keys['Space'] && P.grounded && !P.dead) {
      P.vel.y = 7.0;
      P.grounded = false;
      G.audio.play('jump', 0.7);
    }
    P.vel.y -= 21 * dt;
    if (P.vel.y < -55) P.vel.y = -55;

    var fallVy = P.vel.y;
    var wasAir = !P.grounded;
    G.moveBody(P, dt);
    if (P.grounded && wasAir && fallVy < -6) {
      G.audio.play('land', Math.min(1, -fallVy / 16));
      if (fallVy < -22) damagePlayer((-fallVy - 22) * 2.2, P.pos.x, P.pos.y, P.pos.z, 'fall');
      player.shake = Math.min(1.0, player.shake + Math.min(0.5, -fallVy / 40));
    }

    /* 掉落出界保护 */
    if (P.pos.y < -30) {
      P.pos.x = G.level.spawn.x; P.pos.y = KILL_Y_RESET; P.pos.z = G.level.spawn.z;
      P.vel.x = P.vel.y = P.vel.z = 0;
      damagePlayer(25, P.pos.x, P.pos.y, P.pos.z);
    }

    /* 脚步 */
    var moved = Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z) * dt;
    if (P.grounded && moved > 0.001) {
      P.stepDist += moved;
      var stride = sprint ? 2.5 : 1.9;
      if (P.stepDist > stride) { P.stepDist = 0; G.audio.play('step', sprint ? 0.9 : 0.6); }
      P.bobPhase += moved * (sprint ? 4.4 : 3.6);
      P.bob = Math.sin(P.bobPhase) * (sprint ? 0.055 : 0.035);
    } else {
      P.bob = G.smooth(P.bob, 0, 8, dt);
    }
    P.lean = G.smooth(P.lean, (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0), 6, dt);

    /* 相机 */
    var bobY = P.bob;
    var bobX = Math.cos(P.bobPhase * 0.5) * 0.02;
    camera.position.set(P.pos.x + bobX * 0.4, P.pos.y + P.eye + bobY, P.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = P.yaw;
    camera.rotation.x = P.pitch - P.recoil * 0.035;
    camera.rotation.z = -P.lean * 0.02;

    /* 后坐恢复 */
    P.recoil = G.smooth(P.recoil, 0, 9, dt);

    /* 视角模型位置 */
    /* 视角模型：呼吸 / 摆动 / 后坐 / 装弹 / 检视 / 抽枪 全部交给武器装配台 */
    viewRoot.position.set(P.lean * -0.012, 0, 0);
    viewRoot.rotation.set(0, 0, P.lean * 0.022);
    if (rig.current !== currentWeaponKey()) rig.setWeapon(currentWeaponKey());
    rig.update(dt, {
      speed: Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z),
      sprint: P.sprinting, crouch: P.crouch, bobPhase: P.bobPhase,
      gravHold: !!gravHeld
    });

    /* 装弹 */
    if (P.reloading > 0) {
      P.reloading -= dt;
      if (P.reloading <= 0) finishReload();
    }
    /* 射速 */
    if (P.cd > 0) P.cd -= dt;
    /* 射击 */
    if (mouseDown && state === 'playing') {
      var W = currentWeapon();
      if (W && (W.auto || !P.firedThisClick)) {
        tryFire();
        P.firedThisClick = true;
      }
    }

    /* 手电 */
    flashlight.intensity = G.smooth(flashlight.intensity, P.flashlight && P.flashBattery > 0 ? 1.9 : 0, 12, dt);
    if (P.flashlight && P.flashBattery > 0) P.flashBattery = Math.max(0, P.flashBattery - dt * 0.6);

    /* 手柄震动/受伤反馈 */
    P.hurtFlash = Math.max(0, P.hurtFlash - dt * 1.6);
    P.shake = Math.max(0, P.shake - dt * 2.2);
    if (P.shake > 0.001) {
      camera.position.x += G.rand(-1, 1) * P.shake * 0.035;
      camera.position.y += G.rand(-1, 1) * P.shake * 0.035;
      camera.rotation.z += G.rand(-1, 1) * P.shake * 0.012;
    }

    /* 毒素伤害 */
    var L = G.level;
    for (var i = 0; i < L.sludge.length; i++) {
      var s = L.sludge[i];
      if (P.pos.x > s.min.x && P.pos.x < s.max.x && P.pos.z > s.min.z && P.pos.z < s.max.z && P.pos.y < s.y + 0.6) {
        P.sludgeT = (P.sludgeT || 0) + dt;
        if (P.sludgeT > 0.75) { P.sludgeT = 0; damagePlayer(6, P.pos.x, P.pos.y, P.pos.z, 'sludge'); }
        $('damage').style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(90,150,20,0.55) 100%)';
      }
    }

    /* 重生 */
    if (P.dead) {
      P.deadTimer += dt;
      camera.position.y = G.smooth(camera.position.y, P.pos.y + 0.25, 3, dt);
      camera.rotation.z = G.smooth(camera.rotation.z, 0.9, 2, dt);
    }
  }
  var KILL_Y_RESET = 0.4;

  function finishReload() {
    var k = currentWeaponKey(), W = WEAPONS[k];
    if (!W || W.clip < 0) return;
    var need = W.clip - player.clip[k];
    var take = Math.min(need, player.reserve[k]);
    if (take <= 0) return;
    player.clip[k] += take;
    player.reserve[k] -= take;
    G.audio.play('reload', 0.9);
    rig.cancelReload();
  }

  function startReload() {
    var k = currentWeaponKey(), W = WEAPONS[k];
    if (!W || !(W.clip > 0) || player.reloading > 0) return;
    if (player.clip[k] >= W.clip || player.reserve[k] <= 0) return;
    player.reloading = W.reload;
    player.cd = Math.max(player.cd, W.reload);
    rig.startReload(W.reload);
  }

  /** 检视手中武器（V 键） */
  function doInspect() {
    var k = currentWeaponKey();
    if (!rig.startInspect()) return;
    G.audio.play('inspect', 0.85);
    var W = WEAPONS[k];
    if (W.alt) say(W.name + ' —— 右键发射能量球', 2.8);
    else if (k === 'gravgun') say('重力枪 —— 右键抓取物体，左键投掷 / 冲击波', 3.2);
    else if (W.pierce) say(W.name + ' —— 可穿透多个目标', 2.4);
    else if (W.clip === 1) say(W.name, 1.6);
    else say(W.name + ' · 弹匣 ' + W.clip + ' 发', 2.0);
  }

  function switchWeapon(i) {
    if (i < 0 || i >= player.has.length) return;
    if (player.cur === i) return;
    player.cur = i;
    player.reloading = 0;
    player.cd = 0.28;
    rig.startReload(0);          /* 打断装弹动画 */
    rig.cancelReload();
    rig.setWeapon(player.has[i]);
    dropGrabbed();
    G.audio.play('reload', 0.5);
  }
  function switchByName(name) {
    var i = player.has.indexOf(name);
    if (i >= 0) switchWeapon(i);
  }

  /* =====================================================================
     拾取 / 交互
     ===================================================================== */
  function updatePickups(dt) {
    var L = G.level;
    for (var i = 0; i < L.pickups.length; i++) {
      var p = L.pickups[i];
      if (p.taken || p.held || p.flying) continue;
      var d = G.distXZ(player.pos.x, player.pos.z, p.mesh.position.x, p.mesh.position.z);
      if (d < 1.5 && Math.abs(player.pos.y - p.pos.y) < 2.2) {
        if (applyPickup(p)) {
          p.taken = true;
          worldRoot.remove(p.mesh);
        }
      }
    }
    /* 充能站 */
    for (var j = 0; j < L.stations.length; j++) {
      var st = L.stations[j];
      st.cooldown = Math.max(0, st.cooldown - dt);
      st.glow.material.opacity = (st.uses > 0 ? 0.10 : 0.02) + Math.sin(performance.now() * 0.004) * 0.06;
      st.screen.material.color.setHex(st.uses > 0 ? 0x33ff88 : 0x224433);
    }
    /* 阀门 */
    for (var v = 0; v < L.valves.length; v++) {
      var va = L.valves[v];
      if (va.done) { va.wheel.rotation.z += dt * 0.6; continue; }
      va.led.material.color.setHex(0xff3020);
    }
  }

  function applyPickup(p) {
    var PU = DIF.pickup;
    var heal = Math.max(8, Math.round(25 * PU));
    var batt = Math.max(10, Math.round(30 * PU));
    switch (p.type) {
      case 'medkit':
        if (player.health >= player.maxHealth) return false;
        player.health = Math.min(player.maxHealth, player.health + heal);
        G.audio.play('heal', 0.9); toast('+' + heal + ' 生命值', 'good');
        return true;
      case 'battery':
        if (player.suit >= player.maxSuit) return false;
        player.suit = Math.min(player.maxSuit, player.suit + batt);
        G.audio.play('charge', 0.7); toast('+' + batt + ' 防护能量', 'good');
        return true;
      case 'grenade':
        if (player.grenades >= 5) return false;
        player.grenades += Math.max(1, Math.round(2 * PU));
        G.audio.play('pickup', 0.9); toast('手雷 +' + Math.max(1, Math.round(2 * PU)), 'good');
        return true;
      case 'pistol': case 'smg': case 'shotgun':
      case 'magnum': case 'crossbow': case 'ar2': case 'gravgun':
        if (player.weapons[p.type]) {
          var W = WEAPONS[p.type];
          if (W.clip > 0) {
            var add = Math.round(W.clip * 2 * PU);
            player.reserve[p.type] = Math.min(400, player.reserve[p.type] + add);
            G.audio.play('pickup', 0.9); toast(W.name + ' 弹药 +' + add, 'good');
          } else {
            G.audio.play('pickup', 0.9); toast(W.name + ' 无需弹药', 'good');
          }
          return true;
        }
        player.weapons[p.type] = true;
        player.has.push(p.type);
        if (WEAPONS[p.type].clip > 0) {
          player.clip[p.type] = WEAPONS[p.type].clip;
          player.reserve[p.type] = Math.round(WEAPONS[p.type].reserve * PU);
        }
        G.audio.play('weaponGet', 1);
        toast('获得 ' + WEAPONS[p.type].name, 'weapon');
        say('拿到 ' + WEAPONS[p.type].name + ' —— 按 ' + WEAPONS[p.type].key + ' 装备，V 检视', 4);
        switchByName(p.type);
        return true;
      case 'ammo_magnum':
        var a4 = Math.max(4, Math.round(12 * PU));
        if (player.reserve.magnum >= 90) return false;
        player.reserve.magnum += a4; G.audio.play('pickup', 0.8); toast('.357 弹药 +' + a4, 'good'); return true;
      case 'ammo_crossbow':
        var a5 = Math.max(2, Math.round(5 * PU));
        if (player.reserve.crossbow >= 40) return false;
        player.reserve.crossbow += a5; G.audio.play('pickup', 0.8); toast('弩箭 +' + a5, 'good'); return true;
      case 'ammo_ar2':
        var a6 = Math.max(12, Math.round(45 * PU));
        if (player.reserve.ar2 >= 400) return false;
        player.reserve.ar2 += a6; G.audio.play('pickup', 0.8); toast('脉冲弹药 +' + a6, 'good'); return true;
      case 'ammo_pistol':
        var a1 = Math.max(10, Math.round(34 * PU));
        if (player.reserve.pistol >= 240) return false;
        player.reserve.pistol += a1; G.audio.play('pickup', 0.8); toast('9mm 弹药 +' + a1, 'good'); return true;
      case 'ammo_smg':
        var a2 = Math.max(16, Math.round(60 * PU));
        if (player.reserve.smg >= 480) return false;
        player.reserve.smg += a2; G.audio.play('pickup', 0.8); toast('冲锋枪弹药 +' + a2, 'good'); return true;
      case 'ammo_shotgun':
        var a3 = Math.max(4, Math.round(12 * PU));
        if (player.reserve.shotgun >= 120) return false;
        player.reserve.shotgun += a3; G.audio.play('pickup', 0.8); toast('霰弹 +' + a3, 'good'); return true;
    }
    return false;
  }

  /* 交互（E 键） */
  var interactTarget = null;
  function findInteractable() {
    var L = G.level, best = null, bestD = 2.6;
    for (var i = 0; i < L.valves.length; i++) {
      var v = L.valves[i];
      if (v.done) continue;
      var d = G.distXZ(player.pos.x, player.pos.z, v.pos.x, v.pos.z);
      if (d < bestD && Math.abs(player.pos.y - v.pos.y) < 3.5) { bestD = d; best = { kind: 'valve', obj: v }; }
    }
    for (var j = 0; j < L.stations.length; j++) {
      var s = L.stations[j];
      if (s.uses <= 0) continue;
      var d2 = G.distXZ(player.pos.x, player.pos.z, s.pos.x, s.pos.z);
      if (d2 < bestD && Math.abs(player.pos.y - (s.pos.y - 1.1)) < 3.0) { bestD = d2; best = { kind: 'station', obj: s }; }
    }
    return best;
  }

  function doInteract(dt) {
    interactTarget = findInteractable();
    var bar = $('interactBar'), box = $('interact');
    if (!interactTarget) {
      box.classList.remove('on');
      player.interactT = 0;
      return;
    }
    box.classList.add('on');
    if (interactTarget.kind === 'valve') {
      $('interactText').textContent = '[E] 关闭 ' + interactTarget.obj.label;
      if (keys['KeyE']) {
        player.interactT += dt;
        G.audio.play('valve', 0.12);
        bar.style.width = Math.min(100, (player.interactT / 1.4) * 100) + '%';
        if (player.interactT >= 1.4) {
          completeValve(interactTarget.obj);
          player.interactT = 0;
          bar.style.width = '0%';
        }
      } else {
        player.interactT = 0; bar.style.width = '0%';
      }
    } else {
      $('interactText').textContent = '[E] 使用 HEV 充能站（剩余 ' + interactTarget.obj.uses + ' 次）';
      bar.style.width = '0%';
      if (keys['KeyE'] && !player._eHeld) {
        var s = interactTarget.obj;
        if (player.health < player.maxHealth || player.suit < player.maxSuit) {
          s.uses--;
          player.health = player.maxHealth;
          player.suit = player.maxSuit;
          G.audio.play('charge', 1);
          toast('生命与防护能量已充满', 'good');
        } else {
          G.audio.play('deny', 0.8);
          toast('状态良好，无需充能');
        }
      }
    }
    player._eHeld = !!keys['KeyE'];
  }

  function completeValve(v) {
    v.done = true;
    v.led.material.color.setHex(0x33ff66);
    v.glow.material.color.setHex(0x33ff66);
    v.glow.material.opacity = 0.34;
    G.audio.play('valve', 1);
    G.audio.play('pickup', 1);
    fx.flashes.flash(v.pos.x, v.pos.y, v.pos.z, 0x44ff88, 3, 14, 0.4);
    var done = G.level.valves.filter(function (x) { return x.done; }).length;
    var total = G.level.valves.length;
    if (done < total) {
      setObjective('关闭 3 个冷却阀门（' + done + '/' + total + '）');
      say(v.label + ' 已关闭 —— 还有 ' + (total - done) + ' 个。', 3.2);
    } else {
      setObjective('消灭蚁狮守卫');
      say('全部阀门已关闭！反应堆压力失控 —— 有东西从下面爬上来了！', 5);
      G.audio.play('alarm', 1);
      G.audio.play('reveal', 1);
      player.shake = 1.2;
      spawnBoss();
    }
  }

  function spawnBoss() {
    var b = G.level.bossSpawn;
    var e = spawnEnemy('guard', b.x, b.z - 6, b.y);
    if (e) {
      say('蚁狮守卫出现了！', 4);
      $('bossBar').classList.add('on');
    }
    for (var i = 0; i < Math.round(4 * DIF.count); i++) {
      spawnEnemy('soldier', 12 + (i % 4) * 7, -92 - (i % 2) * 4);
    }
    for (var j = 0; j < Math.round(4 * DIF.count); j++) {
      spawnEnemy('headcrab', 10 + (j % 5) * 8, -118 + (j > 4 ? 3 : 0));
    }
  }

  /* =====================================================================
     触发点
     ===================================================================== */
  function updateTriggers() {
    var L = G.level;
    for (var i = 0; i < L.triggers.length; i++) {
      var t = L.triggers[i];
      if (t.fired) continue;
      if (player.pos.x > t.min.x && player.pos.x < t.max.x && player.pos.z > t.min.z && player.pos.z < t.max.z) {
        t.fired = true;
        if (t.subtitle) say(t.subtitle, 5);
        if (t.objective) setObjective(t.objective);
        if (t.alarm) G.audio.play('alarm', 0.8);
        if (t.spawns) {
          for (var s = 0; s < t.spawns.length; s++) {
            var sp = t.spawns[s];
            /* 难度越高，每个刷怪点出的敌人越多 */
            var n = Math.floor(DIF.count) + (Math.random() < (DIF.count % 1) ? 1 : 0);
            for (var c = 0; c < n; c++) {
              spawnEnemy(sp.t, sp.x + G.rand(-1.4, 1.4), sp.z + G.rand(-1.4, 1.4), sp.y);
            }
          }
        }
      }
    }
    /* 传送门胜利判定 */
    var P = L.portal;
    if (P && P.active && !P.won) {
      var d = G.distXZ(player.pos.x, player.pos.z, P.pos.x, P.pos.z);
      if (d < 2.4 && player.pos.y > -1 && player.pos.y < 6) {
        P.won = true;
        winGame();
      }
    }
    /* 首领血条 */
    var bossAlive = false;
    for (var b = 0; b < enemies.length; b++) if (enemies[b].boss && !enemies[b].dead) bossAlive = true;
    if (!bossAlive) $('bossBar').classList.remove('on');
  }

  function winGame() {
    state = 'win';
    G.audio.play('win', 1);
    G.audio.play('portal', 1);
    document.exitPointerLock();
    $('hud').classList.remove('on');
    $('victory').classList.add('on');
    var acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
    $('winStats').innerHTML =
      '击杀敌人：<b>' + stats.kills + '</b><br>' +
      '通关用时：<b>' + fmtTime(stats.time) + '</b><br>' +
      '命中率：<b>' + acc + '%</b><br>' +
      '剩余生命：<b>' + Math.ceil(player.health) + '</b>';
  }

  /* =====================================================================
     HUD
     ===================================================================== */
  function updateHUD() {
    var P = player;
    if (lastHud.hp !== Math.ceil(P.health)) {
      lastHud.hp = Math.ceil(P.health);
      $('health').textContent = lastHud.hp;
      $('healthBar').style.width = G.clamp(P.health / P.maxHealth * 100, 0, 100) + '%';
      $('health').style.color = P.health < 30 ? '#ff5540' : '';
      $('lowhp').style.opacity = P.health < 32 && !P.dead ? (0.35 + Math.sin(performance.now() * 0.006) * 0.25) : 0;
    }
    if (lastHud.suit !== Math.ceil(P.suit)) {
      lastHud.suit = Math.ceil(P.suit);
      $('suit').textContent = lastHud.suit;
      $('suitBar').style.width = G.clamp(P.suit / P.maxSuit * 100, 0, 100) + '%';
    }
    var k = currentWeaponKey(), W = WEAPONS[k];
    var clipTxt = W.clip < 0 ? '—' : String(P.clip[k]);
    var resTxt = W.reserve < 0 ? '' : String(P.reserve[k]);
    if (lastHud.clip !== clipTxt + resTxt) {
      lastHud.clip = clipTxt + resTxt;
      $('ammo').textContent = clipTxt;
      $('ammoReserve').textContent = resTxt;
      $('ammo').style.color = (W.clip > 0 && P.clip[k] === 0) ? '#ff5540' : '';
    }
    if (lastHud.wname !== W.name) { lastHud.wname = W.name; $('weaponName').textContent = W.name; }
    if (lastHud.gren !== P.grenades) { lastHud.gren = P.grenades; $('grenadeNum').textContent = P.grenades; }
    var wl = $('weaponList').children;
    var curKey = currentWeaponKey();
    for (var i = 0; i < wl.length; i++) {
      var nm = WORDER[i];
      /* 高亮必须按「武器键」比对：player.cur 是 player.has 的下标，
         而物品栏是按 WORDER 排列的，用下标比会错位 */
      wl[i].className = (player.weapons[nm] ? 'have' : '') + (nm === curKey ? ' active' : '');
    }
    /* 受伤覆盖 */
    $('damage').style.opacity = Math.min(0.95, P.hurtFlash);
    if (P.hurtFlash <= 0.02) $('damage').style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 32%, rgba(150,10,10,0.85) 100%)';
    /* 手电指示 */
    $('flashInd').className = P.flashlight ? 'on' : '';
    $('flashInd').textContent = '手电 ' + Math.round(P.flashBattery) + '%';
    /* 准星 */
    $('crosshair').className = lastHud.reload ? '' : '';
    /* 鼠标锁定提示 */
    var locked = touchMode || document.pointerLockElement === renderer.domElement;
    if (relockShown !== locked) {
      relockShown = locked;
      $('relock').style.display = locked ? 'none' : 'flex';
    }
    /* 帧率 */
    if (lastHud.fps !== fpsVal) { lastHud.fps = fpsVal; $('fps').textContent = fpsVal + ' FPS'; }
  }

  function checkCrosshair() {
    var f = forward(), eye = eyePos();
    var near = false;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var dx = e.pos.x - eye.x, dy = (e.pos.y + e.height * 0.5) - eye.y, dz = e.pos.z - eye.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 55) continue;
      var dot = (dx * f.x + dy * f.y + dz * f.z) / (d || 1);
      var ang = Math.acos(G.clamp(dot, -1, 1));
      if (ang < Math.atan2(e.radius + 0.15, d) + 0.02 && G.lineOfSight(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + e.height * 0.5, e.pos.z)) { near = true; break; }
    }
    $('crosshair').classList.toggle('hot', near);
  }

  /* =====================================================================
     主循环
     ===================================================================== */
  var crossTimer = 0, hudTick = 0;
  /** 推进一帧游戏逻辑。可被 G.game.step(dt) 手动调用（自动化测试 / 二次开发） */
  function tick(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    var time = performance.now() * 0.001;

    if (state === 'playing') {
      stats.time += dt;
      updatePlayer(dt);
      updatePending(dt);
      updateGrenades(dt);
      updateProjectiles(dt);
      updateGrabbed(dt);
      updateProps(dt);
      updateBloodPools(dt);
      updateFlyingCorpses(dt);
      updateItems(dt);
      for (var i = 0; i < enemies.length; i++) updateEnemy(enemies[i], dt);
      updatePickups(dt);
      updateTriggers();
      doInteract(dt);
      G.level.updateLights(player.pos, dt);
      G.level.updateFlicker(dt, time);
      G.level.updatePickups(dt);
      G.level.updatePortal(dt);
      hudTick += dt;
      if (hudTick > 0.05) { hudTick = 0; updateHUD(); }
      crossTimer -= dt;
      if (crossTimer <= 0) { crossTimer = 0.12; checkCrosshair(); }
      if (subtitleTimer > 0) {
        subtitleTimer -= dt;
        if (subtitleTimer <= 0) $('subtitle').classList.remove('on');
      }
    } else if (state === 'dead') {
      updatePlayer(dt);
      updatePending(dt);
      for (var j = 0; j < enemies.length; j++) updateEnemy(enemies[j], dt);
    }

    /* 帧率统计 */
    fpsFrames++; fpsAcc += dt;
    if (fpsAcc >= 0.5) { fpsVal = Math.round(fpsFrames / fpsAcc); fpsFrames = 0; fpsAcc = 0; }

    fx.update(dt);
    if (motes) motes.update(dt, camera.position.x, camera.position.y, camera.position.z);
    if (!NO_RENDER) {
      if (postfx && postfx.enabled) {
        /* 场景 → 泛光 → 合成；手中武器单独画在最上层，保持锐利 */
        postfx.render(scene, camera, time);
        if (state === 'playing' || state === 'paused') {
          renderer.clearDepth();
          renderer.render(viewScene, viewCamera);
        }
      } else {
        renderer.clear();
        renderer.render(scene, camera);
        if (state === 'playing' || state === 'paused') {
          renderer.clearDepth();
          renderer.render(viewScene, viewCamera);
        }
      }
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    tick(clock.getDelta());
  }

  /* =====================================================================
     输入
     ===================================================================== */
  /** 副功能（鼠标右键 / 触屏“副武器”按钮） */
  function secondaryAction() {
    if (state !== 'playing') return;
    var W2 = currentWeapon();
    if (!W2) return;
    if (W2.kind === 'gravity') {
      /* 右键：抓取 / 放下 */
      if (gravHeld) dropGrabbed();
      else {
        var tgt = findGrabTarget(W2.range);
        if (tgt) grabProp(tgt);
        else { G.audio.play('deny', 0.8); toast('附近没有可抓取的物体'); }
      }
    } else if (W2.alt) {
      tryAltFire();
    }
  }

  /* =====================================================================
     操作方式：自动识别（G.PLATFORM）+ 手动覆盖（localStorage 记忆）
     ===================================================================== */
  var INPUT_KEY = 'hl3_input_mode';
  function savedInputMode() {
    try {
      var v = localStorage.getItem(INPUT_KEY);
      return (v === 'touch' || v === 'pc') ? v : null;
    } catch (e) { return null; }
  }
  function resolveInputMode() {
    var saved = savedInputMode();
    if (saved) return saved;
    return PLAT.inputMode === 'touch' ? 'touch' : 'pc';
  }
  /** 应用操作方式（可热切换，不需要重开游戏） */
  function applyInputMode(mode, save) {
    if (mode === 'auto') mode = (PLAT.inputMode === 'touch') ? 'touch' : 'pc';
    var on = (mode === 'touch');
    touchMode = on;
    var ui = document.getElementById('touchUI');
    if (ui) ui.classList.toggle('on', on);
    if (document.body) document.body.classList.toggle('touch', on);
    if (on) {
      if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
      var rel = document.getElementById('relock');
      if (rel) rel.style.display = 'none';
    } else if (state === 'playing') {
      try { renderer.domElement.requestPointerLock(); } catch (e) {}
    }
    if (save) { try { localStorage.setItem(INPUT_KEY, on ? 'touch' : 'pc'); } catch (e) {} }
    var desc = document.getElementById('inputModeDesc');
    if (desc) desc.textContent = PLAT.reason || '';
    /* 让「自动识别」这一项直接显示识别结果 */
    var autoOpt = document.querySelector('#inputMode option[value="auto"]');
    if (autoOpt) autoOpt.textContent = '自动识别（' + (PLAT.inputMode === 'touch' ? '触屏' : '键鼠') + '）';
    return on;
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
      if (state === 'playing') {
        var dg = /^Digit([1-9])$/.exec(e.code);
        if (dg) {
          for (var wi = 0; wi < WORDER.length; wi++) {
            if (WEAPONS[WORDER[wi]].key === dg[1] && player.weapons[WORDER[wi]]) {
              switchWeapon(player.has.indexOf(WORDER[wi]));
              break;
            }
          }
        }
        if (e.code === 'KeyR') startReload();
        if (e.code === 'KeyG') throwGrenade();
        if (e.code === 'KeyV') doInspect();
        if (e.code === 'KeyF') {
          player.flashlight = !player.flashlight;
          if (player.flashlight && player.flashBattery <= 0) { player.flashlight = false; G.audio.play('deny', 0.8); toast('手电电量耗尽'); }
          else G.audio.play('reload', 0.4);
        }
        if (e.code === 'KeyQ') {
          var prev = (player.cur - 1 + player.has.length) % player.has.length;
          switchWeapon(prev);
        }
        if (e.code === 'KeyE') player._eHeld = false;
      }
      if (e.code === 'Escape' && state === 'playing') pauseGame();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });

    window.addEventListener('mousedown', function (e) {
      if (state !== 'playing') return;
      /* 鼠标未锁定时（例如刚按过 ESC，Chrome 有锁定冷却期），
         这一次点击只用来重新锁定视角，不触发射击。触屏模式跳过这个限制。 */
      if (!touchMode && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
        return;
      }
      if (e.button === 0) { mouseDown = true; player.firedThisClick = false; }
      if (e.button === 2) secondaryAction();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { mouseDown = false; player.firedThisClick = false; }
    });
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('wheel', function (e) {
      if (state !== 'playing') return;
      var dir = e.deltaY > 0 ? 1 : -1;
      var idx = (player.cur + dir + player.has.length) % player.has.length;
      switchWeapon(idx);
    }, { passive: true });

    document.addEventListener('mousemove', function (e) {
      if (state !== 'playing' || document.pointerLockElement !== renderer.domElement) return;
      var s = 0.0022 * mouseSens;
      player.yaw -= e.movementX * s;
      player.pitch -= e.movementY * s;
      player.pitch = G.clamp(player.pitch, -1.45, 1.45);
      player.yaw = G.wrapAngle(player.yaw);
    });

    document.addEventListener('pointerlockchange', function () {
      var locked = touchMode || document.pointerLockElement === renderer.domElement;
      if (!locked && state === 'playing') pauseGame();
    });
  }

  /** 画质档位：影响渲染分辨率倍率（弱显卡请选“低”） */
  function setQuality(level) {
    QUALITY.level = level;
    QUALITY.pixelRatio = level === '高' ? (PLAT.pixelRatio || 1.5) : (level === '中' ? 1.0 : 0.7);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (postfx) { postfx.setQuality(level); postfx.setSize(window.innerWidth, window.innerHeight); }
    toast('画质：' + level);
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    mouseDown = false;
    document.exitPointerLock();
    $('pause').classList.add('on');
    $('hud').classList.remove('on');
  }
  function resumeGame() {
    if (state !== 'paused') return;
    $('pause').classList.remove('on');
    $('hud').classList.add('on');
    state = 'playing';
    clock.getDelta();
    if (!touchMode) renderer.domElement.requestPointerLock();
    G.audio.resume();
  }

  /* =====================================================================
     关卡重置 / 开始
     ===================================================================== */
  function resetLevel() {
    enemies.length = 0;
    grenades.length = 0;
    pending.length = 0;
    if (worldRoot) { scene.remove(worldRoot); }
    while (worldRoot && worldRoot.children.length) worldRoot.remove(worldRoot.children[0]);
    worldRoot = new T.Group();
    scene.add(worldRoot);
    G.buildLevel(worldRoot);
    fx.clear();

    var L = G.level;
    /* 难度：困难以上充能站次数减少 */
    var su = difficultyIsHard() ? 2 : 3;
    L.stations.forEach(function (s) { s.uses = su; });
    player.pos.x = L.spawn.x; player.pos.y = L.spawn.y; player.pos.z = L.spawn.z;
    player.vel.x = player.vel.y = player.vel.z = 0;
    player.yaw = L.spawnYaw; player.pitch = 0;
    player.health = 100; player.suit = 100;
    player.weapons = { crowbar: true, pistol: false, smg: false, shotgun: false, magnum: false, crossbow: false, ar2: false, gravgun: false };
    player.has = ['crowbar']; player.cur = 0;
    player.clip = { pistol: 0, smg: 0, shotgun: 0, magnum: 0, crossbow: 0, ar2: 0 };
    player.reserve = { pistol: 0, smg: 0, shotgun: 0, magnum: 0, crossbow: 0, ar2: 0 };
    player.grenades = 2; player.flashlight = false; player.flashBattery = 100;
    player.dead = false; player.deadTimer = 0; player.reloading = 0; player.cd = 0;
    player.hurtFlash = 0; player.shake = 0; player.height = 1.72; player.eye = 1.62;
    player.sludgeT = 0;
    stats.kills = 0; stats.time = 0; stats.shots = 0; stats.hits = 0;
    gravHeld = null;
    for (var pi = 0; pi < projectiles.length; pi++) worldRoot.remove(projectiles[pi].mesh);
    projectiles.length = 0;
    resetProps();
    clearPools();
    rig.setWeapon('crowbar', true);
    lastHud = {};
    $('bossBar').classList.remove('on');
    $('lowhp').style.opacity = 0;
    $('damage').style.opacity = 0;
    $('damage').style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 32%, rgba(150,10,10,0.85) 100%)';
    clock.getDelta();
  }

  function startGame() {
    G.audio.init();
    G.audio.resume();
    resetLevel();
    state = 'playing';
    $('menu').classList.remove('on');
    $('pause').classList.remove('on');
    $('death').classList.remove('on');
    $('victory').classList.remove('on');
    $('hud').classList.add('on');
    setObjective('离开东翼仓库，前往中央中庭');
    say('黑山基地 · 东翼 —— 事故发生后 17 分钟。', 5.5);
    if (!touchMode) renderer.domElement.requestPointerLock();
  }

  /* =====================================================================
     启动
     ===================================================================== */
  function boot() {
    initThree();
    clock = new T.Clock();
    fx = G.createFX(scene);
    motes = new G.DustMotes(scene, 150, 9);
    worldRoot = new T.Group();
    scene.add(worldRoot);
    scene.add(camera);
    G.buildLevel(worldRoot);
    buildViewModels();
    bindInput();

    /* 武器栏按数据表生成（8 把武器） */
    var wlBox = $('weaponList');
    while (wlBox.firstChild) wlBox.removeChild(wlBox.firstChild);
    for (var wi2 = 0; wi2 < WORDER.length; wi2++) {
      var wd = document.createElement('div');
      wd.textContent = WEAPONS[WORDER[wi2]].key + ' ' + WEAPONS[WORDER[wi2]].short;
      wlBox.appendChild(wd);
    }
    verifyWeaponModels();

    $('btnStart').addEventListener('click', startGame);
    $('btnResume').addEventListener('click', resumeGame);
    $('btnRestart').addEventListener('click', startGame);
    $('btnAgain').addEventListener('click', startGame);
    $('btnQuit').addEventListener('click', function () {
      state = 'menu';
      $('pause').classList.remove('on');
      $('hud').classList.remove('on');
      $('menu').classList.add('on');
    });
    $('btnDeathRestart').addEventListener('click', startGame);
    $('sens').addEventListener('input', function () {
      mouseSens = parseFloat(this.value);
      $('sensVal').textContent = mouseSens.toFixed(1) + 'x';
    });
    $('quality').addEventListener('change', function () { setQuality(this.value); });
    $('diff').addEventListener('change', function () {
      applyDifficulty(this.value);
      $('diffDesc').textContent = DIFF_DESC[this.value] || '';
      if (state === 'playing' || state === 'paused') toast('难度将在「重新开始」后生效');
    });
    applyDifficulty($('diff').value);
    $('diffDesc').textContent = DIFF_DESC[$('diff').value] || '';
    /* 画质下拉框与平台默认档保持一致（移动端默认「低」） */
    if ($('quality')) $('quality').value = QUALITY.level;
    /* 操作方式：自动识别 + 手动覆盖 */
    var imSel = $('inputMode');
    if (imSel) {
      imSel.value = savedInputMode() || 'auto';
      imSel.addEventListener('change', function () {
        var on = applyInputMode(this.value, true);
        toast(this.value === 'auto' ? '操作方式：自动识别' : (on ? '操作方式：触屏' : '操作方式：键盘鼠标'));
      });
    }
    applyInputMode(resolveInputMode());
    $('vol').addEventListener('input', function () {
      G.audio.init();
      G.audio.setVolume(parseFloat(this.value));
      $('volVal').textContent = Math.round(this.value * 100) + '%';
    });
    $('btnPause').addEventListener('click', function () { if (state === 'playing') pauseGame(); });

    var ld = document.getElementById('loading');
    if (ld) ld.style.display = 'none';
    loop();
    console.log('[HL3] 初始化完成，点击“开始游戏”进入黑山基地。');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
  else window.addEventListener('DOMContentLoaded', boot);

  /* 调试 / 二次开发 API */
  G.game = {
    start: startGame,
    state: function () { return state; },
    player: player,
    enemies: enemies,
    grenades: grenades,
    spawn: spawnEnemy,
    fire: tryFire,
    throwGrenade: throwGrenade,
    damagePlayer: damagePlayer,
    damageEnemy: damageEnemy,
    completeValve: completeValve,
    spawnBoss: spawnBoss,
    portal: function () { return G.level.portal; },
    level: function () { return G.level; },
    /** 一键全武器满弹（调试用） */
    giveAll: function () {
      player.weapons = { crowbar: true, pistol: true, smg: true, shotgun: true, magnum: true, crossbow: true, ar2: true, gravgun: true };
      player.has = WORDER.slice();
      for (var i = 0; i < WORDER.length; i++) {
        var k = WORDER[i], W = WEAPONS[k];
        if (W.clip > 0) { player.clip[k] = W.clip; player.reserve[k] = W.reserve * 3; }
      }
      player.grenades = 5;
      rig.setWeapon(player.has[player.cur] || 'crowbar', true);
    },
    /** 传送（调试用） */
    teleport: function (x, y, z) {
      player.pos.x = x; player.pos.y = y; player.pos.z = z;
      player.vel.x = player.vel.y = player.vel.z = 0;
    },
    /** 手动推进一帧（自动化测试 / 二次开发用） */
    step: tick,
    /** 武器装配台 / 道具 / 重力枪（调试与测试用） */
    rig: function () { return rig; },
    props: function () { return (G.level && G.level.props) || []; },
    /** 移动道具并同步其碰撞体（调试用） */
    moveProp: function (p, x, y, z) {
      p.mesh.position.set(x, y, z);
      if (p.solid) syncPropSolid(p);
      if (p.vel) { p.vel.x = p.vel.y = p.vel.z = 0; }
      return p;
    },
    corpses: function () { return corpses.length; },
    bloodPools: function () { return pools.length; },
    deathPose: function (t) { return DEATH_POSE[t]; },
    held: function () { return gravHeld ? gravHeld.o : null; },
    heldType: function () { return gravHeld ? gravHeld.type : null; },
    projectiles: projectiles,
    inspect: doInspect,
    altFire: tryAltFire,
    grabNearest: function () { var tg = findGrabTarget(WEAPONS.gravgun.range); if (tg) { grabProp(tg); return true; } return false; },
    launch: function () { if (gravHeld) { launchGrabbed(); return true; } return false; },
    drop: function () { dropGrabbed(); },
    /** 取渲染器 / 场景（排查性能与着色器重编译用） */
    getRenderer: function () { return renderer; },
    getScene: function () { return scene; },
    getPostFX: function () { return postfx; },
    /** 统计当前可见灯光数量 */
    lightCount: function () {
      var n = 0;
      scene.traverse(function (o) { if (o.isLight && o.visible) n++; });
      return n;
    },
    /** 模拟按键（自动化测试用） */
    key: function (code, down) { keys[code] = !!down; },
    /** 模拟按住开火（自动化测试用） */
    trigger: function (down) { mouseDown = !!down; if (down) player.firedThisClick = false; },
    /** 输入接口：供触屏控制层（mobile.js）与自动化测试使用 */
    input: {
      key: function (code, down) { keys[code] = !!down; },
      /** 触摸拖动转视角（参数为像素位移） */
      look: function (dxPixels, dyPixels) {
        if (state !== 'playing') return;
        var s = 0.0030 * mouseSens * (touchMode ? 1.25 : 1);
        player.yaw -= dxPixels * s;
        player.pitch -= dyPixels * s;
        player.pitch = G.clamp(player.pitch, -1.45, 1.45);
        player.yaw = G.wrapAngle(player.yaw);
      },
      trigger: function (down) { mouseDown = !!down; if (down) player.firedThisClick = false; },
      secondary: secondaryAction,
      cycleWeapon: function (dir) {
        if (player.has.length < 2) return;
        switchWeapon((player.cur + dir + player.has.length) % player.has.length);
      },
      reload: startReload,
      inspect: doInspect,
      grenade: throwGrenade,
      interact: function (down) { keys['KeyE'] = !!down; if (down) player._eHeld = false; },
      jump: function (down) { keys['Space'] = !!down; },
      crouch: function (down) { keys['ControlLeft'] = !!down; },
      sprint: function (down) { keys['ShiftLeft'] = !!down; },
      flashlight: function () {
        player.flashlight = !player.flashlight;
        if (player.flashlight && player.flashBattery <= 0) {
          player.flashlight = false; G.audio.play('deny', 0.8); toast('手电电量耗尽');
        } else G.audio.play('reload', 0.4);
      },
      pause: pauseGame,
      state: function () { return state; }
    },
    /** 切换操作方式（'touch' / 'pc'），可随时热切换 */
    setInputMode: function (mode) { return applyInputMode(mode); },
    /** 开启触屏模式（兼容旧调用） */
    enableTouch: function () { return applyInputMode('touch'); },
    isTouch: function () { return touchMode; },
    platform: function () { return PLAT; },
    stats: stats
  };
})();

















