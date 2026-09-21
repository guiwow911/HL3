/* =========================================================================
   半条命 3：重返黑山  ——  textures.js
   高质量程序化贴图：多倍频噪声 + 结构性细节（裂缝/水渍/焊接/铆钉/木纹）
   并可从同一张高度图自动生成法线贴图
   ========================================================================= */
(function () {
  'use strict';
  var T = THREE, G = window.G;

  /* =====================================================================
     基础工具
     ===================================================================== */
  function canvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  /* 多倍频值噪声（比撒点平滑得多，用来做真实的表面起伏） */
  function valueNoise(size, cells) {
    var g = new Float32Array(cells * cells);
    for (var i = 0; i < g.length; i++) g[i] = Math.random();
    var out = new Float32Array(size * size);
    for (var y = 0; y < size; y++) {
      var fy = y / size * cells, y0 = Math.floor(fy), ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      var y1 = (y0 + 1) % cells; y0 %= cells;
      for (var x = 0; x < size; x++) {
        var fx = x / size * cells, x0 = Math.floor(fx), tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        var x1 = (x0 + 1) % cells; x0 %= cells;
        var v00 = g[y0 * cells + x0], v10 = g[y0 * cells + x1];
        var v01 = g[y1 * cells + x0], v11 = g[y1 * cells + x1];
        out[y * size + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
      }
    }
    return out;
  }
  function fbm(size, baseCells, octaves, gain) {
    var out = new Float32Array(size * size), amp = 1, norm = 0, cells = baseCells;
    for (var o = 0; o < octaves; o++) {
      var n = valueNoise(size, Math.max(2, Math.round(cells)));
      for (var i = 0; i < out.length; i++) out[i] += n[i] * amp;
      norm += amp; amp *= (gain || 0.5); cells *= 2;
    }
    for (var j = 0; j < out.length; j++) out[j] /= norm;
    return out;
  }

  function makeTex(c, srgb) {
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb !== false) t.encoding = T.sRGBEncoding;
    return t;
  }

  /* 由贴图亮度生成法线贴图（Sobel）
     为了启动速度，法线贴图按半分辨率生成：法线是低频信息，肉眼几乎看不出差别 */
  function buildNormalMap(srcTex, strength) {
    var src = srcTex.image;
    var w0 = src.width, h0 = src.height;
    var w = Math.max(64, w0 >> 1), h = Math.max(64, h0 >> 1);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, w0, h0, 0, 0, w, h);
    var img = g.getImageData(0, 0, w, h), d = img.data;
    var lum = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var i4 = i * 4;
      lum[i] = (d[i4] * 0.299 + d[i4 + 1] * 0.587 + d[i4 + 2] * 0.114) / 255;
    }
    var out = g.createImageData(w, h), od = out.data;
    var s = (strength || 1) * 4.2;
    for (var y = 0; y < h; y++) {
      var ym = ((y - 1) + h) % h, yp = (y + 1) % h;
      var ry = y * w, rym = ym * w, ryp = yp * w;
      for (var x = 0; x < w; x++) {
        var xm = ((x - 1) + w) % w, xp = (x + 1) % w;
        var dx = (lum[ry + xp] - lum[ry + xm]) * s;
        var dy = (lum[ryp + x] - lum[rym + x]) * s;
        var len = Math.sqrt(dx * dx + dy * dy + 1);
        var o4 = (ry + x) * 4;
        od[o4] = ((-dx / len) * 0.5 + 0.5) * 255;
        od[o4 + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
        od[o4 + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        od[o4 + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
    return makeTex(c, false);   /* 法线贴图保持线性 */
  }

  function grainOverlay(g, s, amount, alpha) {
    var img = g.getImageData(0, 0, s, s), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }

  /* 裂缝：随机折线，带暗芯 + 亮边（看起来像真的裂开） */
  function cracks(g, s, count, width, dark, light) {
    for (var i = 0; i < count; i++) {
      var x = Math.random() * s, y = Math.random() * s;
      var a = Math.random() * 6.283, len = 0;
      var pts = [[x, y]];
      var seg = 6 + Math.floor(Math.random() * 10);
      for (var k = 0; k < seg; k++) {
        a += (Math.random() - 0.5) * 1.1;
        var d = 6 + Math.random() * 22;
        x += Math.cos(a) * d; y += Math.sin(a) * d;
        pts.push([x, y]); len += d;
      }
      g.lineCap = 'round';
      g.strokeStyle = light;
      g.lineWidth = width + 1.6;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var m = 1; m < pts.length; m++) g.lineTo(pts[m][0], pts[m][1]);
      g.stroke();
      g.strokeStyle = dark;
      g.lineWidth = width;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var n = 1; n < pts.length; n++) g.lineTo(pts[n][0], pts[n][1]);
      g.stroke();
    }
  }

  /* 铆钉：暗环 + 左上高光 */
  function rivet(g, x, y, r, dark, light) {
    g.fillStyle = dark;
    g.beginPath(); g.arc(x + 0.8, y + 1.0, r, 0, 6.283); g.fill();
    g.fillStyle = light;
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.fillStyle = dark;
    g.beginPath(); g.arc(x, y, r * 0.55, 0, 6.283); g.fill();
  }

  /* =====================================================================
     贴图库
     ===================================================================== */
  var GEN = {};

  /* ---------- 混凝土墙 ---------- */
  GEN.concrete = function (S) {
    S = S || 512;
    var c = canvas(S), g = c.getContext('2d');
    var base = fbm(S, 4, 5, 0.55);
    var fine = fbm(S, 64, 2, 0.5);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var v = 0.36 + base[i] * 0.20 + (fine[i] - 0.5) * 0.05;
      var i4 = i * 4;
      d[i4] = v * 255 * 1.00; d[i4 + 1] = v * 255 * 1.02; d[i4 + 2] = v * 255 * 1.06;
      d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);

    /* 水渍：自上而下的湿痕 */
    for (var w = 0; w < 26; w++) {
      var wx = Math.random() * S, ww = 6 + Math.random() * 40;
      var grd = g.createLinearGradient(0, 0, 0, S * (0.3 + Math.random() * 0.7));
      grd.addColorStop(0, 'rgba(28,30,26,0.22)');
      grd.addColorStop(1, 'rgba(28,30,26,0)');
      g.fillStyle = grd;
      g.fillRect(wx, 0, ww, S);
    }
    /* 面板缝：凹槽 + 下缘高光 */
    var half = S / 2;
    for (var p = 0; p <= 2; p++) {
      var q = p * half;
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(q, 0); g.lineTo(q, S); g.stroke();
      g.beginPath(); g.moveTo(0, q); g.lineTo(S, q); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(q + 4, 0); g.lineTo(q + 4, S); g.stroke();
      g.beginPath(); g.moveTo(0, q + 4); g.lineTo(S, q + 4); g.stroke();
    }
    /* 裂缝 */
    cracks(g, S, 9, 1.4, 'rgba(12,12,14,0.75)', 'rgba(190,190,185,0.14)');
    /* 崩角 */
    for (var k = 0; k < 14; k++) {
      g.fillStyle = 'rgba(20,20,22,' + (0.10 + Math.random() * 0.18).toFixed(2) + ')';
      g.beginPath();
      g.moveTo(Math.random() * S, Math.random() * S);
      for (var e = 0; e < 4; e++) g.lineTo(Math.random() * S, Math.random() * S);
      g.fill();
    }
    /* 铆钉 */
    for (var r = 0; r < 4; r++) for (var rr = 0; rr < 4; rr++) {
      rivet(g, 18 + rr * (S - 36) / 3, 18 + r * (S - 36) / 3, 3.2,
        'rgba(20,20,22,0.55)', 'rgba(190,192,196,0.42)');
    }
    grainOverlay(g, S, 26);
    return makeTex(c);
  };
  GEN.concrete.bump = 1.0;

  /* ---------- 实验室瓷砖 ---------- */
  GEN.tile = function (S) {
    S = S || 512;
    var c = canvas(S), g = c.getContext('2d');
    var n = 4, cell = S / n, gap = 5;
    g.fillStyle = '#2a2c2b';
    g.fillRect(0, 0, S, S);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var v = 0.62 + Math.random() * 0.16;
      var px = x * cell + gap, py = y * cell + gap, sz = cell - gap * 2;
      var grd = g.createLinearGradient(px, py, px + sz, py + sz);
      grd.addColorStop(0, 'rgb(' + ((v * 262) | 0) + ',' + ((v * 266) | 0) + ',' + ((v * 262) | 0) + ')');
      grd.addColorStop(1, 'rgb(' + ((v * 218) | 0) + ',' + ((v * 222) | 0) + ',' + ((v * 220) | 0) + ')');
      g.fillStyle = grd;
      g.fillRect(px, py, sz, sz);
      /* 内倒角 */
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
      g.strokeRect(px + 1, py + 1, sz - 2, sz - 2);
      g.strokeStyle = 'rgba(0,0,0,0.30)';
      g.strokeRect(px + 4, py + 4, sz - 8, sz - 8);
    }
    /* 部分瓷砖开裂 */
    cracks(g, S, 5, 1.1, 'rgba(30,30,28,0.55)', 'rgba(255,255,255,0.10)');
    /* 缝隙积污 */
    for (var s = 0; s < 40; s++) {
      g.fillStyle = 'rgba(52,62,38,' + (0.05 + Math.random() * 0.16).toFixed(2) + ')';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, 4 + Math.random() * 26, 0, 6.283);
      g.fill();
    }
    grainOverlay(g, S, 18);
    return makeTex(c);
  };
  GEN.tile.bump = 0.85;

  /* ---------- 金属地板（花纹钢板） ---------- */
  GEN.floor = function (S) {
    S = S || 512;
    var c = canvas(S), g = c.getContext('2d');
    var base = fbm(S, 6, 5, 0.55);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var v = 0.20 + base[i] * 0.14;
      var i4 = i * 4;
      d[i4] = v * 255; d[i4 + 1] = v * 262; d[i4 + 2] = v * 272;
      d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    /* 防滑菱形花纹（左上高光 / 右下阴影） */
    var step = 64, dw = 22, dh = 9;
    for (var y = 0; y < S; y += step) {
      var off = ((y / step) % 2) ? step / 2 : 0;
      for (var x = -step; x < S + step; x += step) {
        var cx = x + off + step / 2, cy = y + step / 2;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var a = sgn * 0.9;
          g.save();
          g.translate(cx, cy); g.rotate(a);
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.fillRect(-dw / 2, -dh / 2 - 1.4, dw, dh);
          g.fillStyle = 'rgba(0,0,0,0.34)';
          g.fillRect(-dw / 2 + 1.2, -dh / 2 + 1.2, dw, dh);
          g.fillStyle = 'rgba(150,158,168,0.30)';
          g.fillRect(-dw / 2 + 1.2, -dh / 2 + 1.2, dw, dh - 2.4);
          g.restore();
        }
      }
    }
    /* 焊接边框 */
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 5;
    g.strokeRect(3, 3, S - 6, S - 6);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
    g.strokeRect(8, 8, S - 16, S - 16);
    /* 锈斑与刮痕 */
    for (var k = 0; k < 60; k++) {
      g.fillStyle = 'rgba(' + ((120 + Math.random() * 60) | 0) + ',' + ((70 + Math.random() * 40) | 0) + ',30,' +
        (0.05 + Math.random() * 0.20).toFixed(2) + ')';
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 3 + Math.random() * 22, 0, 6.283); g.fill();
    }
    for (var sc = 0; sc < 40; sc++) {
      g.strokeStyle = 'rgba(200,205,210,' + (0.03 + Math.random() * 0.09).toFixed(2) + ')';
      g.lineWidth = 1 + Math.random() * 2;
      var sx = Math.random() * S, sy = Math.random() * S;
      g.beginPath(); g.moveTo(sx, sy);
      g.lineTo(sx + (Math.random() - 0.5) * 90, sy + (Math.random() - 0.5) * 90);
      g.stroke();
    }
    grainOverlay(g, S, 20);
    return makeTex(c);
  };
  GEN.floor.bump = 1.15;

  /* ---------- 金属墙板（拉丝 + 铆钉 + 焊缝） ---------- */
  GEN.metal = function (S) {
    S = S || 512;
    var c = canvas(S), g = c.getContext('2d');
    var base = fbm(S, 5, 4, 0.55);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var v = 0.30 + base[i] * 0.16;
      var i4 = i * 4;
      d[i4] = v * 250; d[i4 + 1] = v * 258; d[i4 + 2] = v * 272;
      d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    /* 竖向拉丝 */
    for (var x = 0; x < S; x += 1) {
      var a = 0.02 + Math.random() * 0.05;
      g.fillStyle = (Math.random() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + a.toFixed(3) + ')';
      g.fillRect(x, 0, 1, S);
    }
    /* 面板分割 + 铆钉 */
    var cols = 2, rows = 3;
    var cw = S / cols, rh = S / rows;
    for (var r = 0; r < rows; r++) {
      for (var q = 0; q < cols; q++) {
        var px = q * cw, py = r * rh;
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4;
        g.strokeRect(px + 2, py + 2, cw - 4, rh - 4);
        g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 2;
        g.strokeRect(px + 5, py + 5, cw - 10, rh - 10);
        for (var b = 0; b < 8; b++) {
          var t = b / 7;
          rivet(g, px + 16 + t * (cw - 32), py + 12, 3.0, 'rgba(15,18,22,0.6)', 'rgba(196,204,214,0.5)');
          rivet(g, px + 16 + t * (cw - 32), py + rh - 12, 3.0, 'rgba(15,18,22,0.6)', 'rgba(196,204,214,0.5)');
        }
      }
    }
    /* 加强筋 */
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, S / 2 - 6, S, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, S / 2 + 3, S, 4);
    /* 掉漆露锈 */
    for (var k = 0; k < 70; k++) {
      g.fillStyle = 'rgba(' + ((118 + Math.random() * 70) | 0) + ',' + ((64 + Math.random() * 40) | 0) + ',26,' +
        (0.10 + Math.random() * 0.35).toFixed(2) + ')';
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 2 + Math.random() * 16, 0, 6.283); g.fill();
    }
    grainOverlay(g, S, 22);
    return makeTex(c);
  };
  GEN.metal.bump = 1.0;

  /* ---------- 锈蚀金属 ---------- */
  GEN.rust = function (S) {
    S = S || 384;
    var c = canvas(S), g = c.getContext('2d');
    var a = fbm(S, 4, 5, 0.6), b = fbm(S, 24, 3, 0.5);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var t = a[i] * 0.7 + b[i] * 0.3;
      var i4 = i * 4;
      d[i4] = (70 + t * 130) * 1.00;
      d[i4 + 1] = (30 + t * 80) * 1.00;
      d[i4 + 2] = (18 + t * 42) * 1.00;
      d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    /* 蚀坑 */
    for (var k = 0; k < 220; k++) {
      var x = Math.random() * S, y = Math.random() * S, r = 1 + Math.random() * 6;
      g.fillStyle = 'rgba(20,10,6,0.5)';
      g.beginPath(); g.arc(x + 1, y + 1.4, r, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(210,150,90,0.22)';
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    /* 锈水往下流 */
    for (var s = 0; s < 30; s++) {
      var sx = Math.random() * S;
      var grd = g.createLinearGradient(0, 0, 0, S);
      grd.addColorStop(0, 'rgba(40,22,12,0.30)');
      grd.addColorStop(1, 'rgba(40,22,12,0)');
      g.fillStyle = grd;
      g.fillRect(sx, 0, 2 + Math.random() * 10, S);
    }
    grainOverlay(g, S, 30);
    return makeTex(c);
  };
  GEN.rust.bump = 1.25;

  /* ---------- 木箱（木板 + 金属包角） ---------- */
  GEN.crate = function (S) {
    S = S || 512;
    var c = canvas(S), g = c.getContext('2d');
    var planks = 5, pw = S / planks;
    for (var p = 0; p < planks; p++) {
      var v = 0.44 + Math.random() * 0.14;
      g.fillStyle = 'rgb(' + ((v * 196) | 0) + ',' + ((v * 150) | 0) + ',' + ((v * 96) | 0) + ')';
      g.fillRect(p * pw, 0, pw, S);
      /* 木纹 */
      for (var i = 0; i < 34; i++) {
        var y = Math.random() * S;
        g.strokeStyle = 'rgba(50,32,16,' + (0.05 + Math.random() * 0.16).toFixed(2) + ')';
        g.lineWidth = 0.8 + Math.random() * 1.6;
        g.beginPath();
        g.moveTo(p * pw, y);
        for (var x = p * pw; x < (p + 1) * pw; x += 12) {
          g.lineTo(x, y + Math.sin(x * 0.06 + p) * 4 + (Math.random() - 0.5) * 2);
        }
        g.stroke();
      }
      /* 板缝 */
      g.fillStyle = 'rgba(24,16,8,0.65)';
      g.fillRect(p * pw, 0, 3, S);
      g.fillStyle = 'rgba(255,230,190,0.10)';
      g.fillRect(p * pw + 3, 0, 2, S);
    }
    /* 金属包角 */
    var br = S * 0.16;
    g.fillStyle = 'rgba(78,84,92,0.95)';
    g.fillRect(0, 0, br, 14); g.fillRect(0, 0, 14, br);
    g.fillRect(S - br, 0, br, 14); g.fillRect(S - 14, 0, 14, br);
    g.fillRect(0, S - 14, br, 14); g.fillRect(0, S - br, 14, br);
    g.fillRect(S - br, S - 14, br, 14); g.fillRect(S - 14, S - br, 14, br);
    for (var b = 0; b < 4; b++) {
      var t2 = b / 3;
      rivet(g, 8 + t2 * (br - 16), 7, 2.6, 'rgba(12,14,18,0.75)', 'rgba(200,208,218,0.5)');
      rivet(g, 7, 8 + t2 * (br - 16), 2.6, 'rgba(12,14,18,0.75)', 'rgba(200,208,218,0.5)');
    }
    /* 喷涂标记 */
    g.save();
    g.globalAlpha = 0.32;
    g.strokeStyle = '#e8d24a'; g.lineWidth = 5;
    g.strokeRect(S * 0.30, S * 0.42, S * 0.22, S * 0.16);
    g.beginPath();
    g.moveTo(S * 0.34, S * 0.50); g.lineTo(S * 0.48, S * 0.50);
    g.moveTo(S * 0.41, S * 0.44); g.lineTo(S * 0.41, S * 0.56);
    g.stroke();
    g.restore();
    cracks(g, S, 6, 1.0, 'rgba(30,18,8,0.45)', 'rgba(255,235,200,0.06)');
    grainOverlay(g, S, 24);
    return makeTex(c);
  };
  GEN.crate.bump = 0.9;

  /* ---------- 通风格栅 ---------- */
  GEN.grate = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    g.fillStyle = '#0a0c0e'; g.fillRect(0, 0, S, S);
    var bars = 8, step = S / bars, bw = step * 0.42;
    for (var i = 0; i < bars; i++) {
      var p = i * step + (step - bw) / 2;
      g.fillStyle = 'rgba(150,158,168,0.85)'; g.fillRect(p, 0, bw, S);
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(p, 0, 2, S);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(p + bw - 3, 0, 3, S);
      g.fillStyle = 'rgba(150,158,168,0.85)'; g.fillRect(0, p, S, bw);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, p, S, 2);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, p + bw - 3, S, 3);
    }
    grainOverlay(g, S, 22);
    return makeTex(c);
  };
  GEN.grate.bump = 1.3;

  /* ---------- 危险条纹 ---------- */
  GEN.hazard = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    g.fillStyle = '#d8a41c'; g.fillRect(0, 0, S, S);
    g.save();
    g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4); g.translate(-S, -S);
    g.fillStyle = '#16181a';
    for (var i = 0; i < 12; i++) g.fillRect(0, i * S / 5, S * 2, S / 10);
    g.restore();
    /* 磨损掉漆 */
    for (var k = 0; k < 260; k++) {
      g.fillStyle = 'rgba(' + ((90 + Math.random() * 60) | 0) + ',' + ((70 + Math.random() * 40) | 0) + ',40,' +
        (0.06 + Math.random() * 0.28).toFixed(2) + ')';
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 0.8 + Math.random() * 5, 0, 6.283); g.fill();
    }
    grainOverlay(g, S, 26);
    return makeTex(c);
  };
  GEN.hazard.bump = 0.4;

  /* ---------- 天花板 ---------- */
  GEN.ceiling = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    var n = fbm(S, 4, 4, 0.55);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var v = 0.20 + n[i] * 0.10, i4 = i * 4;
      d[i4] = v * 255; d[i4 + 1] = v * 258; d[i4 + 2] = v * 266; d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4;
    g.strokeRect(2, 2, S - 4, S - 4);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2;
    g.strokeRect(6, 6, S - 12, S - 12);
    for (var k = 0; k < 22; k++) {
      g.fillStyle = 'rgba(30,26,18,' + (0.05 + Math.random() * 0.16).toFixed(2) + ')';
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 5 + Math.random() * 24, 0, 6.283); g.fill();
    }
    grainOverlay(g, S, 18);
    return makeTex(c);
  };
  GEN.ceiling.bump = 0.6;

  /* ---------- 毒性污泥 ---------- */
  GEN.sludge = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    var a = fbm(S, 5, 4, 0.6);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var t = a[i], i4 = i * 4;
      d[i4] = (44 + t * 90) * 1.0;
      d[i4 + 1] = (74 + t * 140) * 1.0;
      d[i4 + 2] = (16 + t * 44) * 1.0;
      d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    /* 气泡：亮顶 + 暗边 */
    for (var k = 0; k < 70; k++) {
      var x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 9;
      g.fillStyle = 'rgba(30,54,10,0.5)';
      g.beginPath(); g.arc(x, y + r * 0.25, r, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(190,240,90,0.42)';
      g.beginPath(); g.arc(x, y, r * 0.72, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,255,220,0.35)';
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.28, r * 0.24, 0, 6.283); g.fill();
    }
    grainOverlay(g, S, 22);
    return makeTex(c);
  };
  GEN.sludge.bump = 1.1;

  /* ---------- 玻璃 ---------- */
  GEN.glass = function (S) {
    S = S || 128;
    var c = canvas(S), g = c.getContext('2d');
    g.fillStyle = 'rgba(168,212,218,0.28)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(235,255,255,0.55)'; g.lineWidth = 5;
    g.strokeRect(4, 4, S - 8, S - 8);
    g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, S * 0.75); g.lineTo(S * 0.75, 0); g.stroke();
    g.beginPath(); g.moveTo(S * 0.25, S); g.lineTo(S, S * 0.25); g.stroke();
    for (var k = 0; k < 5; k++) {
      g.fillStyle = 'rgba(120,150,130,0.10)';
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 6 + Math.random() * 18, 0, 6.283); g.fill();
    }
    return makeTex(c);
  };

  /* ---------- 灯板 ---------- */
  GEN.panel = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.5, '#fff6de');
    grd.addColorStop(1, '#f4e4c0');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(140,138,126,0.35)';
    for (var i = 0; i < 10; i++) g.fillRect(0, i * S / 10, S, 2);
    g.strokeStyle = 'rgba(60,60,54,0.92)'; g.lineWidth = 14;
    g.strokeRect(6, 6, S - 12, S - 12);
    grainOverlay(g, S, 10);
    return makeTex(c);
  };

  /* ---------- 传送门 ---------- */
  GEN.portal = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.22, '#9ceaff');
    grd.addColorStop(0.55, '#2f8dff');
    grd.addColorStop(0.82, 'rgba(30,90,220,0.35)');
    grd.addColorStop(1, 'rgba(10,20,60,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(200,250,255,0.55)';
    for (var i = 0; i < 16; i++) {
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.arc(S / 2, S / 2, 8 + i * 7, Math.random() * 6, Math.random() * 6 + 1);
      g.stroke();
    }
    return makeTex(c);
  };

  /* ---------- 弹孔 ---------- */
  GEN.decal = function (S) {
    S = S || 64;
    var c = canvas(S), g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.96)');
    grd.addColorStop(0.30, 'rgba(22,20,18,0.80)');
    grd.addColorStop(0.62, 'rgba(70,64,54,0.34)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * 6.283;
      g.lineWidth = Math.random() < 0.5 ? 1 : 2;
      g.beginPath(); g.moveTo(S / 2, S / 2);
      g.lineTo(S / 2 + Math.cos(a) * S * 0.5, S / 2 + Math.sin(a) * S * 0.5); g.stroke();
    }
    return makeTex(c);
  };

  /* ---------- 联合军装甲 ---------- */
  GEN.combine = function (S) {
    S = S || 256;
    var c = canvas(S), g = c.getContext('2d');
    var n = fbm(S, 4, 4, 0.55);
    var img = g.createImageData(S, S), d = img.data;
    for (var i = 0; i < S * S; i++) {
      var v = 0.20 + n[i] * 0.10, i4 = i * 4;
      d[i4] = v * 250; d[i4 + 1] = v * 266; d[i4 + 2] = v * 290; d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    /* 装甲分片 */
    g.strokeStyle = 'rgba(10,14,20,0.7)'; g.lineWidth = 4;
    for (var r = 0; r < 4; r++) {
      var y = r * S / 4 + 10;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y + 4); g.lineTo(S, y + 4); g.stroke();
      g.strokeStyle = 'rgba(10,14,20,0.7)'; g.lineWidth = 4;
    }
    /* 红色标识 */
    g.fillStyle = 'rgba(190,52,38,0.35)';
    g.fillRect(S / 2 - 7, 0, 14, S);
    for (var k = 0; k < 40; k++) {
      g.fillStyle = 'rgba(20,24,30,' + (0.08 + Math.random() * 0.2).toFixed(2) + ')';
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 2 + Math.random() * 12, 0, 6.283); g.fill();
    }
    grainOverlay(g, S, 20);
    return makeTex(c);
  };
  GEN.combine.bump = 0.7;

  /* ---------- 圆点粒子 / 辉光 / 血泊（沿用简版，保持接口） ---------- */
  GEN.dot = function () {
    var S = 64, c = canvas(S), g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return makeTex(c, false);
  };
  GEN.glow = function () {
    var S = 128, c = canvas(S), g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0.00, 'rgba(255,255,255,1)');
    grd.addColorStop(0.16, 'rgba(255,246,214,0.70)');
    grd.addColorStop(0.42, 'rgba(255,200,124,0.20)');
    grd.addColorStop(1.00, 'rgba(255,172,72,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    var t = makeTex(c, false);
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  };
  GEN.blood = function () {
    var S = 192, c = canvas(S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    var i, a, r, cx, cy, rad;
    for (i = 0; i < 44; i++) {
      a = Math.random() * 6.283;
      r = Math.pow(Math.random(), 0.62) * S * 0.34;
      cx = S / 2 + Math.cos(a) * r; cy = S / 2 + Math.sin(a) * r;
      rad = (0.10 + Math.random() * 0.20) * S * (1 - r / (S * 0.62));
      g.fillStyle = 'rgba(' + ((58 + Math.random() * 44) | 0) + ',' +
        ((3 + Math.random() * 9) | 0) + ',' + ((5 + Math.random() * 9) | 0) + ',0.94)';
      g.beginPath(); g.arc(cx, cy, Math.max(2, rad), 0, 6.283); g.fill();
    }
    g.fillStyle = 'rgba(102,6,9,0.97)';
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.23, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(140,14,16,0.55)';
    g.beginPath(); g.arc(S / 2 - S * 0.04, S / 2 - S * 0.04, S * 0.14, 0, 6.283); g.fill();
    for (i = 0; i < 34; i++) {
      a = Math.random() * 6.283;
      r = S * (0.33 + Math.random() * 0.17);
      g.fillStyle = 'rgba(' + ((66 + Math.random() * 44) | 0) + ',5,7,0.72)';
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1 + Math.random() * 3.6, 0, 6.283);
      g.fill();
    }
    return makeTex(c);
  };

  /* 每种贴图的法线强度（0/未定义 = 不生成法线贴图） */
  GEN.concrete.bump = 1.0;
  GEN.tile.bump = 0.85;
  GEN.floor.bump = 1.15;
  GEN.metal.bump = 1.0;
  GEN.rust.bump = 1.25;
  GEN.crate.bump = 0.9;
  GEN.grate.bump = 1.3;
  GEN.ceiling.bump = 0.6;
  GEN.sludge.bump = 1.1;
  GEN.combine.bump = 0.7;
  GEN.hazard.bump = 0.4;

  G.TEXGEN = GEN;
  G.buildNormalMap = buildNormalMap;
  console.log('[HL3] textures.js 已加载：' + Object.keys(GEN).length + ' 种高质量程序化贴图');
})();
