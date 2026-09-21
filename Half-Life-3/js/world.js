/* =========================================================================
   半条命 3：重返黑山  ——  world.js
   关卡构建：黑山基地东翼 -> 中央中庭 -> 生物实验室 -> 维护隧道 -> 反应堆核心
   ========================================================================= */
(function () {
  'use strict';
  var T = THREE, G = window.G;

  var level = (G.level = {
    spawn: { x: 0, y: 0.1, z: 18 },
    spawnYaw: 0,
    pickups: [],
    valves: [],
    triggers: [],
    barrels: [],
    props: [],
    stations: [],
    lamps: [],
    pool: [],
    rooms: [],
    flicker: [],
    portal: null,
    sludge: []
  });

  var scenes = null;
  var boxGeo = new T.BoxGeometry(1, 1, 1);
  var cylGeo = new T.CylinderGeometry(0.5, 0.5, 1, 14);
  var cylGeo8 = new T.CylinderGeometry(0.5, 0.5, 1, 8);

  /* =====================================================================
     基础构件
     ===================================================================== */
  function solid(kind, w, h, d, x, y, z, tag) {
    return G.box(scenes, kind, w, h, d, x, y, z, true, tag);
  }
  function deco(kind, w, h, d, x, y, z) {
    return G.box(scenes, kind, w, h, d, x, y, z, false);
  }

  /** 构建一个房间（地板 / 天花板 / 四面墙，墙上可开门洞） */
  function room(spec) {
    var x0 = spec.x0, x1 = spec.x1, z0 = spec.z0, z1 = spec.z1;
    var y0 = spec.y0 || 0, h = spec.h;
    var w = x1 - x0, d = z1 - z0;
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    var fk = spec.floor || 'floor', ck = spec.ceil || 'ceiling', wk = spec.wall || 'concrete';

    if (!spec.noFloor) solid(fk, w, 1, d, cx, y0 - 0.5, cz, 'floor');
    if (!spec.noCeil) solid(ck, w, 1, d, cx, y0 + h + 0.5, cz, 'ceil');

    var doors = spec.doors || [];
    ['n', 's', 'e', 'w'].forEach(function (side) {
      var list = doors.filter(function (dd) { return dd.side === side; });
      buildWall(side, x0, x1, z0, z1, y0, h, wk, list, spec.t || 0.6);
    });
    level.rooms.push({ x0: x0, x1: x1, z0: z0, z1: z1, y0: y0, h: h, name: spec.name || '' });
    return spec;
  }

  function buildWall(side, x0, x1, z0, z1, y0, h, wk, doors, t) {
    var horizontal = (side === 'n' || side === 's');
    var a0 = horizontal ? x0 : z0;
    var a1 = horizontal ? x1 : z1;
    var fixed = side === 'n' ? z0 - t / 2 : side === 's' ? z1 + t / 2 :
                side === 'w' ? x0 - t / 2 : x1 + t / 2;
    var mats = G.mat(wk, Math.max((a1 - a0), h) / 3.2, (horizontal ? h : h) / 3.2);
    var mesh, len, c;

    function seg(sa, sb, yy, hh) {
      if (sb - sa < 0.02) return;
      len = sb - sa; c = (sa + sb) / 2;
      mesh = new T.Mesh(boxGeo, mats);
      if (horizontal) {
        mesh.scale.set(len, hh, t); mesh.position.set(c, yy, fixed);
        G.world.add(c, yy, fixed, len, hh, t, 'wall');
      } else {
        mesh.scale.set(t, hh, len); mesh.position.set(fixed, yy, c);
        G.world.add(fixed, yy, c, t, hh, len, 'wall');
      }
      scenes.add(mesh);
      return mesh;
    }
    doors.sort(function (p, q) { return p.at - q.at; });
    var cursor = a0;
    for (var i = 0; i < doors.length; i++) {
      var dd = doors[i], dw = dd.w || 3.4, dh = dd.h || 2.9;
      seg(cursor, dd.at - dw / 2, y0 + h / 2, h);
      /* 门楣 */
      seg(dd.at - dw / 2, dd.at + dw / 2, y0 + dh + (h - dh) / 2, h - dh);
      cursor = dd.at + dw / 2;
    }
    seg(cursor, a1, y0 + h / 2, h);
  }

  /* 天花板灯：只登记一盏「虚拟灯」，真正的光源由全局灯光池复用。
     这样场景里的灯光数量恒定不变，不会被 three.js 反复重编译着色器。 */
  function lamp(x, y, z, color, intensity, dist, broken) {
    deco('panel', 2.2, 0.14, 1.0, x, y - 0.05, z);
    /* 灯泡辉光（Sprite，永远面向相机）—— 让灯光看起来是「发光体」而不是一块亮板 */
    var sm = new T.SpriteMaterial({
      map: G.tex('glow'), color: color || 0xffd9a0,
      transparent: true, opacity: broken ? 0.10 : 0.22,
      blending: T.AdditiveBlending, depthWrite: false
    });
    var sp = new T.Sprite(sm);
    sp.position.set(x, y - 0.18, z);
    sp.scale.set(2.4, 2.4, 1);
    sp.renderOrder = 2;
    scenes.add(sp);
    var rec = {
      pos: { x: x, y: y - 0.4, z: z },
      color: color || 0xffd9a0,
      base: intensity || 0.9, cur: intensity || 0.9,
      dist: dist || 22, broken: !!broken, pool: null, _d: 1e9, glow: sm, glowBase: broken ? 0.10 : 0.22
    };
    level.lamps.push(rec);
    if (broken) level.flicker.push(rec);
    return rec;
  }

  /* 全局灯光池：固定 N 盏点光源，永远可见，只换位置与强度。
     移动端降到 5 盏以降低逐像素光照开销（数量恒定，不会触发着色器重编译） */
  var LIGHT_POOL = (G.PLATFORM && G.PLATFORM.lightPool) || 8;
  function initLightPool() {
    for (var i = 0; i < LIGHT_POOL; i++) {
      var L = new T.PointLight(0xffd9a0, 0, 24, 2);
      L.position.set(0, -1000, 0);
      scenes.add(L);
      level.pool.push({ light: L, lamp: null });
    }
  }

  /* 木箱（可被重力枪抓取投掷） */
  function crate(x, y, z, s, rot) {
    s = s || 1.1;
    var g = new T.Group();
    g.position.set(x, y + s / 2, z);
    if (rot) g.rotation.y = rot;
    scenes.add(g);
    var body = new T.Mesh(boxGeo, G.mat('crate', s / 1.4, s / 1.4));
    body.scale.set(s, s, s);
    g.add(body);
    /* 四条竖向包角，让箱子有立体轮廓 */
    var edge = G.plain(0x5c636b, { shin: 60, spec: 0x778899 });
    var t = s * 0.075;
    for (var ex = -1; ex <= 1; ex += 2) {
      for (var ez = -1; ez <= 1; ez += 2) {
        var c = new T.Mesh(boxGeo, edge);
        c.scale.set(t, s * 1.01, t);
        c.position.set(ex * (s / 2 - t / 2), 0, ez * (s / 2 - t / 2));
        g.add(c);
      }
    }
    /* 顶部压条 */
    var lid = new T.Mesh(boxGeo, edge);
    lid.scale.set(s * 1.01, t * 0.5, t);
    lid.position.set(0, s / 2, 0);
    g.add(lid);
    var sol = G.world.add(x, y + s / 2, z, s, s, s, 'crate');
    level.props.push({
      kind: 'crate', mesh: g, solid: sol, hw: s / 2, hh: s / 2,
      vel: { x: 0, y: 0, z: 0 }, explosive: false, held: false, thrown: false, spinSign: 1
    });
    return g;
  }
  /* 爆炸桶 */
  function barrel(x, y, z, explosive) {
    var g = new T.Group();
    g.position.set(x, y + 0.52, z);
    scenes.add(g);
    var bodyMat = G.plain(explosive ? 0xa8382a : 0x7d6a3c, { shin: 44, spec: 0x555555 });
    var bandMat = G.plain(0x2b2b2b, { shin: 24, spec: 0x445566 });
    var rimMat = G.plain(0x8a9298, { shin: 74, spec: 0x9fb0c0 });
    var body = new T.Mesh(cylGeo, bodyMat);
    body.scale.set(0.70, 1.00, 0.70);
    g.add(body);
    /* 三道加强箍 */
    for (var i = 0; i < 3; i++) {
      var rb = new T.Mesh(cylGeo8, bandMat);
      rb.scale.set(0.755, 0.075, 0.755);
      rb.position.y = -0.32 + i * 0.32;
      g.add(rb);
    }
    /* 顶盖 + 法兰 + 阀门 */
    var top = new T.Mesh(cylGeo8, rimMat);
    top.scale.set(0.74, 0.06, 0.74); top.position.y = 0.51; g.add(top);
    var cap = new T.Mesh(cylGeo8, rimMat);
    cap.scale.set(0.26, 0.09, 0.26); cap.position.y = 0.555; g.add(cap);
    var valve = new T.Mesh(boxGeo, G.plain(0xb03020, { shin: 60, spec: 0x884444 }));
    valve.scale.set(0.095, 0.032, 0.30); valve.position.set(0, 0.605, 0); g.add(valve);
    /* 底圈 */
    var bot = new T.Mesh(cylGeo8, bandMat);
    bot.scale.set(0.75, 0.07, 0.75); bot.position.y = -0.49; g.add(bot);
    /* 标签 / 危险标识 */
    var lbl = new T.Mesh(boxGeo, G.plain(0xd8c840, { shin: 30, emis: 0x2a2400, emisI: 0.25 }));
    lbl.scale.set(0.30, 0.20, 0.02);
    lbl.position.set(0, 0.06, -0.355);
    g.add(lbl);
    var lbl2 = lbl.clone();
    lbl2.position.z = 0.355;
    g.add(lbl2);
    var sol = G.world.add(x, y + 0.52, z, 0.72, 1.05, 0.72, 'barrel');
    var rec = { mesh: g, pos: { x: x, y: y + 0.52, z: z }, hp: 22, exploded: false, explosive: explosive !== false };
    level.barrels.push(rec);
    level.props.push({
      kind: 'barrel', mesh: g, solid: sol, hw: 0.36, hh: 0.525,
      vel: { x: 0, y: 0, z: 0 }, explosive: rec.explosive, barrel: rec,
      held: false, thrown: false, spinSign: 1
    });
    return g;
  }
  /* 管道（装饰） */
  function pipe(x, y, z, len, axis, color, radius) {
    var m = new T.Mesh(cylGeo8, G.plain(color || 0x6b5a4a, { shin: 30, spec: 0x444444 }));
    radius = radius || 0.16;
    if (axis === 'x') { m.rotation.z = Math.PI / 2; m.scale.set(radius * 2, len, radius * 2); }
    else if (axis === 'z') { m.rotation.x = Math.PI / 2; m.scale.set(radius * 2, len, radius * 2); }
    else { m.scale.set(radius * 2, len, radius * 2); }
    m.position.set(x, y, z);
    scenes.add(m);
    return m;
  }
  /* 栏杆（实体，防止坠落） */
  function railing(x1, z1, x2, z2, y) {
    var dx = x2 - x1, dz = z2 - z1;
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) return;
    var cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    var rot = Math.atan2(dx, dz);
    var bar = new T.Mesh(boxGeo, G.plain(0x9a6b2a, { shin: 60, spec: 0x777777 }));
    bar.scale.set(0.09, 0.09, len);
    bar.position.set(cx, y + 1.0, cz);
    bar.rotation.y = rot;
    scenes.add(bar);
    G.world.add(cx, y + 1.0, cz, rot === 0 ? 0.09 : len, 0.09, rot === 0 ? len : 0.09, 'rail');
    /* 立柱 */
    var n = Math.max(2, Math.round(len / 2));
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var p = new T.Mesh(boxGeo, G.plain(0x8a6024, { shin: 40 }));
      p.scale.set(0.08, 1.0, 0.08);
      p.position.set(x1 + dx * t, y + 0.5, z1 + dz * t);
      scenes.add(p);
    }
  }
  /* 危险条纹贴条 */
  function hazardStrip(x, y, z, w, d) {
    var m = new T.Mesh(boxGeo, G.mat('hazard', w / 1.2, d / 1.2));
    m.scale.set(w, 0.02, d);
    m.position.set(x, y + 0.02, z);
    scenes.add(m);
  }

  /* 拾取物外观 */
  function pickupMesh(type) {
    var g = new T.Group();
    var m;
    if (type === 'medkit') {
      m = new T.Mesh(boxGeo, G.plain(0xe8e8e0, { shin: 30 }));
      m.scale.set(0.34, 0.24, 0.24); g.add(m);
      var c1 = new T.Mesh(boxGeo, G.plain(0xd02020, { emis: 0x330000 }));
      c1.scale.set(0.07, 0.17, 0.26); g.add(c1);
      var c2 = new T.Mesh(boxGeo, G.plain(0xd02020, { emis: 0x330000 }));
      c2.scale.set(0.36, 0.06, 0.26); g.add(c2);
    } else if (type === 'battery') {
      m = new T.Mesh(cylGeo, G.plain(0xff9c22, { shin: 60, spec: 0x888888, emis: 0x552200 }));
      m.scale.set(0.20, 0.44, 0.20); g.add(m);
      var cap = new T.Mesh(cylGeo, G.plain(0x333333, { shin: 60 }));
      cap.scale.set(0.22, 0.07, 0.22); cap.position.y = 0.24; g.add(cap);
    } else if (type === 'grenade') {
      m = new T.Mesh(cylGeo, G.plain(0x4b5a3a, { shin: 30 }));
      m.scale.set(0.18, 0.26, 0.18); g.add(m);
      var lv = new T.Mesh(boxGeo, G.plain(0x888888, { shin: 80 }));
      lv.scale.set(0.12, 0.05, 0.06); lv.position.y = 0.16; g.add(lv);
    } else if (type === 'pistol') {
      m = new T.Mesh(boxGeo, G.plain(0x2a2d33, { shin: 80, spec: 0x999999 }));
      m.scale.set(0.42, 0.11, 0.09); g.add(m);
      var gp = new T.Mesh(boxGeo, G.plain(0x1e2126, { shin: 40 }));
      gp.scale.set(0.10, 0.20, 0.09); gp.position.set(-0.14, -0.14, 0); gp.rotation.z = 0.22; g.add(gp);
    } else if (type === 'smg') {
      m = new T.Mesh(boxGeo, G.plain(0x2f333a, { shin: 80, spec: 0x999999 }));
      m.scale.set(0.62, 0.12, 0.10); g.add(m);
      var mg = new T.Mesh(boxGeo, G.plain(0x22252b, { shin: 50 }));
      mg.scale.set(0.12, 0.26, 0.10); mg.position.set(0.02, -0.18, 0); g.add(mg);
      var st = new T.Mesh(boxGeo, G.plain(0x1e2126, { shin: 40 }));
      st.scale.set(0.10, 0.18, 0.09); st.position.set(-0.26, -0.12, 0); st.rotation.z = 0.2; g.add(st);
    } else if (type === 'shotgun') {
      m = new T.Mesh(boxGeo, G.plain(0x5a3a22, { shin: 40 }));
      m.scale.set(0.34, 0.12, 0.10); m.position.x = -0.2; g.add(m);
      var b1 = new T.Mesh(boxGeo, G.plain(0x30343a, { shin: 90, spec: 0xaaaaaa }));
      b1.scale.set(0.70, 0.09, 0.09); b1.position.x = 0.18; g.add(b1);
      var b2 = new T.Mesh(cylGeo8, G.plain(0x30343a, { shin: 90 }));
      b2.rotation.z = Math.PI / 2; b2.scale.set(0.07, 0.60, 0.07); b2.position.set(0.20, -0.09, 0); g.add(b2);
    } else if (type === 'magnum') {
      m = new T.Mesh(boxGeo, G.plain(0x9aa2ab, { shin: 120, spec: 0xdddddd }));
      m.scale.set(0.40, 0.10, 0.09); g.add(m);
      var mcy = new T.Mesh(cylGeo8, G.plain(0x8a929b, { shin: 110 }));
      mcy.scale.set(0.16, 0.12, 0.16); mcy.rotation.z = Math.PI / 2; mcy.position.x = -0.04; g.add(mcy);
      var mba = new T.Mesh(cylGeo8, G.plain(0x8a929b, { shin: 110 }));
      mba.rotation.z = Math.PI / 2; mba.scale.set(0.06, 0.34, 0.06); mba.position.set(0.22, 0.03, 0); g.add(mba);
      var mgp = new T.Mesh(boxGeo, G.plain(0x5a3a22, { shin: 30 }));
      mgp.scale.set(0.11, 0.20, 0.09); mgp.position.set(-0.15, -0.14, 0); mgp.rotation.z = 0.3; g.add(mgp);
    } else if (type === 'crossbow') {
      m = new T.Mesh(boxGeo, G.plain(0x4a3018, { shin: 30 }));
      m.scale.set(0.54, 0.10, 0.09); g.add(m);
      var cbx = new T.Mesh(boxGeo, G.plain(0x6e767e, { shin: 110, spec: 0xcccccc }));
      cbx.scale.set(0.56, 0.06, 0.05); cbx.position.x = 0.20; g.add(cbx);
      var csc = new T.Mesh(cylGeo8, G.plain(0x1b1e23, { shin: 50 }));
      csc.rotation.z = Math.PI / 2; csc.scale.set(0.09, 0.2, 0.09); csc.position.set(0.0, 0.13, 0); g.add(csc);
    } else if (type === 'ar2') {
      m = new T.Mesh(boxGeo, G.plain(0x3a4048, { shin: 70, spec: 0x888888 }));
      m.scale.set(0.62, 0.13, 0.10); g.add(m);
      var acore = new T.Mesh(cylGeo8, new T.MeshBasicMaterial({ color: 0x66ddff }));
      acore.rotation.z = Math.PI / 2; acore.scale.set(0.08, 0.14, 0.08); acore.position.set(0.02, 0.10, 0); g.add(acore);
      var amg = new T.Mesh(boxGeo, G.plain(0x1b1e23, { shin: 50 }));
      amg.scale.set(0.11, 0.26, 0.09); amg.position.set(0.0, -0.19, 0); g.add(amg);
    } else if (type === 'gravgun') {
      m = new T.Mesh(cylGeo8, G.plain(0x3a4048, { shin: 70 }));
      m.rotation.z = Math.PI / 2; m.scale.set(0.14, 0.46, 0.14); g.add(m);
      var gcore = new T.Mesh(new T.SphereGeometry(0.13, 12, 8), new T.MeshBasicMaterial({
        color: 0x66ddff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false
      }));
      gcore.position.x = 0.26; g.add(gcore);
      var grin = new T.Mesh(new T.TorusGeometry(0.17, 0.022, 8, 18), new T.MeshBasicMaterial({ color: 0x66ddff }));
      grin.rotation.y = Math.PI / 2; grin.position.x = 0.26; g.add(grin);
      var gcl = new T.Mesh(boxGeo, G.plain(0x6e767e, { shin: 110 }));
      gcl.scale.set(0.05, 0.05, 0.30); gcl.position.set(0.26, 0, 0); g.add(gcl);
    } else if (type === 'ammo_magnum') {
      m = new T.Mesh(boxGeo, G.plain(0x5a4a2a, { shin: 40 }));
      m.scale.set(0.30, 0.18, 0.22); g.add(m);
      var mb = new T.Mesh(boxGeo, G.plain(0xd8b32a, { emis: 0x3a2c00 }));
      mb.scale.set(0.32, 0.05, 0.24); mb.position.y = 0.06; g.add(mb);
    } else if (type === 'ammo_crossbow') {
      m = new T.Mesh(boxGeo, G.plain(0x3a3f45, { shin: 50 }));
      m.scale.set(0.30, 0.18, 0.22); g.add(m);
      for (var bi = 0; bi < 3; bi++) {
        var bo = new T.Mesh(cylGeo8, G.plain(0x8a929b, { shin: 110 }));
        bo.rotation.z = Math.PI / 2; bo.scale.set(0.035, 0.36, 0.035);
        bo.position.set(0, 0.13, -0.06 + bi * 0.06); g.add(bo);
      }
    } else if (type === 'ammo_ar2') {
      m = new T.Mesh(boxGeo, G.plain(0x2a3038, { shin: 60 }));
      m.scale.set(0.34, 0.2, 0.24); g.add(m);
      var ab = new T.Mesh(boxGeo, new T.MeshBasicMaterial({ color: 0x66ddff }));
      ab.scale.set(0.36, 0.05, 0.26); ab.position.y = 0.06; g.add(ab);
    } else if (type === 'ammo_smg' || type === 'ammo_pistol') {
      m = new T.Mesh(boxGeo, G.plain(0x4a4f56, { shin: 40 }));
      m.scale.set(0.34, 0.2, 0.24); g.add(m);
      var bd = new T.Mesh(boxGeo, G.plain(0xd8b32a, { emis: 0x3a2c00 }));
      bd.scale.set(0.36, 0.05, 0.26); bd.position.y = 0.06; g.add(bd);
    } else if (type === 'ammo_shotgun') {
      m = new T.Mesh(boxGeo, G.plain(0x6b3a24, { shin: 30 }));
      m.scale.set(0.34, 0.2, 0.26); g.add(m);
      var sh = new T.Mesh(cylGeo8, G.plain(0xc03020, { emis: 0x300000 }));
      sh.scale.set(0.06, 0.30, 0.06); sh.rotation.z = Math.PI / 2; sh.position.y = 0.16; g.add(sh);
    }
    /* 光晕 */
    var halo = new T.Mesh(new T.SphereGeometry(0.42, 10, 8),
      new T.MeshBasicMaterial({ color: 0xffbb55, transparent: true, opacity: 0.10, blending: T.AdditiveBlending, depthWrite: false }));
    g.add(halo);
    return g;
  }

  function addPickup(type, x, y, z, amount) {
    var mesh = pickupMesh(type);
    mesh.position.set(x, y + 0.55, z);
    scenes.add(mesh);
    level.pickups.push({ type: type, mesh: mesh, pos: { x: x, y: y + 0.55, z: z }, taken: false, amount: amount || 1, phase: Math.random() * 6.28, baseY: y + 0.55 });
    return mesh;
  }

  /* HEV 充能站 */
  function station(x, y, z, rotY) {
    var g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    scenes.add(g);
    var body = new T.Mesh(boxGeo, G.mat('metal', 0.7, 0.7));
    body.scale.set(1.2, 2.2, 0.6); body.position.y = 1.1; g.add(body);
    var screen = new T.Mesh(boxGeo, new T.MeshBasicMaterial({ color: 0x33ff88 }));
    screen.scale.set(0.7, 0.5, 0.05); screen.position.set(0, 1.5, 0.32); g.add(screen);
    var glow = new T.Mesh(new T.SphereGeometry(0.55, 10, 8), new T.MeshBasicMaterial({
      color: 0x33ff88, transparent: true, opacity: 0.13, blending: T.AdditiveBlending, depthWrite: false
    }));
    glow.position.set(0, 1.5, 0.55); g.add(glow);
    var rec = { pos: { x: x, y: y + 1.1, z: z }, uses: 3, mesh: g, screen: screen, glow: glow, cooldown: 0 };
    level.stations.push(rec);
    G.world.add(x, y + 1.1, z, 1.2, 2.2, 0.6, 'station');
    return rec;
  }

  /* 冷却阀门（任务目标） */
  function valve(x, y, z, rotY, index, label) {
    var g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    scenes.add(g);
    var base = new T.Mesh(boxGeo, G.mat('metal', 0.6, 0.8));
    base.scale.set(0.5, 1.5, 0.9); base.position.y = 0.75; g.add(base);
    var panel = new T.Mesh(boxGeo, G.plain(0x2c3138, { shin: 60 }));
    panel.scale.set(0.36, 0.4, 0.1); panel.position.set(0, 1.15, 0.5); g.add(panel);
    var wheel = new T.Group();
    wheel.position.set(0, 1.7, 0.0);
    var rim = new T.Mesh(new T.TorusGeometry(0.42, 0.07, 8, 20), G.plain(0xc03a2a, { shin: 70, spec: 0x888888 }));
    wheel.add(rim);
    for (var i = 0; i < 3; i++) {
      var sp = new T.Mesh(boxGeo, G.plain(0xb03020, { shin: 60 }));
      sp.scale.set(0.8, 0.06, 0.06);
      sp.rotation.z = i * Math.PI / 3;
      wheel.add(sp);
    }
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
    var led = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), new T.MeshBasicMaterial({ color: 0xff3020 }));
    led.position.set(0, 2.25, 0.0); g.add(led);
    var glow = new T.Mesh(new T.SphereGeometry(0.32, 10, 8), new T.MeshBasicMaterial({
      color: 0xff3020, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false
    }));
    glow.position.set(0, 2.25, 0.0); g.add(glow);
    G.world.add(x, y + 0.75, z, 0.6, 1.5, 0.9, 'valve');
    var rec = {
      index: index, label: label, mesh: g, wheel: wheel, led: led, glow: glow,
      pos: { x: x, y: y + 1.6, z: z }, done: false, progress: 0
    };
    level.valves.push(rec);
    return rec;
  }

  /* 触发体积 */
  function trigger(id, x0, z0, x1, z1, data) {
    var t = {
      id: id, min: { x: Math.min(x0, x1), z: Math.min(z0, z1) },
      max: { x: Math.max(x0, x1), z: Math.max(z0, z1) },
      fired: false
    };
    for (var k in data) t[k] = data[k];
    level.triggers.push(t);
    return t;
  }

  /* =====================================================================
     关卡：区域 1 —— 东翼仓库（起点）
     ===================================================================== */
  function buildWarehouse() {
    room({ name: '东翼仓库', x0: -10, x1: 10, z0: 4, z1: 22, h: 5.5, wall: 'concrete', floor: 'floor', doors: [{ side: 'n', at: 0, w: 3.4, h: 2.9 }] });
    /* 灯光 */
    lamp(-6, 5.0, 9, 0xffd9a0, 0.95, 20);
    lamp(6, 5.0, 9, 0xffd9a0, 0.95, 20);
    lamp(-6, 5.0, 18, 0xffc98a, 0.75, 18);
    lamp(6, 5.0, 18, 0xffc98a, 0.75, 18, true);
    /* 货架与木箱 */
    crate(-7.5, 0, 7.5, 1.4); crate(-7.5, 1.4, 7.5, 1.1);
    crate(-6.0, 0, 6.6, 1.2);
    crate(8.0, 0, 20.0, 1.6, 0.3); crate(6.3, 0, 20.4, 1.2);
    crate(8.0, 1.6, 20.0, 1.1, 0.6);
    crate(-8.6, 0, 15.0, 1.3);
    barrel(-9.0, 0, 12.0, true);
    barrel(-8.4, 0, 11.2, true);
    barrel(9.2, 0, 15.4, false);
    /* 墙面管道 */
    pipe(-9.6, 4.6, 13, 14, 'z', 0x7a6a52, 0.18);
    pipe(9.6, 4.6, 13, 14, 'z', 0x6a5a4a, 0.16);
    pipe(-9.6, 4.2, 13, 14, 'z', 0x8a7a5a, 0.12);
    /* 充能站 */
    station(9.4, 0, 9.0, -Math.PI / 2);
    /* 补给 */
    addPickup('pistol', -2.0, 0, 19.0);
    addPickup('medkit', 4.0, 0, 20.5);
    addPickup('ammo_pistol', 3.0, 0, 20.5);
    /* 重力枪：开局就能拿到，配合满屋子的箱子玩 */
    addPickup('gravgun', 3.6, 0, 16.2);
    addPickup('ammo_ar2', -4.4, 0, 16.2);
    hazardStrip(0, 0, 6.2, 6, 1.2);
  }

  /* =====================================================================
     区域 2 —— 中央中庭（天桥 / 楼梯 / 伏击）
     ===================================================================== */
  function buildAtrium() {
    room({
      name: '中央中庭', x0: -14, x1: 14, z0: -30, z1: -4, h: 9.0, wall: 'concrete', floor: 'floor',
      doors: [
        { side: 's', at: 0, w: 3.4, h: 2.9 },
        { side: 'n', at: 0, w: 3.4, h: 2.9 },
        { side: 'w', at: -22, w: 3.4, h: 2.9 }
      ]
    });
    /* 灯光 */
    lamp(-8, 8.4, -8, 0xffdcb0, 1.0, 26); lamp(8, 8.4, -8, 0xffdcb0, 1.0, 26);
    lamp(-8, 8.4, -18, 0xffdcb0, 1.0, 26); lamp(8, 8.4, -18, 0xffdcb0, 1.0, 26);
    lamp(-8, 8.4, -27, 0xcfd8e6, 0.85, 24); lamp(8, 8.4, -27, 0xcfd8e6, 0.85, 24, true);
    lamp(0, 4.6, -16.5, 0xaad4ff, 0.55, 14);

    /* 东 / 西 天桥 */
    solid('grate', 3, 0.7, 22, 12.5, 3.85, -17, 'catwalk');
    solid('grate', 3, 0.7, 22, -12.5, 3.85, -17, 'catwalk');
    /* 中央连桥 */
    solid('grate', 22, 0.7, 2.6, 0, 3.85, -16.7, 'catwalk');
    /* 楼梯（12 级 x 0.35） */
    for (var i = 0; i < 12; i++) {
      var hh = 0.35 * (i + 1);
      solid('grate', 0.55, hh, 3.0, 4.4 + (i + 0.5) * 0.55, hh / 2, -18.5, 'stair');
    }
    /* 护栏 */
    railing(11, -28, 11, -20, 4.2);
    railing(11, -15.4, 11, -6, 4.2);
    railing(-11, -28, -11, -18, 4.2);
    railing(-11, -15.4, -11, -6, 4.2);
    railing(-11, -15.4, -6, -15.4, 4.2);
    railing(6, -15.4, 11, -15.4, 4.2);
    railing(-11, -18, -6, -18, 4.2);
    railing(6, -18, 11, -18, 4.2);

    /* 地面障碍物 */
    crate(-6, 0, -12, 1.5); crate(-6, 1.5, -12, 1.2, 0.4);
    crate(4, 0, -25, 1.4);
    crate(-3.5, 0, -8.5, 1.2);
    crate(-2.6, 0, -9.6, 1.0);
    barrel(9, 0, -9, true); barrel(9.9, 0, -10.2, true); barrel(9.4, 0, -8, false);
    barrel(-9, 0, -26, true);

    /* 天桥上的补给 */
    addPickup('smg', 12.6, 4.2, -8.5);
    addPickup('ammo_smg', 12.6, 4.2, -9.6);
    addPickup('medkit', -12.6, 4.2, -26.0);
    addPickup('battery', 0, 4.2, -16.7);
    addPickup('grenade', -12.6, 4.2, -8.5);

    /* 地面补给 */
    addPickup('ammo_pistol', -8.0, 0, -6.5);
    addPickup('medkit', 6.5, 0, -27.5);
    addPickup('ammo_magnum', 12.6, 4.2, -24.0);

    hazardStrip(0, 0, -5.0, 6, 1.2);

    /* 伏击 */
    trigger('atrium_ambush', -9, -24, 9, -8, {
      spawns: [
        { t: 'headcrab', x: -6, z: -12 }, { t: 'headcrab', x: 6, z: -20 },
        { t: 'headcrab', x: -2, z: -22 }, { t: 'headcrab', x: 8, z: -10, y: 4.2 }
      ],
      subtitle: '探测到生物体……它们在墙上。', objective: '穿过中庭，前往生物实验室', alarm: true
    });
    trigger('atrium_cat', 10, -28, 13, -6, {
      spawns: [{ t: 'zombie', x: 12.6, z: -24 }],
      subtitle: '天桥上有东西在动。'
    });
  }

  /* =====================================================================
     区域 3 —— 军械库（西侧支线，霰弹枪 + 联合军）
     ===================================================================== */
  function buildArmory() {
    room({ name: '西侧通道', x0: -22, x1: -14, z0: -25, z1: -19, h: 3.2, floor: 'floor', doors: [{ side: 'e', at: -22, w: 3.4, h: 2.9 }, { side: 'w', at: -22, w: 3.4, h: 2.9 }] });
    lamp(-18, 2.8, -22, 0xffd0a0, 0.7, 14);
    room({ name: '军械库', x0: -34, x1: -22, z0: -34, z1: -14, h: 6, wall: 'metal', floor: 'floor', doors: [{ side: 'e', at: -22, w: 3.4, h: 2.9 }] });
    lamp(-28, 5.4, -20, 0xdfe8ff, 0.9, 20);
    lamp(-28, 5.4, -28, 0xdfe8ff, 0.9, 20, true);
    lamp(-32, 5.4, -24, 0xffd0a0, 0.7, 16);
    crate(-30, 0, -18, 1.6); crate(-31.5, 0, -19.5, 1.3); crate(-30, 1.6, -18, 1.1);
    barrel(-33, 0, -30, true); barrel(-32, 0, -31, true);
    addPickup('shotgun', -30, 0, -26);
    addPickup('ammo_shotgun', -28, 0, -26);
    addPickup('ammo_shotgun', -32, 0, -22);
    addPickup('medkit', -24, 0, -32);
    addPickup('grenade', -33, 0, -16);
    /* 军械库奖励：.357 马格南 */
    addPickup('magnum', -25, 0, -19);
    addPickup('ammo_magnum', -32, 0, -17);
    addPickup('ammo_ar2', -29, 0, -31);
    trigger('armory_guard', -33, -33, -23, -15, {
      spawns: [{ t: 'soldier', x: -24, z: -18 }, { t: 'soldier', x: -24, z: -30 }],
      subtitle: '联合军！掩护！', alarm: true
    });
  }

  /* =====================================================================
     区域 4 —— 生物实验室（污泥池 / 僵尸）
     ===================================================================== */
  function buildLab() {
    /* 无整块地板：中间留污泥池 */
    room({
      name: '生物实验室', x0: -16, x1: 16, z0: -60, z1: -38, h: 6.5,
      wall: 'tile', floor: 'tile', noFloor: true,
      doors: [{ side: 's', at: 0, w: 3.4, h: 2.9 }, { side: 'e', at: -52, w: 3.4, h: 2.9 }]
    });
    /* 地板分块（中间 x -7..7, z -54..-46 为污泥池） */
    var tf = 'tile';
    solid(tf, 32, 1, 8, 0, -0.5, -42, 'floor');
    solid(tf, 32, 1, 6, 0, -0.5, -57, 'floor');
    solid(tf, 9, 1, 8, -11.5, -0.5, -50, 'floor');
    solid(tf, 9, 1, 8, 11.5, -0.5, -50, 'floor');
    /* 池壁与池底 */
    solid('concrete', 14, 1, 0.6, 0, -0.9, -46.3, 'pit');
    solid('concrete', 14, 1, 0.6, 0, -0.9, -53.7, 'pit');
    solid('concrete', 0.6, 1, 8, -7.3, -0.9, -50, 'pit');
    solid('concrete', 0.6, 1, 8, 7.3, -0.9, -50, 'pit');
    solid('concrete', 14, 1, 8, 0, -1.9, -50, 'pit');
    /* 污泥表面 */
    var sl = new T.Mesh(boxGeo, G.mat('sludge', 4, 2));
    sl.scale.set(13.4, 0.08, 7.4); sl.position.set(0, -1.02, -50);
    scenes.add(sl);
    var slLight = new T.PointLight(0x88cc33, 1.0, 16, 2);
    slLight.position.set(0, 0.4, -50);
    scenes.add(slLight);
    level.sludge.push({ min: { x: -7, z: -54 }, max: { x: 7, z: -46 }, y: -0.3 });

    /* 灯光 */
    lamp(-10, 5.9, -42, 0xdfe8ff, 0.95, 22);
    lamp(10, 5.9, -42, 0xdfe8ff, 0.95, 22);
    lamp(-10, 5.9, -56, 0xdfe8ff, 0.85, 22);
    lamp(10, 5.9, -56, 0xdfe8ff, 0.85, 22, true);
    lamp(0, 5.9, -39, 0xffd0a0, 0.6, 14);

    /* 培养槽 */
    function tank(x, z) {
      var base = new T.Mesh(cylGeo, G.plain(0x3a4048, { shin: 60 }));
      base.scale.set(1.5, 0.25, 1.5); base.position.set(x, 0.12, z); scenes.add(base);
      var glass = new T.Mesh(cylGeo, G.mat('glass', 2, 2));
      glass.scale.set(1.35, 2.6, 1.35); glass.position.set(x, 1.5, z); scenes.add(glass);
      var goo = new T.Mesh(cylGeo, G.plain(0x6fae2a, { emis: 0x2a4a0a, emisI: 0.7, transparent: true, opacity: 0.75 }));
      goo.scale.set(1.2, 1.6, 1.2); goo.position.set(x, 1.0, z); scenes.add(goo);
      var cap = new T.Mesh(cylGeo, G.plain(0x4a5058, { shin: 50 }));
      cap.scale.set(1.5, 0.25, 1.5); cap.position.set(x, 2.85, z); scenes.add(cap);
      G.world.add(x, 1.5, z, 1.4, 3.0, 1.4, 'tank');
    }
    tank(-13.5, -42); tank(-13.5, -45.5); tank(-13.5, -49);
    tank(13.5, -58); tank(13.5, -55);

    /* 实验台（可被重力枪抓取掀翻） */
    function bench(x, z, rot) {
      var g = new T.Group();
      g.position.set(x, 0.5, z);
      g.rotation.y = rot || 0;
      scenes.add(g);
      var top = new T.Mesh(boxGeo, G.plain(0x8a8f94, { shin: 42, spec: 0x667788 }));
      top.scale.set(3.0, 0.10, 0.9); top.position.y = 0.45; g.add(top);
      var lip = new T.Mesh(boxGeo, G.plain(0x6d747a, { shin: 50 }));
      lip.scale.set(3.02, 0.05, 0.92); lip.position.y = 0.40; g.add(lip);
      var legs = new T.Mesh(boxGeo, G.plain(0x5a5f64, { shin: 30 }));
      legs.scale.set(2.6, 0.82, 0.6); legs.position.y = -0.06; g.add(legs);
      /* 台面器材：显示器 + 两只烧杯 + 培养皿 */
      var mon = new T.Mesh(boxGeo, G.plain(0x2a3038, { shin: 60, spec: 0x667788 }));
      mon.scale.set(0.52, 0.38, 0.10); mon.position.set(-0.8, 0.70, 0.10); mon.rotation.y = 0.25; g.add(mon);
      var scr = new T.Mesh(boxGeo, new T.MeshBasicMaterial({ color: 0x4fe0a0 }));
      scr.scale.set(0.44, 0.30, 0.02); scr.position.set(-0.8, 0.70, 0.16); scr.rotation.y = 0.25; g.add(scr);
      var glassMat = G.plain(0x9fd8dd, { shin: 120, spec: 0xaadddd, transparent: true, opacity: 0.55 });
      var beaker = new T.Mesh(cylGeo8, glassMat);
      beaker.scale.set(0.16, 0.24, 0.16); beaker.position.set(0.35, 0.62, 0.12); g.add(beaker);
      var fluid = new T.Mesh(cylGeo8, G.plain(0x7fd23a, { emis: 0x2a5a10, emisI: 0.6, transparent: true, opacity: 0.85 }));
      fluid.scale.set(0.13, 0.12, 0.13); fluid.position.set(0.35, 0.56, 0.12); g.add(fluid);
      var flask = new T.Mesh(cylGeo8, glassMat);
      flask.scale.set(0.11, 0.30, 0.11); flask.position.set(0.85, 0.65, -0.10); g.add(flask);
      var tray = new T.Mesh(boxGeo, G.plain(0xb9bec4, { shin: 90, spec: 0x99aabb }));
      tray.scale.set(0.40, 0.03, 0.30); tray.position.set(1.35, 0.52, 0.05); g.add(tray);
      var sol = G.world.add(x, 0.5, z, 3.0, 1.0, 0.9, 'bench');
      level.props.push({
        kind: 'bench', mesh: g, solid: sol, hw: 1.4, hh: 0.5,
        vel: { x: 0, y: 0, z: 0 }, explosive: false, held: false, thrown: false, spinSign: 1
      });
    }
    bench(-4, -41); bench(4, -41); bench(-4, -57); bench(4, -57);
    /* 离心机 / 杂物 */
    crate(-10, 0, -58, 1.3); crate(10, 0, -40, 1.4);
    barrel(-14, 0, -52, true); barrel(14, 0, -46, true);
    addPickup('ammo_smg', -4, 1.0, -41);
    addPickup('medkit', 4, 1.0, -57);
    addPickup('battery', -12, 0, -56);
    addPickup('ammo_shotgun', 12, 0, -40);
    /* 实验室：十字弩 */
    addPickup('crossbow', -11, 0, -40.5);
    addPickup('ammo_crossbow', -14, 0, -58);
    addPickup('ammo_ar2', 14, 0, -58);
    hazardStrip(0, 0, -45.4, 14, 0.6);
    hazardStrip(0, 0, -54.6, 14, 0.6);

    trigger('lab_entry', -12, -44, 12, -39, {
      spawns: [
        { t: 'zombie', x: -10, z: -50 }, { t: 'zombie', x: 10, z: -48 },
        { t: 'headcrab', x: 0, z: -42 }, { t: 'headcrab', x: -6, z: -56 }
      ],
      subtitle: '实验室里全是尸体……有些还在动。', objective: '清理生物实验室，从东侧出口离开', alarm: true
    });
    trigger('lab_north', -14, -60, 14, -52, {
      spawns: [{ t: 'zombie', x: -8, z: -58 }, { t: 'zombie', x: 8, z: -59 }],
      subtitle: '小心背后。'
    });
  }

  /* =====================================================================
     区域 5 —— 维护隧道（黑暗，需要手电）
     ===================================================================== */
  function buildTunnel() {
    room({ name: '连接通道', x0: 16, x1: 22, z0: -53.7, z1: -50.3, h: 3.2, wall: 'metal', floor: 'floor', doors: [{ side: 'w', at: -52, w: 3.4, h: 2.9 }, { side: 'e', at: -52, w: 3.4, h: 2.9 }] });
    lamp(19, 2.8, -52, 0xbfd0e0, 0.5, 12, true);

    room({ name: '维护隧道', x0: 22, x1: 30, z0: -80, z1: -44, h: 3.0, wall: 'metal', floor: 'grate', doors: [{ side: 'w', at: -52, w: 3.4, h: 2.9 }, { side: 'n', at: 26, w: 3.4, h: 2.6 }] });
    lamp(26, 2.6, -48, 0x9fb0c0, 0.35, 12, true);
    lamp(26, 2.6, -58, 0x9fb0c0, 0.30, 11, true);
    lamp(26, 2.6, -68, 0x9fb0c0, 0.30, 11, true);
    lamp(26, 2.6, -77, 0xa8b8c8, 0.45, 12, true);
    /* 管道与积水 */
    for (var z = -74; z <= -48; z += 6) {
      pipe(23.0, 2.6, z, 5.6, 'z', 0x5a4a3a, 0.16);
      pipe(29.0, 2.6, z, 5.6, 'z', 0x6a5a48, 0.14);
      pipe(22.6, 1.4, z, 5.6, 'z', 0x7a6a52, 0.10);
    }
    pipe(26, 2.7, -77, 0.3, 'z', 0x4a4038, 0.22);
    addPickup('ammo_smg', 24, 0, -63);
    addPickup('medkit', 28, 0, -72);
    addPickup('grenade', 23.4, 0, -57);
    /* 隧道尽头：AR2 脉冲步枪 */
    addPickup('ar2', 26, 0, -78.5);
    addPickup('ammo_ar2', 24.5, 0, -74);
    addPickup('ammo_magnum', 28, 0, -66);
    barrel(28.4, 0, -50, true); barrel(23.6, 0, -76, true);

    trigger('tunnel_entry', 23, -56, 29, -48, {
      subtitle: '这里很黑 —— 按 [F] 打开手电。', objective: '穿过维护隧道，抵达反应堆'
    });
    trigger('tunnel_mid', 23, -66, 29, -60, {
      spawns: [
        { t: 'headcrab', x: 24, z: -64 }, { t: 'headcrab', x: 28, z: -66 },
        { t: 'headcrab', x: 26, z: -70 }, { t: 'headcrab', x: 23, z: -61 }
      ],
      subtitle: '上面！',
      scare: true
    });
    trigger('tunnel_far', 23, -78, 29, -70, {
      spawns: [{ t: 'zombie', x: 26, z: -76 }, { t: 'headcrab', x: 24, z: -74 }],
      subtitle: '前方有动静。'
    });
  }

  /* =====================================================================
     区域 6 —— 反应堆核心（最终决战 / 传送门）
     ===================================================================== */
  function buildReactor() {
    room({
      name: '反应堆核心', x0: 6, x1: 46, z0: -128, z1: -86, h: 16, wall: 'metal', floor: 'floor',
      doors: [{ side: 's', at: 26, w: 3.4, h: 2.9 }]
    });
    /* 中央反应堆柱 */
    var core = new T.Mesh(new T.CylinderGeometry(4.4, 4.8, 14, 20), G.mat('metal', 6, 5));
    core.position.set(26, 7, -107);
    scenes.add(core);
    G.world.add(26, 7, -107, 8.4, 14, 8.4, 'reactor');
    var ring1 = new T.Mesh(new T.TorusGeometry(5.6, 0.35, 8, 26), G.plain(0xff7722, { emis: 0xff5500, emisI: 0.9 }));
    ring1.rotation.x = Math.PI / 2; ring1.position.set(26, 12.2, -107);
    scenes.add(ring1);
    var ring2 = new T.Mesh(new T.TorusGeometry(5.2, 0.28, 8, 26), G.plain(0x66ccff, { emis: 0x2288ff, emisI: 0.9 }));
    ring2.rotation.x = Math.PI / 2; ring2.position.set(26, 2.4, -107);
    scenes.add(ring2);
    var coreLight = new T.PointLight(0xff8844, 1.6, 34, 2);
    coreLight.position.set(26, 9, -107);
    scenes.add(coreLight);
    level.flicker.push({ light: coreLight, pos: { x: 26, y: 9, z: -107 }, base: 1.6, core: true });
    level.core = { ring1: ring1, ring2: ring2, light: coreLight, pos: { x: 26, y: 9, z: -107 } };

    /* 灯光 */
    lamp(11, 15, -92, 0xdfe8ff, 1.0, 26);
    lamp(41, 15, -92, 0xdfe8ff, 1.0, 26);
    lamp(11, 15, -122, 0xdfe8ff, 1.0, 26);
    lamp(41, 15, -122, 0xdfe8ff, 1.0, 26, true);
    lamp(26, 15, -94, 0xffc890, 0.9, 22);
    lamp(26, 15, -120, 0xffc890, 0.9, 22);

    /* 两侧平台 + 楼梯 */
    solid('grate', 7, 0.7, 12, 10.5, 4.65, -107, 'platform');
    solid('grate', 7, 0.7, 12, 41.5, 4.65, -107, 'platform');
    railing(10.5, -113, 10.5, -101, 5.0);
    railing(41.5, -113, 41.5, -101, 5.0);
    for (var i = 0; i < 14; i++) {
      var hh = 0.36 * (i + 1);
      solid('grate', 0.55, hh, 3.0, 7.0 + (i - 6.5) * 0.55, hh / 2, -99, 'stair');
      solid('grate', 0.55, hh, 3.0, 45.0 - (i - 6.5) * 0.55, hh / 2, -115, 'stair');
    }
    addPickup('ammo_smg', 10.5, 5.0, -110);
    addPickup('medkit', 41.5, 5.0, -110);
    addPickup('battery', 41.5, 5.0, -104);
    addPickup('grenade', 10.5, 5.0, -104);
    addPickup('ammo_shotgun', 12, 0, -90);
    addPickup('ammo_pistol', 40, 0, -90);
    addPickup('ammo_ar2', 34, 0, -122);
    addPickup('ammo_crossbow', 18, 0, -122);
    addPickup('ammo_magnum', 40, 0, -96);

    /* 三个冷却阀门 */
    valve(16, 0, -96, 0.6, 1, '冷却回路 A');
    valve(36, 0, -96, -0.6, 2, '冷却回路 B');
    valve(26, 0, -118, Math.PI, 3, '主泵阀');
    hazardStrip(26, 4.66, -110, 7, 0.5);

    /* 杂物 */
    crate(14, 0, -124, 1.5); crate(38, 0, -124, 1.4);
    barrel(20, 0, -90, true); barrel(32, 0, -90, true);
    barrel(12, 0, -120, true); barrel(40, 0, -122, true);

    /* 进入反应堆 */
    trigger('reactor_entry', 20, -92, 32, -87, {
      subtitle: '反应堆不稳定 —— 关闭三个冷却阀门！',
      objective: '关闭 3 个冷却阀门',
      alarm: true,
      spawns: [{ t: 'soldier', x: 12, z: -120 }, { t: 'headcrab', x: 40, z: -100 }, { t: 'headcrab', x: 30, z: -122 }]
    });

    /* 传送门（击败首领后激活） */
    var pg = new T.Group();
    var pmesh = new T.Mesh(new T.CircleGeometry(2.6, 32), new T.MeshBasicMaterial({
      map: G.tex('portal'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    }));
    pg.add(pmesh);
    var pren = new T.Mesh(new T.TorusGeometry(2.7, 0.16, 8, 28), G.plain(0x66ccff, { emis: 0x33aaff, emisI: 1.4 }));
    pg.add(pren);
    pg.position.set(26, 3.2, -126.4);
    pg.visible = false;
    scenes.add(pg);
    var plight = new T.PointLight(0x55bbff, 0, 26, 2);
    plight.position.set(26, 3.2, -124);
    scenes.add(plight);
    level.portal = { group: pg, mesh: pmesh, ring: pren, light: plight, active: false, pos: { x: 26, y: 3.2, z: -126.4 }, t: 0 };
    level.bossSpawn = { x: 26, y: 0, z: -108 };
  }

  /* =====================================================================
     组 装
     ===================================================================== */
  G.buildLevel = function (scene) {
    scenes = scene;
    level.pickups.length = 0; level.valves.length = 0; level.triggers.length = 0;
    level.barrels.length = 0; level.stations.length = 0; level.lamps.length = 0;
    level.rooms.length = 0; level.flicker.length = 0; level.sludge.length = 0;
    level.props.length = 0;
    level.pool.length = 0;
    G.world.clear();
    initLightPool();

    buildWarehouse();
    /* 连接通道 1 */
    room({ name: '通道 A', x0: -2, x1: 2, z0: -4, z1: 4, h: 3.2, wall: 'concrete', floor: 'floor', doors: [{ side: 's', at: 0, w: 3.4, h: 2.9 }, { side: 'n', at: 0, w: 3.4, h: 2.9 }] });
    lamp(0, 2.8, 0, 0xffd0a0, 0.7, 12);
    lamp(0, 2.8, -2.6, 0xffd0a0, 0.5, 10, true);
    pipe(-1.8, 2.7, 0, 7.5, 'z', 0x6a5a48, 0.14);
    pipe(1.8, 2.7, 0, 7.5, 'z', 0x7a6a52, 0.12);
    addPickup('ammo_pistol', 0, 0, -3);
    trigger('corridor_a', -2, -4, 2, 4, { subtitle: '黑山基地 · 东翼 —— 事故 17 分钟后。' });

    buildAtrium();
    buildArmory();
    /* 连接通道 3 */
    room({ name: '通道 B', x0: -2, x1: 2, z0: -38, z1: -30, h: 3.2, wall: 'concrete', floor: 'floor', doors: [{ side: 's', at: 0, w: 3.4, h: 2.9 }, { side: 'n', at: 0, w: 3.4, h: 2.9 }] });
    lamp(0, 2.8, -32, 0xcfd8e6, 0.7, 12);
    lamp(0, 2.8, -36, 0xcfd8e6, 0.5, 10, true);
    pipe(-1.8, 2.7, -34, 7.5, 'z', 0x6a5a48, 0.14);
    addPickup('battery', 1.4, 0, -34);
    trigger('corridor_b', -2, -38, 2, -30, { subtitle: '生物实验室就在前面。', objective: '进入生物实验室' });

    buildLab();
    buildTunnel();
    /* 连接通道 5 */
    room({ name: '通道 C', x0: 24, x1: 28, z0: -86, z1: -80, h: 3.2, wall: 'metal', floor: 'floor', doors: [{ side: 's', at: 26, w: 3.4, h: 2.9 }, { side: 'n', at: 26, w: 3.4, h: 2.9 }] });
    lamp(26, 2.8, -83, 0xcfd8e6, 0.6, 12);
    trigger('corridor_c', 24, -86, 28, -80, { subtitle: '反应堆舱段。准备好。' });
    buildReactor();

    /* 环境细节：地面水渍 & 天花板管道 */
    pipe(0, 5.2, 12, 17, 'z', 0x6a5a48, 0.2);
    pipe(26, 15.6, -107, 40, 'z', 0x5a4a3c, 0.24);
    pipe(16, 15.2, -107, 40, 'z', 0x4a3f34, 0.18);
    pipe(36, 15.2, -107, 40, 'z', 0x4a3f34, 0.18);

    /* 记录房间中心，供灯光裁剪 */
    level.rooms.forEach(function (r) {
      r.cx = (r.x0 + r.x1) / 2;
      r.cz = (r.z0 + r.z1) / 2;
      r.rad = Math.max(r.x1 - r.x0, r.z1 - r.z0) * 0.75 + 6;
    });
    console.log('[HL3] world.js 已加载：墙体 ' + G.world.solids.length + ' 块，灯 ' + level.lamps.length + ' 盏');
    return level;
  };

  /* 灯光池分配：把最近的 8 盏虚拟灯映射到 8 个真实光源上。
     光源数量恒定，因此不会触发着色器重编译（这是流畅度的关键）。 */
  var lightTick = 0, lampSort = [];
  level.updateLights = function (p, dt) {
    lightTick -= dt;
    if (lightTick > 0) return;
    lightTick = 0.22;
    var lamps = level.lamps, pool = level.pool, i;
    var py = p.y + 1.5;
    for (i = 0; i < lamps.length; i++) {
      var lp = lamps[i].pos;
      var dx = lp.x - p.x, dy = lp.y - py, dz = lp.z - p.z;
      lamps[i]._d = dx * dx + dy * dy + dz * dz;
    }
    lampSort.length = 0;
    for (i = 0; i < lamps.length; i++) lampSort.push(lamps[i]);
    lampSort.sort(function (a, b) { return a._d - b._d; });

    for (i = 0; i < pool.length; i++) {
      var rec = lampSort[i], slot = pool[i], L = slot.light;
      if (rec && rec._d < 52 * 52) {
        if (slot.lamp && slot.lamp !== rec) slot.lamp.pool = null;
        slot.lamp = rec; rec.pool = slot;
        L.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
        L.color.setHex(rec.color);
        L.distance = rec.dist;
        L.intensity = rec.cur;
      } else {
        if (slot.lamp) slot.lamp.pool = null;
        slot.lamp = null;
        L.intensity = 0;
        L.position.set(0, -1000, 0);
      }
    }
  };

  /* 闪烁灯（隧道 / 破损灯管）+ 反应堆核心脉动 */
  level.updateFlicker = function (dt, time) {
    for (var i = 0; i < level.flicker.length; i++) {
      var f = level.flicker[i];
      if (f.core) {
        f.light.intensity = f.base * (0.82 + Math.sin(time * 5.5) * 0.14 + Math.sin(time * 13.1) * 0.06);
        continue;
      }
      var n = Math.sin(time * 17 + i * 3.1) * Math.sin(time * 3.7 + i);
      f.cur = f.base * (n > -0.25 ? G.rand(0.05, 0.42) : 1);
      if (f.pool) f.pool.light.intensity = f.cur;   /* 立刻生效，不必等下一次分配 */
      if (f.glow) f.glow.opacity = f.glowBase * (f.cur / f.base) * 1.1;   /* 辉光跟着闪 */
    }
    /* 核心环脉动 */
    if (level.core) {
      var k = 0.85 + Math.sin(time * 2.2) * 0.15;
      level.core.ring1.material.emissiveIntensity = 0.9 * k;
      level.core.ring2.material.emissiveIntensity = 0.9 * k;
    }
  };

  /* 拾取物自转（被抓 / 飞行中的交给重力枪物理处理） */
  level.updatePickups = function (dt) {
    for (var i = 0; i < level.pickups.length; i++) {
      var p = level.pickups[i];
      if (p.taken || p.held || p.flying) continue;
      p.phase += dt * 1.8;
      p.mesh.rotation.y += dt * 1.2;
      p.mesh.position.y = p.baseY + Math.sin(p.phase) * 0.09;
    }
  };

  /* 传送门动画 */
  level.updatePortal = function (dt) {
    var P = level.portal;
    if (!P) return;
    P.t += dt;
    if (!P.active) return;
    P.group.visible = true;
    P.mesh.rotation.z += dt * 1.1;
    P.ring.rotation.z -= dt * 0.6;
    var s = 1 + Math.sin(P.t * 2.6) * 0.05;
    P.group.scale.set(s, s, s);
    P.light.intensity = 1.4 + Math.sin(P.t * 4) * 0.4;
  };
})();


