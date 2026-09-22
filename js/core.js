/* =========================================================================
   半条命 3：重返黑山  ——  core.js
   引擎底层：数学工具 / 程序化贴图 / 材质工厂 / 音频合成 / 视觉特效 /
             碰撞世界 / 射线检测
   ========================================================================= */
(function () {
  'use strict';
  var T = THREE;
  var G = (window.G = window.G || {});

  /* =====================================================================
     1. 数学工具
     ===================================================================== */
  G.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  G.rand = function (a, b) { return a + Math.random() * (b - a); };
  G.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  G.pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.smooth = function (a, b, rate, dt) { return a + (b - a) * (1 - Math.exp(-rate * dt)); };
  G.distXZ = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
  G.dist3 = function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  G.wrapAngle = function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };

  /* =====================================================================
     2. 程序化贴图（全部用 Canvas 生成，零外部资源）
     ===================================================================== */
  function cnv(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    return c;
  }
  function grain(g, s, n, a) {
    for (var i = 0; i < n; i++) {
      var v = (Math.random() * 255) | 0;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')';
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
  function stains(g, s, n, r, col) {
    for (var i = 0; i < n; i++) {
      g.fillStyle = col.replace('ALPHA', (0.03 + Math.random() * 0.08).toFixed(3));
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, r * (0.3 + Math.random()), 0, Math.PI * 2);
      g.fill();
    }
  }
  function mkTex(size, draw) {
    var t = new T.CanvasTexture(cnv(size, draw));
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 8;
    /* 颜色贴图标记为 sRGB，配合 renderer.outputEncoding 才是正确的色彩管线 */
    t.encoding = T.sRGBEncoding;
    return t;
  }

  var GEN = {
    /* 混凝土墙 */
    concrete: function () {
      return mkTex(256, function (g, s) {
        g.fillStyle = '#6a6d70'; g.fillRect(0, 0, s, s);
        grain(g, s, 3200, 0.14);
        stains(g, s, 26, 22, 'rgba(18,20,16,ALPHA)');
        g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = 3;
        for (var i = 0; i <= 2; i++) {
          var p = i * s / 2;
          g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
          g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
        }
        g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
        for (var j = 0; j <= 2; j++) {
          var q = j * s / 2 + 2;
          g.beginPath(); g.moveTo(q, 0); g.lineTo(q, s); g.stroke();
        }
      });
    },
    /* 实验室白瓷砖 */
    tile: function () {
      return mkTex(256, function (g, s) {
        g.fillStyle = '#9aa0a2'; g.fillRect(0, 0, s, s);
        var n = 4, cell = s / n;
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
          var v = 148 + ((Math.random() * 26) | 0);
          g.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 1) + ')';
          g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        }
        grain(g, s, 1800, 0.09);
        stains(g, s, 20, 16, 'rgba(70,80,55,ALPHA)');
      });
    },
    /* 金属地板 */
    floor: function () {
      return mkTex(256, function (g, s) {
        g.fillStyle = '#4d5155'; g.fillRect(0, 0, s, s);
        grain(g, s, 2600, 0.12);
        g.strokeStyle = 'rgba(10,10,12,0.75)'; g.lineWidth = 4;
        g.strokeRect(2, 2, s - 4, s - 4);
        g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
        g.strokeRect(7, 7, s - 14, s - 14);
        for (var i = 0; i < 26; i++) {
          g.fillStyle = 'rgba(120,90,50,' + (0.05 + Math.random() * 0.18) + ')';
          g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 10, 0, 7); g.fill();
        }
      });
    },
    /* 金属墙板 */
    metal: function () {
      return mkTex(256, function (g, s) {
        g.fillStyle = '#5b6167'; g.fillRect(0, 0, s, s);
        grain(g, s, 2200, 0.10);
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
        for (var i = 0; i < 4; i++) {
          var x = 8 + i * (s - 16) / 3;
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke();
        }
        /* 铆钉 */
        g.fillStyle = 'rgba(0,0,0,0.45)';
        for (var r = 0; r < 6; r++) for (var c = 0; c < 6; c++) {
          var px = 16 + c * (s - 32) / 5, py = 16 + r * (s - 32) / 5;
          g.beginPath(); g.arc(px, py, 2.6, 0, 7); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.beginPath(); g.arc(px - 1, py - 1, 1.5, 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.45)';
        }
        stains(g, s, 16, 20, 'rgba(90,55,25,ALPHA)');
      });
    },
    /* 锈蚀金属 */
    rust: function () {
      return mkTex(256, function (g, s) {
        g.fillStyle = '#6b4a30'; g.fillRect(0, 0, s, s);
        for (var i = 0; i < 260; i++) {
          var c = G.pick(['#7d5533', '#5a3a22', '#8a6039', '#4a3020', '#96683c']);
          g.fillStyle = c;
          g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 22, 0, 7); g.fill();
        }
        grain(g, s, 3000, 0.18);
        g.strokeStyle = 'rgba(30,18,10,0.5)'; g.lineWidth = 3;
        g.strokeRect(3, 3, s - 6, s - 6);
      });
    },
    /* 木箱 */
    crate: function () {
      return mkTex(256, function (g, s) {
        g.fillStyle = '#7a6142'; g.fillRect(0, 0, s, s);
        for (var i = 0; i < 40; i++) {
          g.fillStyle = 'rgba(0,0,0,' + (0.03 + Math.random() * 0.07) + ')';
          g.fillRect(0, Math.random() * s, s, 1 + Math.random() * 3);
        }
        grain(g, s, 1500, 0.10);
        g.strokeStyle = '#3d2f20'; g.lineWidth = 10;
        g.strokeRect(5, 5, s - 10, s - 10);
        g.lineWidth = 7;
        g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
        g.beginPath(); g.moveTo(s - 8, 8); g.lineTo(8, s - 8); g.stroke();
        g.fillStyle = '#2a2118';
        g.fillRect(0, s / 2 - 4, s, 8);
      });
    },
    /* 危险警示条纹 */
    hazard: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = '#e8b419'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#1a1a1a';
        g.save(); g.translate(s / 2, s / 2); g.rotate(-Math.PI / 4); g.translate(-s, -s);
        for (var i = 0; i < 10; i++) g.fillRect(0, i * s / 5, s * 2, s / 10);
        g.restore();
        grain(g, s, 900, 0.16);
      });
    },
    /* 通风栅格 / 网格地板 */
    grate: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = '#22262a'; g.fillRect(0, 0, s, s);
        g.strokeStyle = '#787f86'; g.lineWidth = 3;
        for (var i = 0; i <= 8; i++) {
          var p = i * s / 8;
          g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
          g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
        }
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
        for (var j = 0; j <= 8; j++) {
          var q = j * s / 8 - 1;
          g.beginPath(); g.moveTo(q, 0); g.lineTo(q, s); g.stroke();
        }
      });
    },
    /* 天花板 */
    ceiling: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = '#383c40'; g.fillRect(0, 0, s, s);
        grain(g, s, 1400, 0.12);
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3;
        g.strokeRect(2, 2, s - 4, s - 4);
      });
    },
    /* 毒性污泥 */
    sludge: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = '#3f5a17'; g.fillRect(0, 0, s, s);
        for (var i = 0; i < 120; i++) {
          g.fillStyle = 'rgba(' + (110 + Math.random() * 90 | 0) + ',' + (180 + Math.random() * 60 | 0) + ',40,0.5)';
          g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 16, 0, 7); g.fill();
        }
        grain(g, s, 1200, 0.2);
      });
    },
    /* 玻璃 */
    glass: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = 'rgba(150,200,205,0.30)'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(230,255,255,0.5)'; g.lineWidth = 4;
        g.strokeRect(4, 4, s - 8, s - 8);
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, s); g.lineTo(s, 0); g.stroke();
      });
    },
    /* 灯板（自发光） */
    panel: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = '#fff4d6'; g.fillRect(0, 0, s, s);
        g.fillStyle = 'rgba(120,120,110,0.5)';
        for (var i = 0; i < 8; i++) g.fillRect(0, i * s / 8, s, 2);
        g.strokeStyle = 'rgba(60,60,55,0.9)'; g.lineWidth = 8;
        g.strokeRect(4, 4, s - 8, s - 8);
      });
    },
    /* 能量传送门 */
    portal: function () {
      return mkTex(256, function (g, s) {
        var grd = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.25, '#8ce9ff');
        grd.addColorStop(0.6, '#2a86ff');
        grd.addColorStop(1, 'rgba(10,20,60,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(200,250,255,0.6)';
        for (var i = 0; i < 14; i++) {
          g.beginPath();
          g.arc(s / 2, s / 2, 10 + i * 8, Math.random() * 6, Math.random() * 6 + 1);
          g.stroke();
        }
      });
    },
    /* 弹孔贴花 */
    decal: function () {
      return mkTex(64, function (g, s) {
        var grd = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
        grd.addColorStop(0, 'rgba(0,0,0,0.95)');
        grd.addColorStop(0.35, 'rgba(20,18,16,0.75)');
        grd.addColorStop(0.7, 'rgba(40,36,30,0.35)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
        for (var i = 0; i < 8; i++) {
          var a = Math.random() * 6.28;
          g.beginPath(); g.moveTo(s / 2, s / 2);
          g.lineTo(s / 2 + Math.cos(a) * s * 0.5, s / 2 + Math.sin(a) * s * 0.5); g.stroke();
        }
      });
    },
    /* 血泊贴图（不规则外缘 + 飞溅点 + 拖尾） */
    blood: function () {
      return mkTex(128, function (g, s) {
        g.clearRect(0, 0, s, s);
        var i, a, r, cx, cy, rad;
        for (i = 0; i < 34; i++) {
          a = Math.random() * 6.283;
          r = Math.pow(Math.random(), 0.7) * s * 0.36;
          cx = s / 2 + Math.cos(a) * r;
          cy = s / 2 + Math.sin(a) * r;
          rad = (0.10 + Math.random() * 0.20) * s * (1 - r / (s * 0.62));
          g.fillStyle = 'rgba(' + ((62 + Math.random() * 40) | 0) + ',' +
            ((4 + Math.random() * 9) | 0) + ',' + ((6 + Math.random() * 9) | 0) + ',0.94)';
          g.beginPath(); g.arc(cx, cy, Math.max(2, rad), 0, 6.284); g.fill();
        }
        g.fillStyle = 'rgba(96,7,9,0.96)';
        g.beginPath(); g.arc(s / 2, s / 2, s * 0.23, 0, 6.284); g.fill();
        /* 飞溅小点 */
        for (i = 0; i < 26; i++) {
          a = Math.random() * 6.283;
          r = s * (0.34 + Math.random() * 0.16);
          g.fillStyle = 'rgba(' + ((70 + Math.random() * 40) | 0) + ',6,8,0.75)';
          g.beginPath();
          g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 1 + Math.random() * 3.4, 0, 6.284);
          g.fill();
        }
      });
    },
    /* 联合军装甲 */
    combine: function () {
      return mkTex(128, function (g, s) {
        g.fillStyle = '#3b4550'; g.fillRect(0, 0, s, s);
        grain(g, s, 1200, 0.10);
        g.strokeStyle = 'rgba(15,20,26,0.8)'; g.lineWidth = 4;
        for (var i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4 + 8); g.lineTo(s, i * s / 4 + 8); g.stroke(); }
        g.fillStyle = 'rgba(200,60,40,0.25)';
        g.fillRect(s / 2 - 6, 0, 12, s);
      });
    },
    /* 圆点粒子精灵 */
    dot: function () {
      var c = cnv(64, function (g, s) {
        var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
      var t = new T.CanvasTexture(c);
      return t;
    },
    /* 灯光辉光（用于灯泡光晕，加色叠加） */
    glow: function () {
      var c = cnv(128, function (g, s) {
        var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        grd.addColorStop(0.00, 'rgba(255,255,255,1)');
        grd.addColorStop(0.16, 'rgba(255,244,208,0.72)');
        grd.addColorStop(0.42, 'rgba(255,198,120,0.20)');
        grd.addColorStop(1.00, 'rgba(255,170,70,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
      var t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
      return t;
    }
  };

  var texCache = {}, normalCache = {};
  G.tex = function (kind) {
    if (!texCache[kind]) {
      var gen = (G.TEXGEN && G.TEXGEN[kind]) || GEN[kind];
      texCache[kind] = gen();
    }
    return texCache[kind];
  };
  /** 法线贴图（由同一张高度图自动生成，只对主要表面启用） */
  G.normalTex = function (kind, strength) {
    if (!normalCache[kind]) {
      var gen = (G.TEXGEN && G.TEXGEN[kind]) || GEN[kind];
      normalCache[kind] = G.buildNormalMap(G.tex(kind), strength || 1);
    }
    return normalCache[kind];
  };
  G.dotTex = function () {
    if (!texCache.__dot) texCache.__dot = (G.TEXGEN && G.TEXGEN.dot ? G.TEXGEN.dot() : GEN.dot());
    return texCache.__dot;
  };

  /* =====================================================================
     3. 材质工厂
     ===================================================================== */
  var KIND = {
    concrete: { shin: 6, spec: 0x111111, emis: 0x000000, emisI: 0, normal: 1.0 },
    tile: { shin: 24, spec: 0x333333, emis: 0x000000, emisI: 0, normal: 0.85 },
    floor: { shin: 14, spec: 0x222222, emis: 0x000000, emisI: 0, normal: 1.15 },
    metal: { shin: 34, spec: 0x555555, emis: 0x000000, emisI: 0, normal: 1.0 },
    rust: { shin: 8, spec: 0x221a12, emis: 0x000000, emisI: 0, normal: 1.25 },
    crate: { shin: 10, spec: 0x221a10, emis: 0x000000, emisI: 0, normal: 0.9 },
    hazard: { shin: 18, spec: 0x333333, emis: 0x000000, emisI: 0, normal: 0.4 },
    grate: { shin: 30, spec: 0x444444, emis: 0x000000, emisI: 0, normal: 1.3 },
    ceiling: { shin: 6, spec: 0x111111, emis: 0x000000, emisI: 0, normal: 0.6 },
    sludge: { shin: 90, spec: 0x88aa44, emis: 0x2f4d10, emisI: 0.75, normal: 1.1 },
    glass: { shin: 120, spec: 0xaadddd, emis: 0x0a2028, emisI: 0.3, transparent: true, opacity: 0.55 },
    panel: { shin: 10, spec: 0x222222, emis: 0xfff0cc, emisI: 0.95 },
    portal: { shin: 0, spec: 0x000000, emis: 0x66ccff, emisI: 1.6, transparent: true, opacity: 0.9 },
    combine: { shin: 30, spec: 0x444444, emis: 0x000000, emisI: 0, normal: 0.7 }
  };
  var matCache = {};
  /**
   * 取得（并缓存）一种材质
   * @param {string} kind  贴图种类
   * @param {number} rx    贴图横向重复
   * @param {number} ry    贴图纵向重复
   */
  G.mat = function (kind, rx, ry) {
    rx = Math.max(0.05, rx || 1); ry = Math.max(0.05, ry || 1);
    var key = kind + '|' + rx.toFixed(2) + '|' + ry.toFixed(2);
    if (matCache[key]) return matCache[key];
    var def = KIND[kind] || KIND.concrete;
    var t = G.tex(kind).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    var NT = def.normal ? G.normalTex(kind, def.normal) : null;
    var params = {
      map: t,
      shininess: def.shin,
      specular: def.spec,
      emissive: def.emis,
      emissiveIntensity: def.emisI,
      emissiveMap: def.emisI > 0 ? t : null,
      transparent: !!def.transparent,
      opacity: def.opacity === undefined ? 1 : def.opacity
    };
    if (NT) {
      params.normalMap = NT;
      params.normalScale = new T.Vector2(1, 1);
    }
    var m = new T.MeshPhongMaterial(params);
    matCache[key] = m;
    return m;
  };
  /* 纯色材质（敌人、道具、武器用） */
  G.plain = function (color, opts) {
    opts = opts || {};
    return new T.MeshPhongMaterial({
      color: color,
      shininess: opts.shin === undefined ? 22 : opts.shin,
      specular: opts.spec === undefined ? 0x333333 : opts.spec,
      emissive: opts.emis === undefined ? 0x000000 : opts.emis,
      emissiveIntensity: opts.emisI === undefined ? 0 : opts.emisI,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      flatShading: !!opts.flat
    });
  };

  /* =====================================================================
     4. 碰撞世界  (AABB)
     ===================================================================== */
  var world = (G.world = {
    solids: [],
    /** 加入一个实体 AABB（中心+尺寸） */
    add: function (cx, cy, cz, w, h, d, tag) {
      var s = {
        min: { x: cx - w / 2, y: cy - h / 2, z: cz - d / 2 },
        max: { x: cx + w / 2, y: cy + h / 2, z: cz + d / 2 },
        tag: tag || 'solid'
      };
      this.solids.push(s);
      return s;
    },
    clear: function () { this.solids.length = 0; }
  });

  /** 实体是否与某个 AABB 重叠 */
  function overlapAny(b, x, y, z) {
    var r = b.radius, h = b.height, i, s;
    var minx = x - r, maxx = x + r, miny = y, maxy = y + h, minz = z - r, maxz = z + r;
    for (i = 0; i < world.solids.length; i++) {
      s = world.solids[i];
      if (s.ignore) continue;
      if (maxx > s.min.x + 1e-4 && minx < s.max.x - 1e-4 &&
          maxy > s.min.y + 1e-4 && miny < s.max.y - 1e-4 &&
          maxz > s.min.z + 1e-4 && minz < s.max.z - 1e-4) return s;
    }
    return null;
  }
  G.overlapAny = overlapAny;

  /** 探地：返回 (x,z) 处不高于 yTop 的最高地面高度，没有则 -Infinity */
  G.groundAt = function (x, z, yTop, r) {
    var best = -Infinity, i, s;
    r = r || 0.3;
    for (i = 0; i < world.solids.length; i++) {
      s = world.solids[i];
      if (s.ignore) continue;
      if (x + r > s.min.x && x - r < s.max.x && z + r > s.min.z && z - r < s.max.z) {
        if (s.max.y <= yTop + 0.02 && s.max.y > best) best = s.max.y;
      }
    }
    return best;
  };

  /** 沿水平方向推出（取最浅的一侧）—— 用于「卡进大体块内部」时避免被顶到高台顶上 */
  function pushHorizontal(b, o) {
    var r = b.radius;
    var left = (b.pos.x + r) - o.min.x;
    var right = o.max.x - (b.pos.x - r);
    var back = (b.pos.z + r) - o.min.z;
    var fwd = o.max.z - (b.pos.z - r);
    var best = left, axis = 0, sign = -1;
    if (right < best) { best = right; axis = 0; sign = 1; }
    if (back < best) { best = back; axis = 2; sign = -1; }
    if (fwd < best) { best = fwd; axis = 2; sign = 1; }
    best += 0.002;
    if (axis === 0) { b.pos.x += sign * best; b.vel.x = 0; }
    else { b.pos.z += sign * best; b.vel.z = 0; }
  }

  /**
   * 物理推进（分轴解算 + 台阶辅助）
   * body = {pos:{x,y,z}(脚底), vel:{x,y,z}, radius, height, grounded, stepHeight}
   */
  G.moveBody = function (b, dt) {
    var i, o, wasGrounded = b.grounded;
    b.grounded = false;
    var startY = b.pos.y;

    /* ---- Y 轴 ---- */
    b.pos.y += b.vel.y * dt;
    for (i = 0; i < 4; i++) {
      o = overlapAny(b, b.pos.x, b.pos.y, b.pos.z);
      if (!o) break;
      if (b.vel.y > 0) { b.pos.y = o.min.y - b.height - 0.002; b.vel.y = 0; continue; }
      var upPush = o.max.y - b.pos.y;
      if (upPush <= b.height + 0.35) {
        /* 正常落地 / 踩上台阶 */
        b.pos.y = o.max.y + 0.002; b.vel.y = 0; b.grounded = true;
      } else {
        /* 陷得太深（例如出生点与柱子重叠）：水平推出，绝不平移到高处 */
        pushHorizontal(b, o);
      }
    }
    /* 站立时贴地 */
    if (!b.grounded && wasGrounded && b.vel.y <= 0.01) {
      var gy = G.groundAt(b.pos.x, b.pos.z, b.pos.y + 0.12, b.radius);
      if (gy > -Infinity && b.pos.y - gy < 0.16) { b.pos.y = gy; b.vel.y = 0; b.grounded = true; }
    }

    /* ---- X / Z 轴 ---- */
    var dx = b.vel.x * dt, dz = b.vel.z * dt;
    if (dx === 0 && dz === 0) return b;

    var ox = b.pos.x, oz = b.pos.z;
    var blocked = slideMove(b, dx, dz);
    if (blocked && (wasGrounded || b.grounded) && b.stepHeight > 0) {
      /* 尝试抬腿迈上台阶 */
      var raised = G.groundAt(b.pos.x + Math.sign(dx || 0) * 0.02, b.pos.z, startY + b.stepHeight + 0.05, b.radius);
      b.pos.x = ox; b.pos.z = oz;
      var saveY = b.pos.y;
      b.pos.y = startY + b.stepHeight;
      if (!overlapAny(b, b.pos.x, b.pos.y, b.pos.z)) {
        var blocked2 = slideMove(b, dx, dz);
        var g2 = G.groundAt(b.pos.x, b.pos.z, b.pos.y + 0.05, b.radius);
        if (g2 > -Infinity && g2 >= startY - 0.35 && g2 <= startY + b.stepHeight + 0.06) {
          b.pos.y = g2; b.grounded = true; b.vel.y = 0;
        } else {
          b.pos.x = ox; b.pos.z = oz; b.pos.y = saveY;
          if (blocked2) { /* 保持滑动后的位置 */ }
        }
      } else {
        b.pos.x = ox; b.pos.z = oz; b.pos.y = saveY;
      }
    }
    return b;
  };

  /** 水平滑动：先 X 后 Z，各自撞墙即贴墙，返回是否有阻挡 */
  function slideMove(b, dx, dz) {
    var blocked = false, o, i;
    if (dx !== 0) {
      b.pos.x += dx;
      for (i = 0; i < 4; i++) {
        o = overlapAny(b, b.pos.x, b.pos.y, b.pos.z);
        if (!o) break;
        b.pos.x = dx > 0 ? o.min.x - b.radius - 0.002 : o.max.x + b.radius + 0.002;
        b.vel.x = 0;
        blocked = true;
      }
    }
    if (dz !== 0) {
      b.pos.z += dz;
      for (i = 0; i < 4; i++) {
        o = overlapAny(b, b.pos.x, b.pos.y, b.pos.z);
        if (!o) break;
        b.pos.z = dz > 0 ? o.min.z - b.radius - 0.002 : o.max.z + b.radius + 0.002;
        b.vel.z = 0;
        blocked = true;
      }
    }
    return blocked;
  }

  /** 射线 vs 世界（AABB 平板法），返回 {t, nx, ny, nz} 或 null */
  G.rayWorld = function (ox, oy, oz, dx, dy, dz, maxT) {
    var bestT = maxT, nx = 0, ny = 0, nz = 0, found = false;
    var invx = 1 / (dx || 1e-12), invy = 1 / (dy || 1e-12), invz = 1 / (dz || 1e-12);
    for (var i = 0; i < world.solids.length; i++) {
      var s = world.solids[i];
      if (s.ignore) continue;
      var t1, t2, tmin, tmax, axis = 0, sign = 1;
      t1 = (s.min.x - ox) * invx; t2 = (s.max.x - ox) * invx;
      if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
      tmin = t1; tmax = t2;
      if (tmin > bestT) continue;
      var signX = invx < 0 ? 1 : -1;
      t1 = (s.min.y - oy) * invy; t2 = (s.max.y - oy) * invy;
      if (t1 > t2) { var t3 = t1; t1 = t2; t2 = t3; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = invy < 0 ? 1 : -1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax || tmin < 0) continue;
      t1 = (s.min.z - oz) * invz; t2 = (s.max.z - oz) * invz;
      if (t1 > t2) { var t4 = t1; t1 = t2; t2 = t4; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = invz < 0 ? 1 : -1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax || tmin < 0) continue;

      if (tmin < bestT - 1e-5) {
        bestT = tmin; found = true;
        nx = axis === 0 ? signX : 0;
        ny = axis === 1 ? sign : 0;
        nz = axis === 2 ? sign : 0;
        /* 修正：根据进入面设定法线 */
        if (axis === 0) { nx = invx < 0 ? 1 : -1; ny = 0; nz = 0; }
        else if (axis === 1) { nx = 0; ny = invy < 0 ? 1 : -1; nz = 0; }
        else { nx = 0; ny = 0; nz = invz < 0 ? 1 : -1; }
      }
    }
    if (!found) return null;
    return { t: bestT, nx: nx, ny: ny, nz: nz };
  };

  /** 视线检测：两点之间是否无遮挡 */
  G.lineOfSight = function (ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return true;
    var hit = G.rayWorld(ax, ay, az, dx / len, dy / len, dz / len, len - 0.35);
    return !hit;
  };

  /* =====================================================================
     5. 场景几何辅助
     ===================================================================== */
  var boxGeo = new T.BoxGeometry(1, 1, 1);
  /**
   * 创建（并可注册碰撞的）方块
   * @param kind 贴图种类
   * @param w,h,d 尺寸   @param x,y,z 中心
   */
  G.box = function (scene, kind, w, h, d, x, y, z, solid, tag) {
    var m = new T.Mesh(boxGeo, G.mat(kind, Math.max(w, d) / 3.2, h / 3.2));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = false;
    scene.add(m);
    if (solid !== false) world.add(x, y, z, w, h, d, tag);
    return m;
  };
  /** 创建纯色方块（道具） */
  G.solidBox = function (scene, color, w, h, d, x, y, z, opts) {
    var m = new T.Mesh(boxGeo, G.plain(color, opts));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };

  /* =====================================================================
     6. 音频合成引擎（WebAudio，全部实时合成）
     ===================================================================== */
  var A = (G.audio = {
    ctx: null,
    master: null,
    volume: 0.8,
    muted: false,
    ready: false,
    init: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      /* 白噪声缓冲 */
      var len = this.ctx.sampleRate * 2;
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.ready = true;
      this.startAmbient();
    },
    resume: function () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    setVolume: function (v) {
      this.volume = v;
      if (this.master) this.master.gain.value = this.muted ? 0 : v;
    },
    /* 噪声爆发：lowpass 扫频 */
    noise: function (dur, vol, f0, f1, type, q) {
      if (!this.ready) return;
      var c = this.ctx, t = c.currentTime;
      var src = c.createBufferSource(); src.buffer = this.noiseBuf;
      src.loop = true;
      var flt = c.createBiquadFilter();
      flt.type = type || 'lowpass';
      flt.frequency.setValueAtTime(f0, t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      if (q) flt.Q.value = q;
      var g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    },
    /* 音调扫频 */
    tone: function (wave, f0, f1, dur, vol, delay) {
      if (!this.ready) return;
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(); o.type = wave;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    /* 环境低鸣 */
    startAmbient: function () {
      if (!this.ready || this.ambient) return;
      var c = this.ctx, t = c.currentTime;
      var g = c.createGain(); g.gain.value = 0.0; g.connect(this.master);
      var flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 240; flt.connect(g);
      var o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 42; o1.connect(flt);
      var o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 42.7; o2.connect(flt);
      var o3 = c.createOscillator(); o3.type = 'sine'; o3.frequency.value = 63.5; o3.connect(flt);
      /* 空气噪声 */
      var ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
      var nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.6;
      var ng = c.createGain(); ng.gain.value = 0.012;
      ns.connect(nf); nf.connect(ng); ng.connect(this.master);
      o1.start(t); o2.start(t); o3.start(t); ns.start(t);
      g.gain.linearRampToValueAtTime(0.05, t + 3);
      this.ambient = g;
    },
    /* 声音库 */
    play: function (name, vol) {
      if (!this.ready || this.muted) return;
      vol = vol === undefined ? 1 : vol;
      switch (name) {
        case 'pistol':
          this.noise(0.10, 0.45 * vol, 5200, 500, 'lowpass');
          this.tone('square', 420, 70, 0.07, 0.16 * vol);
          break;
        case 'smg':
          this.noise(0.07, 0.32 * vol, 4200, 700, 'lowpass');
          this.tone('square', 320, 90, 0.05, 0.10 * vol);
          break;
        case 'shotgun':
          this.noise(0.30, 0.62 * vol, 3000, 220, 'lowpass');
          this.tone('sine', 160, 40, 0.28, 0.34 * vol);
          break;
        case 'magnum':
          this.noise(0.26, 0.70 * vol, 4200, 180, 'lowpass');
          this.tone('sine', 200, 34, 0.30, 0.42 * vol);
          this.noise(0.10, 0.30 * vol, 9000, 3200, 'highpass');
          break;
        case 'crossbow':
          this.noise(0.14, 0.34 * vol, 1600, 320, 'bandpass', 4);
          this.tone('triangle', 320, 110, 0.20, 0.20 * vol);
          this.noise(0.06, 0.16 * vol, 6000, 1800, 'highpass');
          break;
        case 'pulse2':
          this.noise(0.09, 0.30 * vol, 7000, 1200, 'lowpass');
          this.tone('sawtooth', 1100, 260, 0.09, 0.14 * vol);
          this.tone('square', 2400, 700, 0.05, 0.06 * vol);
          break;
        case 'orb':
          this.tone('sine', 180, 900, 0.45, 0.20 * vol);
          this.tone('square', 420, 1200, 0.35, 0.08 * vol, 0.03);
          this.noise(0.4, 0.16 * vol, 800, 3000, 'bandpass', 3);
          break;
        case 'gravPull':
          this.tone('sine', 220, 780, 0.32, 0.16 * vol);
          this.noise(0.35, 0.12 * vol, 400, 2400, 'bandpass', 2);
          break;
        case 'gravLaunch':
          this.tone('sine', 700, 180, 0.30, 0.22 * vol);
          this.noise(0.28, 0.22 * vol, 3000, 500, 'lowpass');
          break;
        case 'grav':
        case 'gravBlast':
          this.tone('sine', 120, 520, 0.28, 0.20 * vol);
          this.noise(0.30, 0.24 * vol, 2600, 300, 'lowpass');
          this.tone('triangle', 900, 200, 0.22, 0.10 * vol, 0.02);
          break;
        case 'inspect':
          this.noise(0.05, 0.14 * vol, 3200, 1400, 'bandpass', 6);
          this.tone('square', 800, 420, 0.05, 0.05 * vol);
          break;
        case 'thud':
          this.noise(0.22, 0.34 * vol, 700, 110, 'lowpass');
          this.tone('sine', 120, 48, 0.24, 0.20 * vol);
          break;
        case 'thudBig':
          this.noise(0.42, 0.50 * vol, 520, 70, 'lowpass');
          this.tone('sine', 90, 32, 0.42, 0.34 * vol);
          break;
        case 'reload':
          this.noise(0.06, 0.20 * vol, 2600, 900, 'bandpass', 3);
          this.tone('square', 900, 300, 0.05, 0.06 * vol);
          break;
        case 'crowbarSwing':
          this.noise(0.16, 0.16 * vol, 900, 2600, 'bandpass', 5);
          break;
        case 'crowbarHit':
          this.noise(0.20, 0.34 * vol, 1800, 260, 'lowpass');
          this.tone('triangle', 260, 90, 0.18, 0.18 * vol);
          break;
        case 'flesh':
          this.noise(0.14, 0.30 * vol, 900, 180, 'lowpass');
          break;
        case 'ricochet':
          this.noise(0.09, 0.16 * vol, 6000, 2200, 'bandpass', 8);
          break;
        case 'hitmark':
          this.tone('square', 1300, 900, 0.05, 0.10 * vol);
          break;
        case 'headcrab':
          this.tone('sawtooth', 700, 1500, 0.16, 0.16 * vol);
          this.tone('sawtooth', 1500, 420, 0.22, 0.14 * vol, 0.13);
          this.noise(0.22, 0.14 * vol, 3000, 900, 'bandpass', 4);
          break;
        case 'zombie':
          this.tone('sawtooth', 96, 70, 0.9, 0.20 * vol);
          this.tone('square', 48, 40, 0.9, 0.10 * vol, 0.02);
          this.noise(0.7, 0.06 * vol, 700, 200, 'bandpass', 2);
          break;
        case 'combine':
          this.noise(0.14, 0.18 * vol, 2400, 800, 'bandpass', 3);
          this.tone('square', 1400, 700, 0.10, 0.07 * vol, 0.02);
          break;
        case 'pulse':
          this.noise(0.09, 0.26 * vol, 6000, 900, 'lowpass');
          this.tone('sawtooth', 900, 200, 0.08, 0.12 * vol);
          break;
        case 'explode':
          this.noise(1.0, 0.75 * vol, 2200, 90, 'lowpass');
          this.tone('sine', 150, 28, 0.8, 0.42 * vol);
          this.noise(0.35, 0.3 * vol, 9000, 3000, 'highpass');
          break;
        case 'pickup':
          this.tone('sine', 640, 960, 0.09, 0.18 * vol);
          this.tone('sine', 960, 1280, 0.10, 0.14 * vol, 0.08);
          break;
        case 'weaponGet':
          this.tone('square', 300, 620, 0.12, 0.14 * vol);
          this.tone('square', 620, 940, 0.16, 0.12 * vol, 0.11);
          break;
        case 'step':
          this.noise(0.07, 0.11 * vol, 1400, 260, 'bandpass', 2);
          break;
        case 'jump':
          this.noise(0.09, 0.10 * vol, 900, 300, 'bandpass', 2);
          break;
        case 'land':
          this.noise(0.16, 0.22 * vol, 700, 140, 'lowpass');
          break;
        case 'hurt':
          this.tone('sawtooth', 240, 110, 0.22, 0.24 * vol);
          this.noise(0.16, 0.16 * vol, 1200, 300, 'lowpass');
          break;
        case 'die':
          this.tone('sawtooth', 180, 40, 1.4, 0.32 * vol);
          this.noise(1.2, 0.2 * vol, 800, 60, 'lowpass');
          break;
        case 'heal':
          this.tone('sine', 500, 1200, 0.35, 0.16 * vol);
          break;
        case 'charge':
          this.tone('sine', 220, 880, 1.1, 0.14 * vol);
          break;
        case 'deny':
          this.tone('square', 200, 120, 0.16, 0.14 * vol);
          break;
        case 'alarm':
          for (var i = 0; i < 4; i++) {
            this.tone('square', 720, 620, 0.22, 0.10 * vol, i * 0.42);
          }
          break;
        case 'reveal':
          this.tone('sine', 90, 55, 1.6, 0.30 * vol);
          this.noise(1.4, 0.24 * vol, 500, 70, 'lowpass');
          break;
        case 'portal':
          this.tone('sine', 300, 1400, 0.7, 0.16 * vol);
          this.tone('sine', 450, 1900, 0.7, 0.12 * vol, 0.05);
          break;
        case 'valve':
          this.noise(0.5, 0.20 * vol, 1800, 500, 'bandpass', 4);
          this.tone('square', 300, 180, 0.45, 0.08 * vol);
          break;
        case 'win':
          this.tone('sine', 300, 900, 0.5, 0.2 * vol);
          this.tone('sine', 450, 1200, 0.6, 0.16 * vol, 0.15);
          this.tone('sine', 600, 1500, 0.8, 0.14 * vol, 0.3);
          break;
      }
    }
  });

  /* =====================================================================
     7. 视觉特效：加色粒子 / 碎块 / 弹道 / 贴花 / 闪光灯池
     ===================================================================== */
  function ParticleSystem(scene, size, additive, max) {
    this.max = max || 700;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.base = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);
    this.cursor = 0;
    for (var i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -9999;
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new T.BufferAttribute(this.col, 3));
    var m = new T.PointsMaterial({
      size: size, sizeAttenuation: true, vertexColors: true,
      map: G.dotTex(), transparent: true, depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    this.points = new T.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }
  ParticleSystem.prototype.emit = function (x, y, z, vx, vy, vz, color, life, grav, drag) {
    var i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    var i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    var c = new T.Color(color);
    this.base[i3] = c.r; this.base[i3 + 1] = c.g; this.base[i3 + 2] = c.b;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav === undefined ? -9 : grav;
    this.drag[i] = drag === undefined ? 0.6 : drag;
  };
  ParticleSystem.prototype.burst = function (x, y, z, n, color, speed, life, grav, dirx, diry, dirz, spread) {
    for (var i = 0; i < n; i++) {
      var dx, dy, dz;
      if (dirx !== undefined) {
        dx = dirx + G.rand(-1, 1) * (spread || 0.4);
        dy = diry + G.rand(-1, 1) * (spread || 0.4);
        dz = dirz + G.rand(-1, 1) * (spread || 0.4);
      } else {
        dx = G.rand(-1, 1); dy = G.rand(-1, 1); dz = G.rand(-1, 1);
      }
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var s = speed * G.rand(0.35, 1.15);
      this.emit(x, y, z, dx / l * s, dy / l * s, dz / l * s,
        color, life * G.rand(0.6, 1.25), grav, 0.7);
    }
  };
  ParticleSystem.prototype.update = function (dt) {
    var changed = false;
    for (var i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      changed = true;
      var i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -9999;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      var d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      var k = this.life[i] / this.maxLife[i];
      var f = k > 0.75 ? 1 : k / 0.75;
      this.col[i3] = this.base[i3] * f;
      this.col[i3 + 1] = this.base[i3 + 1] * f;
      this.col[i3 + 2] = this.base[i3 + 2] * f;
    }
    if (changed) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  };

  /* 碎块系统：小方块，有重力与地面弹跳 */
  function ChunkSystem(scene, max) {
    this.max = max || 140;
    this.items = [];
    this.cursor = 0;
    var geo = new T.BoxGeometry(1, 1, 1);
    this.geo = geo;
    this.mats = {};
    for (var i = 0; i < this.max; i++) {
      var m = new T.Mesh(geo, G.plain(0x881111));
      m.visible = false;
      m.userData.life = 0;
      scene.add(m);
      this.items.push({ mesh: m, vx: 0, vy: 0, vz: 0, spin: 0, size: 0.06, life: 0, maxLife: 1, floor: -999, bounce: 0 });
    }
  }
  ChunkSystem.prototype.material = function (color) {
    if (!this.mats[color]) this.mats[color] = G.plain(color, { shin: 40 });
    return this.mats[color];
  };
  ChunkSystem.prototype.emit = function (x, y, z, vx, vy, vz, color, size, life) {
    var it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    it.mesh.visible = true;
    it.mesh.material = this.material(color);
    it.mesh.position.set(x, y, z);
    it.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.size = size;
    it.mesh.scale.set(size, size, size);
    it.vx = vx; it.vy = vy; it.vz = vz;
    it.spin = G.rand(-12, 12);
    it.life = life; it.maxLife = life;
    it.floor = -999;
    it.bounce = 0;
  };
  ChunkSystem.prototype.burst = function (x, y, z, n, color, speed, size, life) {
    for (var i = 0; i < n; i++) {
      var dx = G.rand(-1, 1), dy = G.rand(0.2, 1.6), dz = G.rand(-1, 1);
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var s = speed * G.rand(0.4, 1.2);
      this.emit(x, y, z, dx / l * s, dy / l * s, dz / l * s, color,
        size * G.rand(0.6, 1.4), life * G.rand(0.7, 1.3));
    }
  };
  ChunkSystem.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.mesh.visible = false; continue; }
      it.vy -= 16 * dt;
      var nx = it.mesh.position.x + it.vx * dt;
      var ny = it.mesh.position.y + it.vy * dt;
      var nz = it.mesh.position.z + it.vz * dt;
      /* 简单地面检测 */
      if (ny - it.size * 0.5 < 0.02 && it.vy < 0) {
        var g = G.groundAt(nx, nz, it.mesh.position.y + 0.1, 0.05);
        if (g > -Infinity && ny - it.size * 0.5 <= g) {
          ny = g + it.size * 0.5;
          it.vy = -it.vy * 0.32;
          it.vx *= 0.6; it.vz *= 0.6;
          it.bounce++;
          if (it.bounce > 2) { it.vx *= 0.3; it.vz *= 0.3; }
        }
      }
      it.mesh.position.set(nx, ny, nz);
      it.mesh.rotation.x += it.spin * dt;
      it.mesh.rotation.y += it.spin * 0.7 * dt;
      var k = it.life / it.maxLife;
      if (k < 0.35) it.mesh.scale.setScalar(it.size * (k / 0.35));
    }
  };

  /* 弹道曳光 */
  function TracerSystem(scene, max) {
    this.max = max || 24;
    this.items = [];
    this.cursor = 0;
    var geo = new T.BoxGeometry(1, 1, 1);
    for (var i = 0; i < this.max; i++) {
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0.85,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      m.visible = false;
      scene.add(m);
      this.items.push({ mesh: m, life: 0 });
    }
  }
  TracerSystem.prototype.fire = function (x, y, z, tx, ty, tz, color, thickness) {
    var it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    var dx = tx - x, dy = ty - y, dz = tz - z;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return;
    it.mesh.visible = true;
    it.mesh.material.color.setHex(color || 0xffe9a0);
    it.mesh.position.set((x + tx) / 2, (y + ty) / 2, (z + tz) / 2);
    it.mesh.lookAt(tx, ty, tz);
    it.mesh.scale.set(thickness || 0.02, thickness || 0.02, len);
    it.life = 0.055;
  };
  TracerSystem.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.mesh.visible = false; continue; }
      it.mesh.material.opacity = 0.85 * (it.life / 0.055);
    }
  };

  /* 弹孔贴花 */
  function DecalSystem(scene, max) {
    this.max = max || 40;
    this.items = [];
    this.cursor = 0;
    var geo = new T.PlaneGeometry(1, 1);
    var tex = G.tex('decal');
    for (var i = 0; i < this.max; i++) {
      var mat = new T.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 1, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
      });
      var m = new T.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.items.push({ mesh: m, life: 0 });
    }
  }
  DecalSystem.prototype.place = function (x, y, z, nx, ny, nz, size) {
    var it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    size = size || G.rand(0.22, 0.34);
    it.mesh.visible = true;
    it.mesh.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    it.mesh.lookAt(x + nx, y + ny, z + nz);
    it.mesh.rotateZ(Math.random() * 6.28);
    it.mesh.scale.set(size, size, size);
    it.mesh.material.opacity = 0.9;
    it.life = 24;
  };
  DecalSystem.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 3) it.mesh.material.opacity = Math.max(0, it.life / 3) * 0.9;
      if (it.life <= 0) it.mesh.visible = false;
    }
  };

  /* 瞬时闪光灯池
     注意：灯光数量一旦变化，three.js 会为所有材质重新编译着色器，
     在真机上表现为「一开枪就卡死几秒」。因此这里的灯永远 visible，
     只用 intensity 控制亮灭。 */
  function FlashPool(scene, n) {
    this.lights = [];
    this.cursor = 0;
    for (var i = 0; i < n; i++) {
      var l = new T.PointLight(0xffcc88, 0, 26, 2);
      l.position.set(0, -1000, 0);
      scene.add(l);
      this.lights.push({ light: l, ttl: 0, max: 0.1, peak: 2 });
    }
  }
  FlashPool.prototype.flash = function (x, y, z, color, intensity, dist, ttl) {
    var it = this.lights[this.cursor];
    this.cursor = (this.cursor + 1) % this.lights.length;
    it.light.position.set(x, y, z);
    it.light.color.setHex(color);
    it.light.distance = dist || 26;
    it.light.intensity = intensity;
    it.peak = intensity;
    it.ttl = ttl || 0.1;
    it.max = it.ttl;
  };
  FlashPool.prototype.update = function (dt) {
    for (var i = 0; i < this.lights.length; i++) {
      var it = this.lights[i];
      if (it.ttl <= 0) continue;
      it.ttl -= dt;
      if (it.ttl <= 0) { it.light.intensity = 0; it.light.position.y = -1000; continue; }
      it.light.intensity = it.peak * (it.ttl / it.max);
    }
  };

  /* 空气中的浮尘：始终围绕玩家循环，几乎零开销地提升气氛 */
  function DustMotes(scene, count, radius) {
    this.count = count;
    this.R = radius;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.ph = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      this.pos[i * 3] = G.rand(-radius, radius);
      this.pos[i * 3 + 1] = G.rand(-radius, radius);
      this.pos[i * 3 + 2] = G.rand(-radius, radius);
      this.vel[i * 3] = G.rand(-0.10, 0.10);
      this.vel[i * 3 + 1] = G.rand(-0.06, 0.03);
      this.vel[i * 3 + 2] = G.rand(-0.10, 0.10);
      this.ph[i] = G.rand(0, 6.28);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    var mat = new T.PointsMaterial({
      size: 0.032, sizeAttenuation: true, map: G.dotTex(),
      color: 0x9fb4c8, transparent: true, opacity: 0.42,
      depthWrite: false, blending: T.AdditiveBlending
    });
    this.points = new T.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.geo = g;
    this.t = 0;
  }
  DustMotes.prototype.update = function (dt, cx, cy, cz) {
    this.t += dt;
    var p = this.pos, v = this.vel, R = this.R, R2 = R * 2;
    for (var i = 0; i < this.count; i++) {
      var i3 = i * 3;
      /* 轻微漂浮 */
      p[i3] += (v[i3] + Math.sin(this.t * 0.7 + this.ph[i]) * 0.05) * dt;
      p[i3 + 1] += (v[i3 + 1] + Math.sin(this.t * 0.5 + this.ph[i] * 1.7) * 0.03) * dt;
      p[i3 + 2] += (v[i3 + 2] + Math.cos(this.t * 0.6 + this.ph[i]) * 0.05) * dt;
      /* 用「以玩家为中心」的循环包裹，永远围绕在附近 */
      if (p[i3] < cx - R) p[i3] += R2; else if (p[i3] > cx + R) p[i3] -= R2;
      if (p[i3 + 1] < cy - R) p[i3 + 1] += R2; else if (p[i3 + 1] > cy + R) p[i3 + 1] -= R2;
      if (p[i3 + 2] < cz - R) p[i3 + 2] += R2; else if (p[i3 + 2] > cz + R) p[i3 + 2] -= R2;
    }
    this.geo.attributes.position.needsUpdate = true;
  };

  /* FX 集合 */
  G.createFX = function (scene) {
    var fx = {
      glow: new ParticleSystem(scene, 0.11, true, 900),
      dust: new ParticleSystem(scene, 0.20, false, 400),
      chunks: new ChunkSystem(scene, 150),
      tracers: new TracerSystem(scene, 24),
      decals: new DecalSystem(scene, 44),
      flashes: new FlashPool(scene, 2)
    };
    fx.update = function (dt) {
      fx.glow.update(dt); fx.dust.update(dt); fx.chunks.update(dt);
      fx.tracers.update(dt); fx.decals.update(dt); fx.flashes.update(dt);
    };
    /** 通用命中特效 */
    fx.impact = function (p, nx, ny, nz, kind) {
      if (kind === 'flesh') {
        fx.chunks.burst(p.x, p.y, p.z, 5, 0x7a0d0d, 3.6, 0.07, 1.4);
        fx.glow.burst(p.x, p.y, p.z, 8, 0xcc2222, 3.0, 0.35, -4, nx, ny, nz, 0.7);
        A.play('flesh', 0.8);
      } else if (kind === 'metal') {
        fx.glow.burst(p.x, p.y, p.z, 12, 0xffcc66, 5.5, 0.32, -12, nx, ny, nz, 0.8);
        fx.dust.burst(p.x, p.y, p.z, 5, 0x8a8a8a, 1.4, 0.6, -1.5, nx, ny, nz, 0.9);
        fx.decals.place(p.x, p.y, p.z, nx, ny, nz, 0.16);
        A.play('ricochet', 0.7);
      } else {
        fx.chunks.burst(p.x, p.y, p.z, 3, 0x6a6a66, 2.6, 0.05, 1.2);
        fx.dust.burst(p.x, p.y, p.z, 7, 0x9b9b95, 1.8, 0.7, -1.2, nx, ny, nz, 0.9);
        fx.decals.place(p.x, p.y, p.z, nx, ny, nz, 0.26);
        A.play('ricochet', 0.5);
      }
    };
    /** 爆炸 */
    fx.explode = function (x, y, z, scale) {
      scale = scale || 1;
      fx.flashes.flash(x, y, z, 0xffaa44, 6 * scale, 34 * scale, 0.32);
      fx.glow.burst(x, y, z, 34, 0xffbb55, 11 * scale, 0.6, -6);
      fx.glow.burst(x, y, z, 20, 0xff7722, 6 * scale, 1.0, -3);
      fx.dust.burst(x, y, z, 26, 0x777777, 4.5 * scale, 1.4, -1.2);
      fx.chunks.burst(x, y, z, 12, 0x555555, 7 * scale, 0.12, 2.0);
      A.play('explode', 1);
    };
    /** 清空全部特效（关卡重置时调用） */
    fx.clear = function () {
      [fx.glow, fx.dust].forEach(function (ps) {
        for (var i = 0; i < ps.max; i++) {
          ps.life[i] = 0;
          ps.pos[i * 3 + 1] = -9999;
          ps.col[i * 3] = ps.col[i * 3 + 1] = ps.col[i * 3 + 2] = 0;
        }
        ps.geo.attributes.position.needsUpdate = true;
        ps.geo.attributes.color.needsUpdate = true;
      });
      fx.chunks.items.forEach(function (it) { it.life = 0; it.mesh.visible = false; });
      fx.tracers.items.forEach(function (it) { it.life = 0; it.mesh.visible = false; });
      fx.decals.items.forEach(function (it) { it.life = 0; it.mesh.visible = false; });
      fx.flashes.lights.forEach(function (it) { it.ttl = 0; it.light.intensity = 0; it.light.position.y = -1000; });
    };
    return fx;
  };

  G.ParticleSystem = ParticleSystem;
  G.DustMotes = DustMotes;
  console.log('[HL3] core.js 已加载');
})();

