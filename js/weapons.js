/* =========================================================================
   半条命 3：重返黑山  ——  weapons.js
   武器模型（含双手与可动部件）/ 动画系统 / 检视动画
   ========================================================================= */
(function () {
  'use strict';
  var T = THREE, G = window.G;

  /* =====================================================================
     武器数据
     ===================================================================== */
  G.WEAPONS = {
    crowbar: {
      key: '1', name: '撬棍', short: '撬棍', kind: 'melee',
      dmg: 58, rate: 0.45, range: 2.5, recoil: 0.5, shell: false,
      clip: -1, reserve: -1
    },
    pistol: {
      key: '2', name: '9mm 手枪', short: '手枪', kind: 'hitscan',
      dmg: 17, rate: 0.155, clip: 18, reserve: 120, reload: 1.15,
      spread: 0.006, recoil: 0.9, sound: 'pistol', tracer: 0xffe9a0,
      auto: false, range: 90, shell: true
    },
    smg: {
      key: '3', name: 'MP7 冲锋枪', short: '冲锋枪', kind: 'hitscan',
      dmg: 9, rate: 0.075, clip: 45, reserve: 240, reload: 1.5,
      spread: 0.026, recoil: 0.55, sound: 'smg', tracer: 0xffd070,
      auto: true, range: 90, shell: true
    },
    shotgun: {
      key: '4', name: 'SPAS-12 霰弹枪', short: '霰弹枪', kind: 'hitscan',
      dmg: 9, pellets: 8, rate: 0.82, clip: 6, reserve: 40, reload: 1.9,
      spread: 0.075, recoil: 2.6, sound: 'shotgun', tracer: 0xffc060,
      auto: false, range: 45, shell: true, pump: true
    },
    magnum: {
      key: '5', name: '.357 马格南', short: '马格南', kind: 'hitscan',
      dmg: 48, rate: 0.62, clip: 6, reserve: 36, reload: 2.1,
      spread: 0.004, recoil: 2.4, sound: 'magnum', tracer: 0xfff0b0,
      auto: false, range: 110, shell: true, cylinder: true
    },
    crossbow: {
      key: '6', name: '十字弩', short: '十字弩', kind: 'hitscan',
      dmg: 100, rate: 1.0, clip: 1, reserve: 12, reload: 2.3,
      spread: 0.0, recoil: 1.4, sound: 'crossbow', tracer: 0xd8c090,
      auto: false, range: 140, pierce: 3, bolt: true
    },
    ar2: {
      key: '7', name: 'AR2 脉冲步枪', short: '脉冲步枪', kind: 'hitscan',
      dmg: 12, rate: 0.095, clip: 30, reserve: 180, reload: 1.7,
      spread: 0.018, recoil: 0.7, sound: 'pulse2', tracer: 0x88ccff,
      auto: true, range: 100, shell: true,
      alt: { kind: 'orb', dmg: 34, splash: 5.5, splashDmg: 95, sound: 'orb', cost: 3 }
    },
    gravgun: {
      key: '8', name: '重力枪', short: '重力枪', kind: 'gravity',
      dmg: 0, rate: 0.55, clip: -1, reserve: -1, recoil: 0.3,
      sound: 'grav', range: 14
    }
  };
  G.WORDER = ['crowbar', 'pistol', 'smg', 'shotgun', 'magnum', 'crossbow', 'ar2', 'gravgun'];

  /* =====================================================================
     共享材质
     ===================================================================== */
  var M = {
    gun: G.plain(0x2b2f36, { shin: 90, spec: 0xaaaaaa }),
    gun2: G.plain(0x3a4048, { shin: 70, spec: 0x888888 }),
    dark: G.plain(0x1b1e23, { shin: 45, spec: 0x555555 }),
    steel: G.plain(0x9aa2ab, { shin: 130, spec: 0xe0e0e0 }),
    steel2: G.plain(0x6e767e, { shin: 110, spec: 0xcccccc }),
    wood: G.plain(0x6b4a2a, { shin: 28, spec: 0x332211 }),
    wood2: G.plain(0x4a3018, { shin: 22, spec: 0x221100 }),
    skin: G.plain(0xb08c68, { shin: 16, spec: 0x332211 }),
    glove: G.plain(0x323840, { shin: 26, spec: 0x445566 }),
    hazard: G.plain(0xd8a020, { shin: 40 }),
    red: G.plain(0xa83020, { shin: 50 }),
    glowBlue: new T.MeshBasicMaterial({ color: 0x66ddff }),
    glowOrange: new T.MeshBasicMaterial({ color: 0xffaa44 }),
    glowGreen: new T.MeshBasicMaterial({ color: 0x66ff88 })
  };
  var BOX = new T.BoxGeometry(1, 1, 1);
  var CYL = function (rt, rb, h, seg) { return new T.CylinderGeometry(rt, rb, h, seg || 10); };

  function box(mat, w, h, d, x, y, z, parent, rot) {
    var m = new T.Mesh(BOX, mat);
    m.scale.set(w, h, d);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    (parent || null).add(m);
    return m;
  }
  function cyl(mat, rt, rb, h, x, y, z, parent, rot) {
    var m = new T.Mesh(CYL(rt, rb, h), mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    (parent || null).add(m);
    return m;
  }

  /* 手（mir=1 左手 / -1 右手），手指朝 -Z 握持 */
  function makeHand(mir, skin) {
    var g = new T.Group();
    box(skin || M.skin, 0.078, 0.105, 0.095, 0, 0, 0, g);
    for (var i = 0; i < 4; i++) {
      var f = box(skin || M.skin, 0.072, 0.028, 0.062, 0, 0.032 - i * 0.025, -0.072, g);
      f.rotation.x = -0.62;
    }
    var th = box(skin || M.skin, 0.03, 0.034, 0.068, mir * 0.048, -0.032, -0.028, g);
    th.rotation.set(-0.35, mir * 0.55, 0);
    return g;
  }

  /* 枪口闪光（球 + 十字星） */
  function addFlash(g, p, size) {
    var fg = new T.Group();
    fg.position.copy(p);
    var s = new T.Mesh(new T.SphereGeometry(0.05 * (size || 1), 8, 6), new T.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false
    }));
    fg.add(s);
    var star = new T.Mesh(BOX, new T.MeshBasicMaterial({
      color: 0xffeecc, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false
    }));
    star.scale.set(0.016, 0.016, 0.24 * (size || 1));
    fg.add(star);
    var star2 = star.clone(); star2.rotation.z = Math.PI / 2; fg.add(star2);
    fg.visible = false;
    g.add(fg);
    g.userData.flash = fg;
  }

  /* =====================================================================
     各武器模型
     ===================================================================== */
  var BUILD = {};

  /* ---------- 撬棍 ---------- */
  BUILD.crowbar = function () {
    var g = new T.Group();
    var bar = new T.Group();
    bar.rotation.set(-1.18, 0, 0);          /* 棍身斜指前上方 */
    bar.position.set(0, 0.19, 0.02);
    g.add(bar);

    /* --- 握把：红色橡胶 + 四道防滑环 --- */
    cyl(M.red, 0.028, 0.027, 0.21, 0, -0.235, 0, bar);
    for (var i = 0; i < 4; i++) {
      cyl(M.dark, 0.0305, 0.0305, 0.013, 0, -0.315 + i * 0.056, 0, bar);
    }
    box(M.steel2, 0.052, 0.020, 0.052, 0, -0.128, 0, bar);       /* 握把卡箍 */

    /* --- 主杆：六棱钢 --- */
    var shaft = new T.Mesh(new T.CylinderGeometry(0.0195, 0.0215, 0.62, 6), M.steel);
    shaft.position.set(0, 0.115, 0);
    bar.add(shaft);
    box(M.steel2, 0.005, 0.60, 0.005, 0.0145, 0.115, 0, bar);    /* 棱线高光 */
    box(M.steel2, 0.005, 0.60, 0.005, -0.0075, 0.115, -0.0125, bar);

    /* --- 尾端扁凿（撬缝用） --- */
    box(M.steel2, 0.017, 0.085, 0.040, 0, -0.440, 0, bar);
    box(M.steel, 0.013, 0.050, 0.030, 0, -0.505, 0, bar, [-0.12, 0, 0]);

    /* --- 弯钩：沿圆弧排列的扁钢段，越到爪尖越薄 --- */
    var R = 0.088, y0 = 0.425, ARC = 2.2, N = 7;
    for (var s = 0; s < N; s++) {
      var t = s / (N - 1);
      var a = t * ARC;
      box(M.steel, 0.019 - t * 0.005, 0.058, 0.042 - t * 0.013,
        0, y0 + R * Math.sin(a), -R * (1 - Math.cos(a)), bar, [-a, 0, 0]);
    }
    /* 爪根倒角块，让钩子和杆身平滑相接 */
    box(M.steel, 0.030, 0.044, 0.056, 0, y0 - 0.014, -0.013, bar, [-0.25, 0, 0]);
    /* 爪尖分叉：V 形缺口（拔钉子用） */
    var aE = ARC;
    var ty = y0 + R * Math.sin(aE), tz = -R * (1 - Math.cos(aE));
    for (var p = -1; p <= 1; p += 2) {
      box(M.steel2, 0.013, 0.050, 0.026,
        p * 0.0135, ty + 0.030 * Math.cos(aE), tz - 0.030 * Math.sin(aE),
        bar, [-aE - 0.20, 0, p * 0.22]);
    }
    /* 爪面磨损痕 */
    box(M.steel, 0.020, 0.006, 0.030, 0, y0 + 0.030, -0.055, bar, [-0.55, 0, 0]);

    /* --- 握持手：手指缠绕杆身 --- */
    var h = makeHand(-1);
    h.position.set(0, -0.225, 0.030);
    h.rotation.set(-0.30, 0, 0);
    bar.add(h);

    g.userData.rest = { x: 0.30, y: -0.36, z: -0.54, rx: 0.10, ry: 0.32, rz: 0.16 };
    g.userData.tracks = {
      inspect: [
        { t: 0.00, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.22, x: -0.06, y: 0.05, z: 0.02, rx: -0.25, ry: 1.5, rz: 0.6 },
        { t: 0.50, x: -0.02, y: 0.06, z: -0.02, rx: -0.35, ry: 3.0, rz: 0.9 },
        { t: 0.76, x: 0.02, y: 0.03, z: 0.02, rx: -0.1, ry: 5.4, rz: 0.2 },
        { t: 1.00, x: 0, y: 0, z: 0, rx: 0, ry: 2 * Math.PI, rz: 0 }
      ],
      melee: [
        { t: 0.00, rx: 0, ry: 0, rz: 0, x: 0, y: 0, z: 0 },
        { t: 0.18, rx: -1.20, ry: -0.55, rz: -0.35, x: -0.10, y: 0.11, z: 0.06 },
        { t: 0.42, rx: 0.95, ry: 0.55, rz: 0.45, x: 0.16, y: -0.16, z: -0.22 },
        { t: 1.00, rx: 0, ry: 0, rz: 0, x: 0, y: 0, z: 0 }
      ]
    };
    return g;
  };

  /* ---------- 手枪 ---------- */
  BUILD.pistol = function () {
    var g = new T.Group();
    box(M.gun, 0.062, 0.075, 0.30, 0, 0.02, -0.10, g);              /* 套筒座 */
    var slide = new T.Group(); slide.position.set(0, 0.062, -0.10); g.add(slide);
    box(M.steel2, 0.062, 0.052, 0.30, 0, 0, 0, slide);
    box(M.dark, 0.03, 0.02, 0.30, 0, 0.032, 0, slide);
    box(M.dark, 0.05, 0.014, 0.09, 0, 0.03, -0.16, slide);          /* 准星 */
    cyl(M.dark, 0.016, 0.016, 0.06, 0, 0, -0.175, g, [Math.PI / 2, 0, 0]);
    var gripH = box(M.gun2, 0.056, 0.17, 0.085, 0, -0.10, 0.03, g, [-0.24, 0, 0]);
    box(M.dark, 0.05, 0.02, 0.08, 0, -0.185, 0.055, g, [-0.24, 0, 0]);  /* 弹匣底板 */
    box(M.gun2, 0.03, 0.028, 0.045, 0, -0.045, -0.03, g);               /* 扳机护圈 */
    box(M.steel, 0.012, 0.026, 0.012, 0, -0.03, -0.035, g);
    var h = makeHand(-1); h.position.set(0, -0.155, 0.03); h.rotation.set(-0.2, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(-0.055, -0.09, -0.055); h2.rotation.set(-0.9, 0.5, 0.3); g.add(h2);
    g.userData.parts = { slide: slide, slideRest: slide.position.z };
    g.userData.eject = new T.Vector3(0.05, 0.07, -0.03);
    addFlash(g, new T.Vector3(0, 0.02, -0.26), 0.85);
    g.userData.rest = { x: 0.24, y: -0.27, z: -0.50, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.20, x: -0.03, y: 0.05, z: 0.05, rx: -0.3, ry: 0.55, rz: 0.55 },
        { t: 0.48, x: -0.02, y: 0.06, z: 0.03, rx: -0.15, ry: -0.55, rz: -0.35 },
        { t: 0.74, x: 0.0, y: 0.07, z: 0.0, rx: -0.75, ry: 0.1, rz: 0.15 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* ---------- 冲锋枪 ---------- */
  BUILD.smg = function () {
    var g = new T.Group();
    box(M.gun, 0.072, 0.10, 0.44, 0, 0.01, -0.14, g);
    box(M.gun2, 0.05, 0.05, 0.30, 0, 0.058, -0.16, g);              /* 上机匣 */
    cyl(M.dark, 0.014, 0.014, 0.20, 0, 0.005, -0.42, g, [Math.PI / 2, 0, 0]);
    cyl(M.steel2, 0.024, 0.024, 0.16, 0, 0.005, -0.36, g, [Math.PI / 2, 0, 0]);
    var mag = new T.Group(); mag.position.set(0, -0.10, -0.05); g.add(mag);
    box(M.dark, 0.046, 0.22, 0.075, 0, 0, 0, mag);
    box(M.steel, 0.05, 0.016, 0.08, 0, -0.115, 0, mag);
    box(M.gun2, 0.045, 0.06, 0.16, 0, -0.015, 0.20, g);             /* 枪托 */
    box(M.dark, 0.04, 0.09, 0.05, 0, -0.06, 0.27, g);
    box(M.gun2, 0.055, 0.055, 0.12, 0, -0.06, -0.24, g);            /* 前握把 */
    box(M.dark, 0.03, 0.055, 0.05, 0, 0.095, -0.22, g);             /* 瞄具 */
    var dot = new T.Mesh(new T.SphereGeometry(0.008, 6, 5), M.glowOrange);
    dot.position.set(0, 0.095, -0.245); g.add(dot);
    var h = makeHand(-1); h.position.set(0, -0.10, 0.02); h.rotation.set(-0.15, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(0, -0.10, -0.24); h2.rotation.set(-0.2, 0, 0); g.add(h2);
    g.userData.parts = { mag: mag, magRest: mag.position.y };
    g.userData.eject = new T.Vector3(0.05, 0.06, -0.04);
    addFlash(g, new T.Vector3(0, 0.005, -0.52), 1.0);
    g.userData.rest = { x: 0.23, y: -0.29, z: -0.50, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.20, x: -0.05, y: 0.05, z: 0.05, rx: -0.2, ry: 0.6, rz: 0.5 },
        { t: 0.46, x: -0.03, y: 0.06, z: 0.04, rx: -0.1, ry: -0.6, rz: -0.3 },
        { t: 0.72, x: 0.0, y: 0.05, z: 0.0, rx: -0.45, ry: 0.15, rz: 0.1 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* ---------- 霰弹枪 ---------- */
  BUILD.shotgun = function () {
    var g = new T.Group();
    box(M.gun, 0.085, 0.11, 0.34, 0, 0.01, -0.06, g);               /* 机匣 */
    cyl(M.steel2, 0.028, 0.028, 0.50, 0, 0.025, -0.46, g, [Math.PI / 2, 0, 0]);
    cyl(M.dark, 0.024, 0.024, 0.46, 0, -0.035, -0.44, g, [Math.PI / 2, 0, 0]);
    var pump = new T.Group(); pump.position.set(0, -0.045, -0.30); g.add(pump);
    box(M.wood2, 0.075, 0.075, 0.17, 0, 0, 0, pump);
    for (var i = 0; i < 4; i++) box(M.dark, 0.078, 0.012, 0.02, 0, -0.038, -0.06 + i * 0.04, pump);
    var stock = box(M.wood, 0.075, 0.10, 0.26, 0, -0.035, 0.21, g, [0.10, 0, 0]);
    box(M.dark, 0.06, 0.03, 0.10, 0, -0.085, 0.30, g, [0.10, 0, 0]);
    box(M.dark, 0.02, 0.03, 0.02, 0, 0.075, -0.68, g);              /* 准星 */
    box(M.dark, 0.05, 0.02, 0.03, 0, 0.075, 0.02, g);
    var h = makeHand(-1); h.position.set(0, -0.105, 0.08); h.rotation.set(-0.2, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(0, -0.10, -0.30); h2.rotation.set(-0.25, 0, 0); g.add(h2);
    g.userData.parts = { pump: pump, pumpRest: pump.position.z };
    g.userData.eject = new T.Vector3(0.06, 0.06, -0.08);
    addFlash(g, new T.Vector3(0, 0.025, -0.72), 1.4);
    g.userData.rest = { x: 0.22, y: -0.29, z: -0.48, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.22, x: -0.05, y: 0.04, z: 0.06, rx: -0.12, ry: 0.5, rz: 0.45 },
        { t: 0.50, x: -0.04, y: 0.05, z: 0.05, rx: -0.08, ry: -0.5, rz: -0.25 },
        { t: 0.76, x: 0.0, y: 0.04, z: 0.0, rx: -0.35, ry: 0.1, rz: 0.1 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* ---------- .357 马格南 ---------- */
  BUILD.magnum = function () {
    var g = new T.Group();
    box(M.steel2, 0.055, 0.085, 0.16, 0, 0.02, -0.03, g);
    cyl(M.steel, 0.022, 0.022, 0.36, 0, 0.05, -0.28, g, [Math.PI / 2, 0, 0]);
    box(M.steel2, 0.026, 0.022, 0.34, 0, 0.083, -0.28, g);          /* 散热肋 */
    var cylG = new T.Group(); cylG.position.set(0, 0.05, -0.055); g.add(cylG);
    var drum = cyl(M.steel, 0.055, 0.055, 0.085, 0, 0, 0, cylG, [0, 0, Math.PI / 2]);
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      cyl(M.dark, 0.014, 0.014, 0.09, 0, Math.cos(a) * 0.032, Math.sin(a) * 0.032, cylG, [0, 0, Math.PI / 2]);
    }
    var grip = box(M.wood, 0.058, 0.17, 0.09, 0, -0.095, 0.045, g, [-0.3, 0, 0]);
    box(M.steel2, 0.05, 0.016, 0.07, 0, -0.175, 0.075, g, [-0.3, 0, 0]);
    box(M.steel, 0.03, 0.03, 0.05, 0, -0.03, -0.055, g);            /* 击锤 */
    box(M.steel2, 0.028, 0.026, 0.05, 0, -0.045, -0.09, g);         /* 扳机护圈 */
    var h = makeHand(-1); h.position.set(0, -0.15, 0.05); h.rotation.set(-0.22, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(-0.045, -0.075, -0.05); h2.rotation.set(-0.95, 0.5, 0.25); g.add(h2);
    g.userData.parts = { cyl: cylG };
    g.userData.eject = new T.Vector3(0.05, 0.06, -0.06);
    addFlash(g, new T.Vector3(0, 0.05, -0.47), 1.25);
    g.userData.rest = { x: 0.25, y: -0.27, z: -0.50, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.24, x: -0.03, y: 0.05, z: 0.03, rx: -0.2, ry: 0.7, rz: 0.35 },
        { t: 0.55, x: -0.02, y: 0.05, z: 0.02, rx: -0.15, ry: -0.7, rz: -0.3 },
        { t: 0.80, x: 0.0, y: 0.06, z: -0.02, rx: -0.5, ry: 0.2, rz: -0.4 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* ---------- 十字弩 ---------- */
  BUILD.crossbow = function () {
    var g = new T.Group();
    box(M.gun, 0.06, 0.075, 0.42, 0, 0.0, -0.02, g);                /* 枪身 */
    box(M.wood2, 0.055, 0.08, 0.22, 0, -0.045, 0.16, g, [0.08, 0, 0]);
    var limbs = new T.Group(); limbs.position.set(0, 0.01, -0.22); g.add(limbs);
    box(M.steel2, 0.42, 0.022, 0.03, 0, 0.01, 0, limbs, [0, 0, 0.06]);
    box(M.steel2, 0.42, 0.022, 0.03, 0, 0.01, 0, limbs, [0, 0, -0.06]);
    var str = box(M.dark, 0.006, 0.006, 0.36, 0, 0.055, 0.05, g);
    var rail = box(M.steel2, 0.022, 0.022, 0.44, 0, 0.055, -0.10, g);
    var bolt = cyl(M.steel, 0.007, 0.007, 0.40, 0, 0.062, -0.16, g, [Math.PI / 2, 0, 0]);
    var scope = cyl(M.dark, 0.026, 0.03, 0.14, 0, 0.105, 0.02, g, [Math.PI / 2, 0, 0]);
    cyl(M.glowGreen, 0.02, 0.02, 0.012, 0, 0.105, -0.05, g, [Math.PI / 2, 0, 0]);
    box(M.gun2, 0.05, 0.09, 0.06, 0, -0.055, -0.06, g);             /* 握把 */
    var h = makeHand(-1); h.position.set(0, -0.10, -0.02); h.rotation.set(-0.18, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(0, -0.075, -0.20); h2.rotation.set(-0.3, 0, 0); g.add(h2);
    g.userData.parts = { bolt: bolt, str: str, boltRest: bolt.position.z, strRest: str.position.z };
    g.userData.eject = new T.Vector3(0, 0.06, -0.2);
    addFlash(g, new T.Vector3(0, 0.062, -0.40), 0.6);
    g.userData.rest = { x: 0.24, y: -0.28, z: -0.50, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.22, x: -0.05, y: 0.05, z: 0.04, rx: -0.15, ry: 0.55, rz: 0.4 },
        { t: 0.52, x: -0.04, y: 0.06, z: 0.03, rx: -0.1, ry: -0.55, rz: -0.25 },
        { t: 0.78, x: 0.0, y: 0.05, z: 0.0, rx: -0.4, ry: 0.1, rz: 0.1 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* ---------- AR2 脉冲步枪 ---------- */
  BUILD.ar2 = function () {
    var g = new T.Group();
    box(M.gun, 0.078, 0.105, 0.46, 0, 0.015, -0.14, g);
    box(M.gun2, 0.055, 0.06, 0.26, 0, 0.075, -0.10, g);
    cyl(M.dark, 0.019, 0.019, 0.28, 0, 0.02, -0.46, g, [Math.PI / 2, 0, 0]);
    var core = cyl(M.glowBlue, 0.03, 0.03, 0.10, 0, 0.075, -0.02, g, [Math.PI / 2, 0, 0]);
    box(M.dark, 0.07, 0.07, 0.10, 0.05, 0.02, -0.10, g);            /* 能量罐 */
    cyl(M.glowBlue, 0.014, 0.014, 0.16, 0.05, 0.02, -0.10, g, [0, 0, 0.3]);
    var mag = new T.Group(); mag.position.set(0, -0.11, -0.06); g.add(mag);
    box(M.dark, 0.05, 0.24, 0.08, 0, 0, 0, mag);
    box(M.glowOrange, 0.052, 0.02, 0.082, 0, -0.06, 0, mag);
    box(M.gun2, 0.05, 0.065, 0.19, 0, -0.01, 0.22, g);              /* 枪托 */
    box(M.gun2, 0.05, 0.05, 0.11, 0, -0.06, -0.26, g);              /* 前握把 */
    var sight = box(M.dark, 0.035, 0.06, 0.08, 0, 0.105, -0.14, g);
    cyl(M.glowBlue, 0.016, 0.02, 0.02, 0, 0.105, -0.19, g, [Math.PI / 2, 0, 0]);
    var h = makeHand(-1); h.position.set(0, -0.11, 0.0); h.rotation.set(-0.15, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(0, -0.10, -0.26); h2.rotation.set(-0.2, 0, 0); g.add(h2);
    g.userData.parts = { mag: mag, magRest: mag.position.y, core: core };
    g.userData.eject = new T.Vector3(0.06, 0.07, -0.05);
    addFlash(g, new T.Vector3(0, 0.02, -0.60), 1.05);
    g.userData.rest = { x: 0.23, y: -0.29, z: -0.50, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.20, x: -0.05, y: 0.05, z: 0.05, rx: -0.18, ry: 0.6, rz: 0.45 },
        { t: 0.48, x: -0.03, y: 0.06, z: 0.04, rx: -0.1, ry: -0.6, rz: -0.3 },
        { t: 0.74, x: 0.0, y: 0.05, z: 0.0, rx: -0.4, ry: 0.15, rz: 0.1 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* ---------- 重力枪 ---------- */
  BUILD.gravgun = function () {
    var g = new T.Group();
    cyl(M.gun2, 0.045, 0.055, 0.30, 0, 0, -0.10, g, [Math.PI / 2, 0, 0]);
    box(M.dark, 0.07, 0.07, 0.12, 0, -0.02, 0.06, g);
    /* 三根爪 */
    var claws = new T.Group(); claws.position.set(0, 0, -0.26); g.add(claws);
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI * 2 / 3;
      var c = box(M.steel2, 0.022, 0.022, 0.20, Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.10, claws,
        [0, 0, 0]);
      c.rotation.z = -a;
      c.rotation.x = 0.25;
    }
    /* 核心 */
    var core = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), new T.MeshBasicMaterial({
      color: 0x66ddff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false
    }));
    core.position.set(0, 0, -0.24); g.add(core);
    var ring = new T.Mesh(new T.TorusGeometry(0.062, 0.009, 8, 18), M.glowBlue);
    ring.position.set(0, 0, -0.24); g.add(ring);
    var ring2 = new T.Mesh(new T.TorusGeometry(0.085, 0.007, 8, 20), M.glowBlue);
    ring2.position.set(0, 0, -0.20); ring2.rotation.y = 0.4; g.add(ring2);
    /* 侧面管 */
    cyl(M.dark, 0.014, 0.014, 0.26, 0.055, -0.03, -0.06, g, [Math.PI / 2, 0, 0.2]);
    cyl(M.dark, 0.014, 0.014, 0.26, -0.055, -0.03, -0.06, g, [Math.PI / 2, 0, -0.2]);
    box(M.dark, 0.055, 0.15, 0.075, 0, -0.10, 0.06, g, [-0.25, 0, 0]);
    var h = makeHand(-1); h.position.set(0, -0.15, 0.04); h.rotation.set(-0.2, 0, 0); g.add(h);
    var h2 = makeHand(1); h2.position.set(-0.02, -0.05, -0.16); h2.rotation.set(-0.6, 0.3, 0.4); g.add(h2);
    g.userData.parts = { core: core, ring: ring, ring2: ring2, claws: claws };
    addFlash(g, new T.Vector3(0, 0, -0.30), 0.0);
    g.userData.rest = { x: 0.24, y: -0.28, z: -0.52, rx: 0, ry: 0, rz: 0 };
    g.userData.tracks = {
      inspect: [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.24, x: -0.04, y: 0.06, z: 0.05, rx: -0.2, ry: 0.75, rz: 0.4 },
        { t: 0.54, x: -0.03, y: 0.07, z: 0.04, rx: -0.15, ry: -0.75, rz: -0.3 },
        { t: 0.80, x: 0.0, y: 0.06, z: 0.0, rx: -0.35, ry: 0.1, rz: 0.1 },
        { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ]
    };
    return g;
  };

  /* =====================================================================
     动画轨道采样
     ===================================================================== */
  var FIELDS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
  function sampleTrack(keys, t) {
    var i = 0;
    for (i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1].t) break;
    var a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    var span = Math.max(1e-5, b.t - a.t);
    var u = G.clamp((t - a.t) / span, 0, 1);
    u = u * u * (3 - 2 * u);
    var out = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    for (var k = 0; k < FIELDS.length; k++) {
      var f = FIELDS[k];
      out[f] = G.lerp(a[f] || 0, b[f] || 0, u);
    }
    return out;
  }

  /* =====================================================================
     武器装配台（模型 + 动画）
     ===================================================================== */
  var DUR = { fire: 0.26, inspect: 2.6, draw: 0.42, melee: 0.5, alt: 0.45 };

  function Rig(viewRoot) {
    this.root = viewRoot;
    this.models = {};
    this.current = 'crowbar';
    this.t = 0;
    this.bobPhase = 0;
    this.anim = { fire: -1, reload: -1, inspect: -1, draw: -1, melee: -1, alt: -1 };
    this.dur = { fire: DUR.fire, reload: 1, inspect: DUR.inspect, draw: DUR.draw, melee: DUR.melee, alt: DUR.alt };
    this.flashT = 0;
    this.shellT = 0;
    this.casings = [];
    this.sprint = 0;
    for (var i = 0; i < G.WORDER.length; i++) {
      var k = G.WORDER[i];
      var m = BUILD[k]();
      m.visible = false;
      viewRoot.add(m);
      this.models[k] = m;
    }
    this.models[this.current].visible = true;
    /* 抛壳 */
    var cg = new T.CylinderGeometry(0.008, 0.008, 0.024, 6);
    for (var c = 0; c < 8; c++) {
      var cm = new T.Mesh(cg, G.plain(0xd8b020, { shin: 100, spec: 0xffffff }));
      cm.visible = false;
      viewRoot.add(cm);
      this.casings.push({ mesh: cm, vx: 0, vy: 0, vz: 0, spin: 0, life: 0 });
    }
  }

  Rig.prototype.weapon = function () { return G.WEAPONS[this.current]; };
  Rig.prototype.model = function () { return this.models[this.current]; };

  Rig.prototype.exists = function (key) { return !!this.models[key]; };

  Rig.prototype.setWeapon = function (key, instant) {
    if (!this.models[key] || this.current === key) return;
    this.models[this.current].visible = false;
    this.current = key;
    var m = this.models[key];
    m.visible = true;
    this.anim.inspect = -1;
    this.anim.reload = -1;
    this.anim.fire = -1;
    this.anim.melee = -1;
    if (!instant) this.anim.draw = 0;
  };

  Rig.prototype.triggerFire = function () {
    var W = this.weapon();
    this.anim.inspect = -1;
    this.dur.fire = G.clamp(W.rate * 1.6, 0.13, 0.4);
    this.anim.fire = 0;
    this.flashT = 0.055;
    var m = this.models[this.current];
    if (m.userData.parts && m.userData.parts.slide) m.userData.parts.slide.__kick = 1;
    if (W.pump) this.shellT = 0.16;
    if (W.shell || W.bolt) this.ejectShell();
  };

  Rig.prototype.triggerAlt = function () {
    this.anim.inspect = -1;
    this.dur.alt = 0.5;
    this.anim.alt = 0;
    this.flashT = 0.09;
  };

  Rig.prototype.triggerMelee = function () {
    this.anim.inspect = -1;
    this.dur.melee = 0.5;
    this.anim.melee = 0;
  };

  Rig.prototype.startReload = function (dur) {
    this.anim.inspect = -1;
    this.anim.fire = -1;
    this.dur.reload = Math.max(0.4, dur || 1);
    this.anim.reload = 0;
  };

  Rig.prototype.cancelReload = function () { this.anim.reload = -1; };

  Rig.prototype.startInspect = function () {
    if (this.anim.reload >= 0) return false;
    this.anim.inspect = 0;
    return true;
  };

  Rig.prototype.isInspecting = function () { return this.anim.inspect >= 0; };

  Rig.prototype.ejectShell = function () {
    for (var i = 0; i < this.casings.length; i++) {
      var c = this.casings[i];
      if (c.life > 0) continue;
      var m = this.models[this.current];
      var e = m.userData.eject || new T.Vector3(0.05, 0.06, -0.05);
      c.mesh.position.set(m.position.x + e.x, m.position.y + e.y, m.position.z + e.z);
      c.mesh.visible = true;
      c.vx = G.rand(0.7, 1.4); c.vy = G.rand(0.8, 1.5); c.vz = G.rand(0.4, 1.1);
      c.spin = G.rand(-22, 22);
      c.life = 1.1;
      return;
    }
  };

  /* 主更新：计算最终位姿 */
  Rig.prototype.update = function (dt, ctx) {
    this.t += dt;
    var A = this.anim, i, k;
    for (k in A) {
      if (A[k] >= 0) {
        A[k] += dt;
        if (A[k] >= (k === 'reload' ? this.dur.reload : this.dur[k])) A[k] = -1;
      }
    }

    var m = this.models[this.current];
    if (!m) return;
    var rest = m.userData.rest;
    var ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0;

    /* --- 呼吸 --- */
    oy += Math.sin(this.t * 1.7) * 0.0035;
    ox += Math.sin(this.t * 1.1) * 0.0022;
    rx += Math.sin(this.t * 1.35) * 0.008;
    rz += Math.sin(this.t * 0.9) * 0.006;

    /* --- 行走摆动 --- */
    var bamt = G.clamp((ctx.speed || 0) / 4.7, 0, 1.15);
    this.bobPhase = ctx.bobPhase || this.bobPhase;
    oy += Math.sin(this.bobPhase * 2) * 0.011 * bamt;
    ox += Math.cos(this.bobPhase) * 0.016 * bamt;
    rz += Math.cos(this.bobPhase) * 0.022 * bamt;
    rx += Math.abs(Math.sin(this.bobPhase)) * 0.012 * bamt;

    /* --- 冲刺：压低枪口 --- */
    var spTarget = ctx.sprint ? 1 : 0;
    this.sprint = G.smooth(this.sprint, spTarget, 7, dt);
    if (this.sprint > 0.001) {
      var s = this.sprint;
      oy -= 0.075 * s; oz += 0.10 * s; rx -= 0.30 * s; rz += 0.42 * s; ry -= 0.12 * s;
    }

    /* --- 蹲下 --- */
    if (ctx.crouch) { oy += 0.012; rx += 0.05; }

    /* --- 开火后坐 --- */
    if (A.fire >= 0) {
      var p = A.fire / this.dur.fire;
      var kick = Math.sin(Math.min(1, p) * Math.PI);
      var power = (this.weapon().recoil || 0.5);
      oz += 0.055 * kick * power;
      rx -= 0.16 * kick * power;
      oy += 0.014 * kick * power;
      rz += G.rand(-1, 1) * 0.02 * kick * power;
    }

    /* --- 装弹 --- */
    if (A.reload >= 0) {
      var rp = G.clamp(A.reload / this.dur.reload, 0, 1);
      var d = Math.sin(Math.min(1, rp * 1.12) * Math.PI);
      oy -= 0.17 * d;
      rz += 0.62 * d;
      rx -= 0.34 * d;
      oz += 0.06 * d;
      ox -= 0.03 * d;
      /* 弹匣 / 泵 / 拉栓 等部件动作 */
      var P = m.userData.parts;
      if (P && P.mag) {
        var mp = G.clamp((rp - 0.10) / 0.35, 0, 1);
        var mn = G.clamp((rp - 0.55) / 0.35, 0, 1);
        P.mag.position.y = P.magRest - (1 - mn) * mp * 0.20;
        P.mag.rotation.z = mp * (1 - mn) * 0.4;
      }
      if (P && P.cyl) P.cyl.rotation.x += dt * 6 * d;
      if (P && P.bolt) {
        var bp = G.clamp((rp - 0.05) / 0.3, 0, 1) * (1 - G.clamp((rp - 0.62) / 0.3, 0, 1));
        P.bolt.position.z = P.boltRest + bp * 0.20;
      }
      if (P && P.str) P.str.position.z = P.strRest + d * 0.12;
    }

    /* --- 检视 --- */
    if (A.inspect >= 0 && m.userData.tracks && m.userData.tracks.inspect) {
      var ip = G.clamp(A.inspect / this.dur.inspect, 0, 1);
      var s2 = sampleTrack(m.userData.tracks.inspect, ip);
      ox += s2.x; oy += s2.y; oz += s2.z;
      rx += s2.rx; ry += s2.ry; rz += s2.rz;
    }

    /* --- 撬棍挥击 --- */
    if (A.melee >= 0 && m.userData.tracks && m.userData.tracks.melee) {
      var mp2 = G.clamp(A.melee / this.dur.melee, 0, 1);
      var s3 = sampleTrack(m.userData.tracks.melee, mp2);
      ox += s3.x; oy += s3.y; oz += s3.z;
      rx += s3.rx; ry += s3.ry; rz += s3.rz;
    }

    /* --- 抽枪 --- */
    if (A.draw >= 0) {
      var dp = G.clamp(A.draw / this.dur.draw, 0, 1);
      var e2 = 1 - dp;
      e2 = e2 * e2;
      oy -= 0.42 * e2;
      rx += 0.9 * e2;
      rz += 0.35 * e2;
    }

    /* --- 切换武器（其它武器隐藏） --- */
    for (i = 0; i < G.WORDER.length; i++) {
      var key = G.WORDER[i];
      if (key !== this.current && this.models[key].visible) this.models[key].visible = false;
    }

    m.position.set(rest.x + ox, rest.y + oy, rest.z + oz);
    m.rotation.set(rest.rx + rx, rest.ry + ry, rest.rz + rz);

    /* --- 套筒复位 --- */
    var Pt = m.userData.parts;
    if (Pt && Pt.slide) {
      var kk = Pt.slide.__kick || 0;
      if (kk > 0) {
        kk = Math.max(0, kk - dt * 12);
        Pt.slide.__kick = kk;
        Pt.slide.position.z = Pt.slideRest + kk * 0.055;
      }
    }
    /* --- 霰弹枪泵动 --- */
    if (Pt && Pt.pump && this.shellT > 0) {
      this.shellT -= dt;
      var pp = 1 - G.clamp(this.shellT / 0.16, 0, 1);
      Pt.pump.position.z = Pt.pumpRest + Math.sin(pp * Math.PI) * 0.13;
    }
    /* --- 重力枪核心脉动 --- */
    if (Pt && Pt.core) {
      var pulse = 0.8 + Math.sin(this.t * 6) * 0.2 + (ctx.gravHold ? 0.8 : 0);
      Pt.core.scale.setScalar(pulse);
      Pt.core.material.opacity = G.clamp(0.45 + pulse * 0.5, 0, 1);
      if (Pt.ring) Pt.ring.rotation.z += dt * (ctx.gravHold ? 7 : 1.6);
      if (Pt.ring2) Pt.ring2.rotation.y += dt * (ctx.gravHold ? 5 : 1.1);
      if (Pt.claws) Pt.claws.rotation.z += dt * (ctx.gravHold ? 4 : 0.5);
    }
    /* --- 枪口闪光 --- */
    var f = m.userData.flash;
    if (f) {
      if (this.flashT > 0) {
        this.flashT -= dt;
        f.visible = true;
        var fs = 0.85 + Math.random() * 0.5;
        f.scale.set(fs, fs, fs);
        f.rotation.z = Math.random() * 6.28;
      } else f.visible = false;
    }
    /* --- 抛壳 --- */
    for (i = 0; i < this.casings.length; i++) {
      var c = this.casings[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vy -= 3.2 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.spin * dt;
      c.mesh.rotation.z += c.spin * 0.6 * dt;
      if (c.life < 0.3) c.mesh.visible = false;
    }
  };

  /* 枪口在视图空间的位置（用于生成曳光/特效的世界坐标） */
  Rig.prototype.muzzleLocal = function () {
    var m = this.models[this.current];
    var f = m && m.userData.flash;
    if (!f) return new T.Vector3(0, 0, -0.5);
    return new T.Vector3(f.position.x + m.position.x, f.position.y + m.position.y, f.position.z + m.position.z);
  };

  G.WeaponRig = Rig;
  G.WBUILD = BUILD;
  console.log('[HL3] weapons.js 已加载：' + G.WORDER.length + ' 把武器');
})();
