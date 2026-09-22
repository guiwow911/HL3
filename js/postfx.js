/* =========================================================================
   半条命 3：重返黑山  ——  postfx.js
   轻量后期处理：亮部提取 → 分离高斯模糊 → 合成（泛光 + 暗角 + 颗粒 + 色差）
   只用一个全屏四边形做 4 个 pass，弱显卡可关闭
   ========================================================================= */
(function () {
  'use strict';
  var T = THREE, G = window.G;

  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_BRIGHT = [
    'uniform sampler2D tDiffuse;',
    'uniform float threshold;',
    'uniform float knee;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  float s = clamp((l - threshold) / max(knee, 1e-4), 0.0, 1.0);',
    '  gl_FragColor = vec4(c * s, 1.0);',
    '}'
  ].join('\n');

  var FRAG_BLUR = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 dir;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 s = vec4(0.0);',
    '  s += texture2D(tDiffuse, vUv - dir * 4.0) * 0.051;',
    '  s += texture2D(tDiffuse, vUv - dir * 3.0) * 0.0918;',
    '  s += texture2D(tDiffuse, vUv - dir * 2.0) * 0.12245;',
    '  s += texture2D(tDiffuse, vUv - dir * 1.0) * 0.1531;',
    '  s += texture2D(tDiffuse, vUv) * 0.1633;',
    '  s += texture2D(tDiffuse, vUv + dir * 1.0) * 0.1531;',
    '  s += texture2D(tDiffuse, vUv + dir * 2.0) * 0.12245;',
    '  s += texture2D(tDiffuse, vUv + dir * 3.0) * 0.0918;',
    '  s += texture2D(tDiffuse, vUv + dir * 4.0) * 0.051;',
    '  gl_FragColor = s;',
    '}'
  ].join('\n');

  var FRAG_COMP = [
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform float bloomStrength;',
    'uniform float vignette;',
    'uniform float grain;',
    'uniform float ca;',
    'uniform float time;',
    'uniform float exposure;',
    'uniform float gamma;',
    'varying vec2 vUv;',
    'float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 d = uv - 0.5;',
    /* 轻微色差：边缘更明显 */
    '  vec3 col;',
    '  col.r = texture2D(tScene, uv - d * ca).r;',
    '  col.g = texture2D(tScene, uv).g;',
    '  col.b = texture2D(tScene, uv + d * ca).b;',
    '  col += texture2D(tBloom, uv).rgb * bloomStrength;',
    '  col *= exposure;',
    /* 暗角 */
    '  float r2 = dot(d, d);',
    '  col *= 1.0 - vignette * smoothstep(0.10, 0.78, r2);',
    /* 颗粒 */
    '  col += (rand(uv * 1024.0 + fract(time) * 91.7) - 0.5) * grain;',
    /* 场景 RT 已经是 sRGB 编码（见 sceneRT.texture.encoding），
       这里只做可选的额外校正，避免重复做 gamma 变亮 */
    '  col = pow(max(col, 0.0), vec3(gamma));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function PostFX(renderer) {
    this.renderer = renderer;
    this.enabled = false;
    this.w = 1; this.h = 1;

    var type = T.UnsignedByteType;
    try {
      /* 半浮点 RT 让泛光的高光过渡更好；不支持就退回普通 8bit */
      if (renderer.capabilities.isWebGL2 || renderer.extensions.get('OES_texture_half_float')) {
        type = T.HalfFloatType;
      }
    } catch (e) { type = T.UnsignedByteType; }
    this.rtType = type;

    this.sceneRT = new T.WebGLRenderTarget(1, 1, {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter,
      format: T.RGBAFormat, type: type, depthBuffer: true, stencilBuffer: false
    });
    /* 关键：标记为 sRGB，让场景渲染进 RT 时做与“直接画到画布”一致的编码；
       否则合成阶段再做一次 gamma 会导致整体双重变亮 */
    this.sceneRT.texture.encoding = T.sRGBEncoding;
    this.rtA = new T.WebGLRenderTarget(1, 1, {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false
    });
    this.rtB = new T.WebGLRenderTarget(1, 1, {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false
    });

    var base = { depthTest: false, depthWrite: false, transparent: false };
    this.brightMat = new T.ShaderMaterial(Object.assign({}, base, {
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.74 },
        knee: { value: 0.36 }
      },
      vertexShader: VERT, fragmentShader: FRAG_BRIGHT
    }));
    this.blurMat = new T.ShaderMaterial(Object.assign({}, base, {
      uniforms: { tDiffuse: { value: null }, dir: { value: new T.Vector2() } },
      vertexShader: VERT, fragmentShader: FRAG_BLUR
    }));
    this.compMat = new T.ShaderMaterial(Object.assign({}, base, {
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        bloomStrength: { value: 0.62 }, vignette: { value: 0.40 },
        grain: { value: 0.030 }, ca: { value: 0.0016 },
        time: { value: 0 }, exposure: { value: 1.0 }, gamma: { value: 1.0 }
      },
      vertexShader: VERT, fragmentShader: FRAG_COMP
    }));

    this.quadScene = new T.Scene();
    this.quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2), this.brightMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this._v2 = new T.Vector2();
  }

  PostFX.prototype.setQuality = function (level) {
    if (level === '低') {
      this.enabled = false;
    } else if (level === '中') {
      this.enabled = true;
      this.compMat.uniforms.bloomStrength.value = 0.42;
      this.compMat.uniforms.grain.value = 0.018;
      this.compMat.uniforms.ca.value = 0.0008;
      this.compMat.uniforms.vignette.value = 0.34;
    } else {
      this.enabled = true;
      this.compMat.uniforms.bloomStrength.value = 0.62;
      this.compMat.uniforms.grain.value = 0.030;
      this.compMat.uniforms.ca.value = 0.0016;
      this.compMat.uniforms.vignette.value = 0.40;
    }
  };

  PostFX.prototype.setSize = function (w, h) {
    this.w = Math.max(1, Math.floor(w));
    this.h = Math.max(1, Math.floor(h));
    this.sceneRT.setSize(this.w, this.h);
    var bw = Math.max(1, Math.floor(this.w / 4)), bh = Math.max(1, Math.floor(this.h / 4));
    this.rtA.setSize(bw, bh);
    this.rtB.setSize(bw, bh);
    this.bw = bw; this.bh = bh;
  };

  /** 渲染整个后期链（场景 → 泛光 → 合成到画布） */
  PostFX.prototype.render = function (scene, camera, time) {
    var r = this.renderer;
    /* 1. 场景 → RT（线性空间） */
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    /* 2. 亮部提取 → 1/4 分辨率 */
    this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.quad.material = this.brightMat;
    r.setRenderTarget(this.rtA);
    r.clear();
    r.render(this.quadScene, this.quadCam);

    /* 3. 横向模糊 */
    this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
    this.blurMat.uniforms.dir.value.set(1 / this.bw, 0);
    this.quad.material = this.blurMat;
    r.setRenderTarget(this.rtB);
    r.clear();
    r.render(this.quadScene, this.quadCam);

    /* 4. 纵向模糊 */
    this.blurMat.uniforms.tDiffuse.value = this.rtB.texture;
    this.blurMat.uniforms.dir.value.set(0, 1 / this.bh);
    this.quad.material = this.blurMat;
    r.setRenderTarget(this.rtA);
    r.clear();
    r.render(this.quadScene, this.quadCam);

    /* 5. 合成到画布 */
    this.compMat.uniforms.tScene.value = this.sceneRT.texture;
    this.compMat.uniforms.tBloom.value = this.rtA.texture;
    this.compMat.uniforms.time.value = time || 0;
    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  };

  G.PostFX = PostFX;
  console.log('[HL3] postfx.js 已加载');
})();


