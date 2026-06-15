/* =============================================================================
 * MERRYON — Virtual Powder Room & Wardrobe (wardrobe-site.js)
 * -----------------------------------------------------------------------------
 * merryon.co.kr 메인 페이지 배경용 풀스크린 3D 파우더룸 + 옷장 씬.
 *
 *  · 실제 상품 사진(merryon.co.kr /web/product/medium/...)을 옷장 안 의류 패널에
 *    텍스처로 매핑하고, 카메라/기기 틸트에 따라 깊이별로 패럴랙스 시킨다.
 *  · Three.js r165 + EffectComposer 풀 파이프라인(SSAO·Bloom·Bokeh·SMAA).
 *  · 글로벌 스코프 오염 없는 IIFE. document.querySelector('.main_image_1_background')
 *    안에 캔버스를 자동 삽입한다.
 *  · Cafe24 호환: 호스트 HTML 에 importmap 을 추가할 필요 없이, 스크립트 내부에서
 *    importmap 을 주입한 뒤 three 모듈/애드온을 동적 import 한다.
 *    (HTML 에는 three.min.js <script> 2줄만 추가 → 스펙 준수)
 *
 *  배포: 본 파일 + snippet.html(2줄) + main_card1.css.snippet 추가만으로 동작.
 * ========================================================================== */
(function () {
  'use strict';

  if (window.__MERRYON_WARDROBE__) return;       // 중복 실행 가드
  window.__MERRYON_WARDROBE__ = true;

  var THREE_VER = '0.165.0';
  var CDN = 'https://cdn.jsdelivr.net/npm/three@' + THREE_VER + '/';
  // 실사 텍스처/HDRI (three.js 예제 에셋, jsdelivr→GitHub, CORS 허용). 저장소 용량 0.
  var GH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r165/examples/textures/';

  /* ----------------------------------------------------------------------- *
   * 0. 부트스트랩 — importmap 주입 후 모듈 동적 로드
   * ----------------------------------------------------------------------- */
  function injectImportMap() {
    // 이미 importmap 이 있으면(드물게) 건드리지 않는다.
    if (document.querySelector('script[type="importmap"]')) return true;
    try {
      var im = document.createElement('script');
      im.type = 'importmap';
      im.textContent = JSON.stringify({
        imports: {
          'three': CDN + 'build/three.module.js',
          'three/addons/': CDN + 'examples/jsm/'
        }
      });
      // 모듈 그래프가 로드되기 전에 head 최상단에 삽입돼야 한다.
      (document.head || document.documentElement).appendChild(im);
      return true;
    } catch (e) {
      console.warn('[merryon] importmap 주입 실패:', e);
      return false;
    }
  }

  function boot() {
    var container = document.querySelector('.main_image_1_background');
    if (!container) {
      // 메인 페이지가 아니면 조용히 종료
      return;
    }
    if (!injectImportMap()) return;

    Promise.all([
      import('three'),
      import('three/addons/objects/Reflector.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/lights/RectAreaLightUniformsLib.js'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/SSAOPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/BokehPass.js'),
      import('three/addons/postprocessing/SMAAPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/loaders/RGBELoader.js')
    ]).then(function (mods) {
      var T = mods[0];
      var addons = {
        Reflector: mods[1].Reflector,
        RoomEnvironment: mods[2].RoomEnvironment,
        RectAreaLightUniformsLib: mods[3].RectAreaLightUniformsLib,
        EffectComposer: mods[4].EffectComposer,
        RenderPass: mods[5].RenderPass,
        ShaderPass: mods[6].ShaderPass,
        SSAOPass: mods[7].SSAOPass,
        UnrealBloomPass: mods[8].UnrealBloomPass,
        BokehPass: mods[9].BokehPass,
        SMAAPass: mods[10].SMAAPass,
        OutputPass: mods[11].OutputPass,
        RGBELoader: mods[12].RGBELoader
      };
      try {
        new WardrobeScene(T, addons, container);
      } catch (e) {
        console.error('[merryon] 씬 초기화 실패:', e);
      }
    }).catch(function (e) {
      console.error('[merryon] three 모듈 로드 실패:', e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ----------------------------------------------------------------------- *
   * 브랜드 팔레트
   * ----------------------------------------------------------------------- */
  var PALETTE = {
    ivory:     0xF6F0E4,
    cream:     0xF3E9D6,
    offwhite:  0xFBF8F1,
    navy:      0x2A3247,
    blush:     0xF3D2D0,
    lavender:  0xD9CDEC,
    sage:      0xB9C6A8,
    camel:     0xC2A079,
    deeprose:  0xB0566A,
    gold:      0xC9A96E,
    goldLight: 0xE2CD9E,
    rosewood:  0x5A3A33,
    dustyrose: 0xCFA9A6,
    marble:    0xF4F1EC
  };

  /* ----------------------------------------------------------------------- *
   * 실제 상품 매핑 (merryon.co.kr) — 12벌
   *   tint: 텍스처 로드 실패 시 폴백 색
   *   fabric: sheen / roughness 프로파일
   * ----------------------------------------------------------------------- */
  /* 상품 이미지 경로 해석.
   *  · 운영(merryon.co.kr): same-origin 절대경로를 그대로 사용 → CORS 무관.
   *  · 데모/프리뷰(GitHub Pages·localhost·타 도메인): merryon 과 다른 출처라
   *    핫링크/CORS 로 텍스처가 실패할 수 있으므로, 호스트 페이지에서
   *    window.MERRYON_WARDROBE_CONFIG 로 경로를 치환할 수 있게 한다.
   *      - resolveImage(path) : 함수로 임의 매핑 (예: 로컬 assets)
   *      - imageBase          : 접두 베이스 (예: '/assets/products/')
   *    아무 것도 없으면 원래(운영) 경로를 유지한다. → 운영 경로 불변.
   */
  function img(path) {
    var cfg = window.MERRYON_WARDROBE_CONFIG || {};
    if (typeof cfg.resolveImage === 'function') return cfg.resolveImage(path);
    if (cfg.imageBase) return cfg.imageBase + path;
    return '//merryon.co.kr/web/product/medium/' + path;
  }
  var PRODUCTS = [
    { name:'제니 트위드 자켓',        src:img('202504/254093e6035f531fff8b6dae127a180d.jpg'), tint:PALETTE.cream,    rough:0.9,  sheen:0.7 },
    { name:'바인 플리츠 원피스',      src:img('202504/695f4bbaa31ec541c33ddd8d242bcaf5.jpg'), tint:PALETTE.navy,     rough:0.85, sheen:0.3 },
    { name:'모엘리 홀터 블라우스 핑크',src:img('202604/18cc6224e79bc134140456f018fdf63e.jpg'), tint:PALETTE.blush,    rough:0.15, sheen:0.9 },
    { name:'마일 롱스커트',           src:img('202604/e2c2b0815c222de5f613e2ce9dda8bd4.jpg'), tint:PALETTE.lavender, rough:0.35, sheen:0.6 },
    { name:'벨리나 레이스 블라우스',  src:img('202505/afc8f6de46e9c9191aeb3c7f5df4389c.jpg'), tint:PALETTE.offwhite, rough:0.45, sheen:0.8 },
    { name:'에렌 쉬폰 블라우스 베이지',src:img('202605/d60f7438aa3158924767d21e7971de4a.jpg'), tint:PALETTE.camel,    rough:0.75, sheen:0.4 },
    { name:'포카리 셔츠 원피스',      src:img('202504/fc8395d3c669bd2a41d1bd45b59cdc89.jpg'), tint:0xBFD3E6,        rough:0.5,  sheen:0.5 },
    { name:'제니 트위드 자켓 블랙',   src:img('202504/0cf77899c08c4ed5c8d4233e368fa92c.jpg'), tint:0x2C2A2E,        rough:0.9,  sheen:0.6 },
    { name:'포레스 가디건세트 핑크',  src:img('202606/c11cc243de4d3290e794bb83401ccdf4.gif'), tint:PALETTE.blush,    rough:1.0,  sheen:0.2 },
    { name:'에렌 쉬폰 블라우스 민트', src:img('202605/d765704c19bc16a90074ed28c19b7f1c.jpg'), tint:PALETTE.sage,     rough:0.4,  sheen:0.6 },
    { name:'리토 코튼 블라우스 아이보리',src:img('202606/85a38c8ba7cc930cb1e55d5ac512cbb8.jpg'), tint:PALETTE.offwhite,rough:0.8, sheen:0.5 },
    { name:'베로디 홀터넥 블라우스',  src:img('202604/3eb44ed11c66117a4637db0bc28d5e98.jpg'), tint:PALETTE.deeprose, rough:0.25, sheen:1.0 }
  ];

  /* ======================================================================= *
   * WardrobeScene
   * ======================================================================= */
  function WardrobeScene(T, AD, container) {
    var self = this;
    this.T = T; this.AD = AD; this.container = container;

    var isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                   (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    this.isMobile = isMobile;

    /* --- 렌더러 --------------------------------------------------------- */
    var renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;   // 과노출 방지(추가 하향)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
    this.renderer = renderer;
    // 텍스처 선명도: 비등방 필터 최대치(보통 16) — 비스듬한 표면(바닥/벽)의 흐림 방지
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();

    var canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.zIndex = '0';
    container.appendChild(canvas);

    /* --- 씬 / 카메라 ---------------------------------------------------- */
    var scene = new T.Scene();
    scene.background = new T.Color(PALETTE.ivory);
    scene.fog = new T.FogExp2(PALETTE.cream, 0.12);   // 인트로에서 0.026 으로 걷힘
    this.scene = scene;

    // 모바일은 세로 화면이라 넓은 FOV 로 더 멀리서 보는 느낌(답답함 완화)
    var camera = new T.PerspectiveCamera(isMobile ? 66 : 50, 1, 0.1, 100);
    camera.position.set(0, 1.9, 2.5);
    this.camera = camera;
    // 360° 체험형: 눈높이(≈1.45m) 피벗, 방 중앙 부근(어느 각도든 방 안)
    this.target = new T.Vector3(0, 1.45, -0.3);

    AD.RectAreaLightUniformsLib.init();

    /* --- 환경맵 --------------------------------------------------------- *
     * 즉시: RoomEnvironment(빠른 폴백) → 로드 후: 실사 HDRI 로 교체(IBL/반사 사실감).
     * HDRI 는 조명/반사용으로만 쓰고, 배경은 브랜드 컬러 유지(파우더룸이 아니므로).
     */
    var pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    this.pmrem = pmrem;
    var envTex = pmrem.fromScene(new AD.RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.9;
    this.envTex = envTex;

    (function (self) {
      try {
        new AD.RGBELoader().load(GH + 'equirectangular/royal_esplanade_1k.hdr',
          function (hdr) {
            hdr.mapping = T.EquirectangularReflectionMapping;
            var env = self.pmrem.fromEquirectangular(hdr).texture;
            scene.environment = env;
            self.envTex = env;
            hdr.dispose();
          }, undefined, function () { /* 실패 시 RoomEnvironment 유지 */ });
      } catch (e) { /* noop */ }
    })(this);

    /* --- 구성 ----------------------------------------------------------- */
    this.crystals = [];
    this.flowers = [];
    this.cubeMirrors = [];
    this.garmentGroup = null;

    // 방 치수(사람 비율, 1 unit ≈ 1m) — 천장 2.9m 의 현실적 고급 침실
    this.ROOM = { W: 7.6, H: 2.9, D: 6.6 };

    this._buildLights();
    this._buildRoom();
    this._buildCeilingAndChandelier();
    this._buildWindowAndCurtain();
    this._buildArmoire();
    this._buildVanity();
    this._buildFloorMirror();
    this._buildOttoman();
    // (정리) 의미 불명 요소 제거: 페데스탈/모자박스 미배치
    // this._buildPedestalFlowers();
    // this._buildHatBoxes();
    this._buildRug();

    this._setupComposer();
    this._setupInteraction();
    this._resize();

    window.addEventListener('resize', function () { self._resize(); });
    // 컨테이너 크기 변동 대응
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(container);
    }

    /* --- 인트로 상태 ---------------------------------------------------- */
    this.clock = new T.Clock();
    this.elapsed = 0;
    this.introDone = false;
    this._frame = 0;

    this._animate = this._animate.bind(this);
    renderer.setAnimationLoop(this._animate);
  }

  var P = WardrobeScene.prototype;

  /* ----------------------------------------------------------------------- *
   * 캔버스 텍스처 유틸 (최대 512×512)
   * ----------------------------------------------------------------------- */
  P._canvas = function (size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = Math.min(size, this.isMobile ? 1024 : 2048);
    draw(c.getContext('2d'), c.width);
    var tex = new this.T.CanvasTexture(c);
    tex.colorSpace = this.T.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    tex.generateMipmaps = true;
    tex.minFilter = this.T.LinearMipmapLinearFilter;
    return tex;
  };

  P._hex = function (n) { var s = n.toString(16); return '#' + '000000'.slice(s.length) + s; };

  /* 실사 CDN 텍스처 로더 (three.js 예제 에셋). opt: {srgb, repeat:[u,v]} */
  P._tex = function (path, opt) {
    opt = opt || {};
    var T = this.T;
    if (!this._texLoader) { this._texLoader = new T.TextureLoader(); this._texLoader.crossOrigin = 'anonymous'; }
    var t = this._texLoader.load(GH + path);
    t.colorSpace = opt.srgb ? T.SRGBColorSpace : T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
    t.anisotropy = this.maxAniso;
    return t;
  };

  /* 헤링본 파케이 원목 텍스처 */
  P._herringbone = function () {
    var self = this;
    return this._canvas(512, function (ctx, S) {
      ctx.fillStyle = '#caa97f'; ctx.fillRect(0, 0, S, S);
      var n = 8, w = S / n, h = w * 2.2;
      var tones = ['#c8a87c', '#bd9a6c', '#d2b488', '#b8946a', '#c5a376'];
      for (var y = -1; y < n + 2; y++) {
        for (var x = -1; x < n + 2; x++) {
          var ti = (x + y * 3 + 50) % tones.length;
          var cx = x * w, cy = y * (w);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(((x + y) % 2 === 0 ? 1 : -1) * Math.PI / 4);
          ctx.fillStyle = tones[ti];
          ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
          // 나뭇결
          ctx.strokeStyle = 'rgba(90,60,35,0.18)';
          ctx.lineWidth = 0.6;
          for (var g = 0; g < 4; g++) {
            ctx.beginPath();
            ctx.moveTo(-w * 0.5, -h * 0.5 + h * (g + 0.5) / 4);
            ctx.lineTo(w * 0.5, -h * 0.5 + h * (g + 0.5) / 4 + 1.5);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(60,40,25,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
          ctx.restore();
        }
      }
    });
  };

  /* 크림 패브릭 벽 텍스처 */
  P._fabricWall = function () {
    return this._canvas(256, function (ctx, S) {
      ctx.fillStyle = '#f3ecdd'; ctx.fillRect(0, 0, S, S);
      for (var i = 0; i < 9000; i++) {
        var a = Math.random() * 0.05;
        ctx.fillStyle = (Math.random() > 0.5 ? 'rgba(255,255,255,' : 'rgba(180,165,135,') + a + ')';
        ctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
      }
      // 미세 수직 위빙
      ctx.strokeStyle = 'rgba(210,195,160,0.08)';
      for (var x = 0; x < S; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
    });
  };

  /* 대리석 텍스처 */
  P._marbleTex = function () {
    return this._canvas(512, function (ctx, S) {
      ctx.fillStyle = '#f4f1ec'; ctx.fillRect(0, 0, S, S);
      ctx.lineWidth = 1.2;
      for (var i = 0; i < 22; i++) {
        ctx.strokeStyle = 'rgba(150,140,150,' + (0.06 + Math.random() * 0.12) + ')';
        ctx.beginPath();
        var x = Math.random() * S, y = Math.random() * S;
        ctx.moveTo(x, y);
        for (var s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // 미세 결정 얼룩으로 깊이감
      for (var g = 0; g < 1600; g++) {
        ctx.fillStyle = 'rgba(120,115,125,' + (Math.random() * 0.04) + ')';
        ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
      }
    });
  };

  /* 그레이스케일 범프(법선 대용) — 선형 컬러스페이스 */
  P._bump = function (size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = Math.min(size, 512);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, c.width, c.width);
    draw(ctx, c.width);
    var t = new this.T.CanvasTexture(c);
    t.colorSpace = this.T.NoColorSpace;
    t.wrapS = t.wrapT = this.T.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };

  /* 대리석 범프(정맥 융기) */
  P._marbleBump = function () {
    return this._bump(512, function (ctx, S) {
      ctx.lineWidth = 1.4;
      for (var i = 0; i < 22; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 + Math.random() * 0.2) + ')';
        ctx.beginPath();
        var x = Math.random() * S, y = Math.random() * S; ctx.moveTo(x, y);
        for (var s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    });
  };

  /* 원목 나뭇결 텍스처 + 범프 */
  P._woodTex = function (baseHex, darkRGB) {
    return this._canvas(512, function (ctx, S) {
      ctx.fillStyle = baseHex; ctx.fillRect(0, 0, S, S);
      for (var i = 0; i < 70; i++) {
        ctx.strokeStyle = 'rgba(' + darkRGB + ',' + (0.05 + Math.random() * 0.13) + ')';
        ctx.lineWidth = 0.4 + Math.random() * 1.8;
        ctx.beginPath();
        var y = Math.random() * S; ctx.moveTo(0, y);
        for (var x = 0; x <= S; x += 16) { y += (Math.random() - 0.5) * 7; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (var k = 0; k < 4; k++) {
        var kx = Math.random() * S, ky = Math.random() * S, kr = 14 + Math.random() * 18;
        var rg = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr);
        rg.addColorStop(0, 'rgba(' + darkRGB + ',0.3)'); rg.addColorStop(1, 'rgba(' + darkRGB + ',0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, 7); ctx.fill();
      }
    });
  };
  P._woodBump = function () {
    return this._bump(512, function (ctx, S) {
      for (var i = 0; i < 70; i++) {
        ctx.strokeStyle = 'rgba(' + (Math.random() > 0.5 ? '255,255,255,' : '0,0,0,') + (0.06 + Math.random() * 0.14) + ')';
        ctx.lineWidth = 0.4 + Math.random() * 1.6;
        ctx.beginPath();
        var y = Math.random() * S; ctx.moveTo(0, y);
        for (var x = 0; x <= S; x += 16) { y += (Math.random() - 0.5) * 7; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    });
  };

  /* 벨벳(나프) 텍스처 + 범프 */
  P._velvetTex = function (rgb) {
    return this._canvas(512, function (ctx, S) {
      ctx.fillStyle = rgb; ctx.fillRect(0, 0, S, S);
      for (var i = 0; i < 42000; i++) {
        ctx.fillStyle = (Math.random() > 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (Math.random() * 0.06) + ')';
        ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
      }
    });
  };
  P._velvetBump = function () {
    return this._bump(256, function (ctx, S) {
      for (var i = 0; i < 16000; i++) {
        ctx.fillStyle = (Math.random() > 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (Math.random() * 0.5) + ')';
        ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
      }
    });
  };

  /* 직조 러그 텍스처 + 범프 */
  P._rugTex = function (rgb) {
    return this._canvas(512, function (ctx, S) {
      ctx.fillStyle = rgb; ctx.fillRect(0, 0, S, S);
      for (var y = 0; y < S; y += 4) {
        for (var x = 0; x < S; x += 4) {
          var on = ((x / 4) + (y / 4)) % 2 === 0;
          ctx.fillStyle = 'rgba(255,255,255,' + (on ? 0.06 : 0) + ')';
          ctx.fillRect(x, y, 3, 2);
          ctx.fillStyle = 'rgba(0,0,0,' + (on ? 0 : 0.06) + ')';
          ctx.fillRect(x, y, 2, 3);
        }
      }
    });
  };
  P._rugBump = function () {
    return this._bump(256, function (ctx, S) {
      for (var y = 0; y < S; y += 4) {
        for (var x = 0; x < S; x += 4) {
          var on = ((x / 4) + (y / 4)) % 2 === 0;
          ctx.fillStyle = on ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
          ctx.fillRect(x, y, on ? 3 : 2, on ? 2 : 3);
        }
      }
    });
  };

  /* 모자박스 린넨 텍스처 */
  P._linenTex = function (rgb) {
    return this._canvas(256, function (ctx, S) {
      ctx.fillStyle = rgb; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      for (var x = 0; x < S; x += 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      for (var y = 0; y < S; y += 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
    });
  };

  /* ----------------------------------------------------------------------- *
   * 조명
   * ----------------------------------------------------------------------- */
  P._buildLights = function () {
    var T = this.T, scene = this.scene, R = this.ROOM;

    var amb = new T.AmbientLight(0xFFF5E8, 0.34);
    scene.add(amb);

    // 샹들리에 포인트 라이트 × 2 (인트로에서 0 → 페이드인)
    this.chandLights = [];
    var p1 = new T.PointLight(0xFFE8CC, 0.0, 9, 2); p1.position.set(-0.25, R.H - 0.9, -0.6);
    var p2 = new T.PointLight(0xFFE8CC, 0.0, 9, 2); p2.position.set(0.25, R.H - 0.9, -0.6);
    if (!this.isMobile) {
      p1.castShadow = p2.castShadow = true;
      p1.shadow.mapSize.set(1024, 1024); p2.shadow.mapSize.set(1024, 1024);
      p1.shadow.bias = p2.shadow.bias = -0.0006;
    }
    scene.add(p1, p2);
    this.chandLights.push(p1, p2);

    // 창문 자연광 (오른쪽 벽, 천장까지 통창)
    var win = new T.RectAreaLight(0xE8F4FF, 2.2, 1.8, 3.0);
    win.position.set(R.W / 2 - 0.15, 1.7, 0.8);
    win.lookAt(0, 1.5, 0);
    scene.add(win);

    var dir = new T.DirectionalLight(0xFFF0DC, 0.7);
    dir.position.set(3.2, 3.0, 2.2);
    dir.target.position.set(-0.5, 0.8, -1.0);
    if (!this.isMobile) {
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.camera.left = -5; dir.shadow.camera.right = 5;
      dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
      dir.shadow.camera.near = 0.3; dir.shadow.camera.far = 14;
      dir.shadow.bias = -0.0004;
    }
    scene.add(dir, dir.target);
    this.sunLight = dir;

    // LightProbe (부드러운 환경 채움)
    var probe = new T.LightProbe();
    probe.sh.coefficients[0].setScalar(0.32);
    scene.add(probe);

    // 바니티 미러 위 (백-좌측)
    var vm = new T.RectAreaLight(0xFFD4CC, 0.8, 0.9, 0.8);
    vm.position.set(-2.8, 1.9, -2.6);
    vm.lookAt(-2.8, 1.1, -2.0);
    scene.add(vm);

    // 옷장 의류 스포트
    var sp = new T.SpotLight(0xFFF6EC, 2.6, 8, Math.PI / 3.6, 0.45, 1.1);
    sp.position.set(0, R.H - 0.5, -2.4);
    sp.target.position.set(0, 1.4, -3.3);
    scene.add(sp, sp.target);
    this.armoireSpot = sp;

    // 의류 정면 소프트 필
    var fill = new T.RectAreaLight(0xFFF3E6, 1.0, 3.2, 1.8);
    fill.position.set(0, 1.7, -2.2);
    fill.lookAt(0, 1.7, -3.4);
    scene.add(fill);
  };

  /* ----------------------------------------------------------------------- *
   * 룸 셸 (바닥/벽/몰딩/웨인스코팅)
   * ----------------------------------------------------------------------- */
  P._buildRoom = function () {
    var T = this.T, scene = this.scene, AD = this.AD;
    var W = this.ROOM.W, H = this.ROOM.H, D = this.ROOM.D;

    var goldMat = new T.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.2 });
    this.goldMat = goldMat;
    var goldLightMat = new T.MeshStandardMaterial({ color: PALETTE.goldLight, metalness: 0.9, roughness: 0.35 });

    var gold = this.goldMat;
    var goldThin = new T.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.3 });
    var doorMat = new T.MeshStandardMaterial({ color: 0xF3EEE4, roughness: 0.5, metalness: 0.0 });
    var doorPanelMat = new T.MeshStandardMaterial({ color: 0xEDE6D8, roughness: 0.6, metalness: 0.0 });

    /* 바닥: 밝은 대리석 + 데스크탑 Reflector 광택 */
    var marbleTex = this._marbleTex();
    marbleTex.wrapS = marbleTex.wrapT = T.RepeatWrapping; marbleTex.repeat.set(3, 3);
    var marbleBmp = this._marbleBump(); marbleBmp.repeat.set(3, 3);
    if (!this.isMobile) {
      var reflector = new AD.Reflector(new T.PlaneGeometry(W, D), {
        textureWidth: 1024, textureHeight: 1024, color: 0x9b968c, clipBias: 0.003
      });
      reflector.rotation.x = -Math.PI / 2; reflector.position.y = 0.0;
      scene.add(reflector); this.reflector = reflector;
      var overlay = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshPhysicalMaterial({
        map: marbleTex, bumpMap: marbleBmp, bumpScale: 0.012, color: 0xF6F3EC,
        roughness: 0.28, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.18,
        transparent: true, opacity: 0.82, envMapIntensity: 0.9
      }));
      overlay.rotation.x = -Math.PI / 2; overlay.position.y = 0.012; overlay.receiveShadow = true;
      scene.add(overlay);
    } else {
      var floor = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshPhysicalMaterial({
        map: marbleTex, bumpMap: marbleBmp, bumpScale: 0.012, color: 0xF6F3EC,
        roughness: 0.3, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.8
      }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    }

    /* 벽 (4면, 전체 균일한 거의-흰 밝은 베이지) */
    var wallMat = new T.MeshStandardMaterial({ color: 0xF1ECE0, roughness: 0.95, metalness: 0.0 });
    function wall(w, h, x, y, z, ry) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m;
    }
    wall(W, H, 0, H / 2, -D / 2, 0);                 // 뒷벽(옷장)
    wall(W, H, 0, H / 2, D / 2, Math.PI);            // 앞벽
    wall(D, H, -W / 2, H / 2, 0, Math.PI / 2);       // 좌벽
    wall(D, H, W / 2, H / 2, 0, -Math.PI / 2);       // 우벽

    /* 몰딩: 베이스/체어레일/크라운 — 전부 얇은 골드 (웨인스코팅 패널 없음) */
    function moldRun(width, x, z, ry, y, depth, height) {
      var m = new T.Mesh(new T.BoxGeometry(width, height, depth), goldThin);
      m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
    }
    [
      { w: W, x: 0, z: -D / 2 + 0.04, ry: 0 },
      { w: W, x: 0, z: D / 2 - 0.04, ry: 0 },
      { w: D, x: -W / 2 + 0.04, z: 0, ry: Math.PI / 2 },
      { w: D, x: W / 2 - 0.04, z: 0, ry: Math.PI / 2 }
    ].forEach(function (r) {
      moldRun(r.w, r.x, r.z, r.ry, 0.1, 0.04, 0.16);       // 베이스보드(얇은 골드)
      moldRun(r.w, r.x, r.z, r.ry, 0.92, 0.03, 0.04);      // 체어레일(가는 골드 라인, ≈0.9m)
      moldRun(r.w, r.x, r.z, r.ry, H - 0.1, 0.05, 0.1);    // 크라운(얇은 골드)
    });

    /* 문 — 좌우 맞닿는 더블/싱글, 사람 키 기준 ≈2.05m, 슬림 골드 바 손잡이 */
    function buildDoor(cx, cz, ry, dbl) {
      var grp = new T.Group(); grp.position.set(cx, 0, cz); grp.rotation.y = ry; scene.add(grp);
      var lh = 2.1, lw = dbl ? 0.85 : 0.92;
      var caseW = (dbl ? lw * 2 : lw) + 0.16;
      var casing = new T.Mesh(new T.BoxGeometry(caseW, lh + 0.16, 0.08), goldThin);
      casing.position.set(0, lh / 2 + 0.03, -0.025); grp.add(casing);
      var leaves = dbl ? [-1, 1] : [0];
      leaves.forEach(function (s) {
        var cxo = dbl ? s * lw / 2 : 0;
        var leaf = new T.Mesh(new T.BoxGeometry(lw - 0.008, lh, 0.05), doorMat);
        leaf.position.set(cxo, lh / 2, 0.025); leaf.castShadow = true; grp.add(leaf);
        [lh * 0.72, lh * 0.30].forEach(function (py) {
          var dp = new T.Mesh(new T.BoxGeometry(lw * 0.66, lh * 0.34, 0.01), doorPanelMat);
          dp.position.set(cxo, py, 0.052); grp.add(dp);
        });
        // 슬림 골드 바 손잡이(세로) — 더블은 맞닿는 안쪽, 싱글은 한쪽
        var hx = dbl ? (cxo - s * (lw / 2 - 0.09)) : (lw / 2 - 0.1);
        var handle = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.42, 12), gold);
        handle.position.set(hx, lh * 0.5, 0.07); grp.add(handle);
      });
    }
    buildDoor(0, D / 2 - 0.04, Math.PI, true);            // 앞벽 중앙: 맞닿는 더블 도어
    buildDoor(-W / 2 + 0.04, -1.6, Math.PI / 2, false);  // 좌벽: 싱글 도어
    buildDoor(W / 2 - 0.04, -2.3, -Math.PI / 2, false);  // 우벽: 싱글 도어(창과 분리)
  };

  /* ----------------------------------------------------------------------- *
   * 천장 + 로제트 메달리온 + 샹들리에
   * ----------------------------------------------------------------------- */
  P._buildCeilingAndChandelier = function () {
    var T = this.T, scene = this.scene;
    var W = this.ROOM.W, H = this.ROOM.H, D = this.ROOM.D;

    var ceil = new T.Mesh(new T.PlaneGeometry(W, D),
      new T.MeshStandardMaterial({ color: PALETTE.offwhite, roughness: 1.0, side: T.BackSide }));
    ceil.rotation.x = -Math.PI / 2; ceil.position.y = H;
    scene.add(ceil);

    // 로제트 메달리온 (사람 비율)
    var medMat = new T.MeshStandardMaterial({ color: PALETTE.offwhite, roughness: 0.9 });
    var med = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.05, 48), medMat);
    med.position.set(0, H - 0.025, -0.6);
    scene.add(med);
    for (var r = 0; r < 3; r++) {
      var ring = new T.Mesh(new T.TorusGeometry(0.15 + r * 0.11, 0.018, 12, 48), medMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, H - 0.04, -0.6);
      scene.add(ring);
    }

    /* 샹들리에 (천장 가까이, 짧게 매달림) */
    var chand = new T.Group();
    chand.position.set(0, H - 0.16, -0.6);
    chand.scale.setScalar(0.42);
    scene.add(chand);
    this.chandelier = chand;

    var gold = this.goldMat;
    // 천장에서 내려오는 짧은 골드 체인
    var chain = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.16, 10), gold);
    chain.position.set(0, H - 0.08, -0.6); scene.add(chain);

    var stem = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.2, 12), gold);
    stem.position.y = -0.6; chand.add(stem);

    var hub = new T.Mesh(new T.SphereGeometry(0.22, 20, 16), gold);
    hub.position.y = -1.2; chand.add(hub);

    // 크리스탈 머티리얼 (밝게 빛나 Bloom 유발)
    var crystalMat = new T.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.0, roughness: 0.02,
      transmission: 1.0, thickness: 0.4, ior: 1.6,
      transparent: true, opacity: 0.85,
      emissive: 0xFFE8CC, emissiveIntensity: 0.12,
      envMapIntensity: 1.3
    });
    this.crystalMat = crystalMat;

    var crystalGeo = new T.OctahedronGeometry(0.085, 0);
    var dropGeo = new T.ConeGeometry(0.038, 0.14, 6);

    // 2단 골드 암 + 크리스탈 32개
    var tiers = [{ r: 0.95, n: 12, y: -1.1 }, { r: 0.62, n: 9, y: -0.75 }, { r: 1.15, n: 11, y: -1.35 }];
    for (var t = 0; t < tiers.length; t++) {
      var ti = tiers[t];
      for (var a = 0; a < ti.n; a++) {
        var ang = (a / ti.n) * Math.PI * 2 + t * 0.3;
        var ax = Math.cos(ang) * ti.r, az = Math.sin(ang) * ti.r;
        // 골드 암
        var arm = new T.Mesh(new T.TorusGeometry(ti.r * 0.5, 0.022, 8, 16, Math.PI), gold);
        arm.position.set(ax * 0.5, ti.y + 0.1, az * 0.5);
        arm.rotation.y = -ang; arm.rotation.x = Math.PI / 2;
        chand.add(arm);
        // 크리스탈 펜던트
        var cg = new T.Group();
        cg.position.set(ax, ti.y, az);
        var crys = new T.Mesh(crystalGeo, crystalMat);
        cg.add(crys);
        var drop = new T.Mesh(dropGeo, crystalMat);
        drop.position.y = -0.16; drop.rotation.x = Math.PI;
        cg.add(drop);
        chand.add(cg);
        this.crystals.push({ obj: cg, baseY: ti.y, phase: Math.random() * Math.PI * 2, amp: 0.015 + Math.random() * 0.02 });
      }
    }
    // 중앙 빛 코어 (Bloom 강조)
    var core = new T.Mesh(new T.SphereGeometry(0.12, 16, 12),
      new T.MeshBasicMaterial({ color: 0xF6E4C4 }));
    core.position.y = -1.2; chand.add(core);
    this.chandCore = core;
  };

  /* ----------------------------------------------------------------------- *
   * 창문 + 쉬폰 커튼 (wave morph)
   * ----------------------------------------------------------------------- */
  P._buildWindowAndCurtain = function () {
    var T = this.T, scene = this.scene;
    var W = this.ROOM.W, H = this.ROOM.H;
    var wx = W / 2 - 0.05;
    var cz = 1.0, winW = 2.6, winH = H - 0.7, winY = winH / 2 + 0.25;
    var frameMat = this.goldMat;

    // 통창 프레임(천장에서 바닥까지)
    var fr = new T.Mesh(new T.BoxGeometry(0.2, winH + 0.3, winW + 0.3), frameMat);
    fr.position.set(wx + 0.05, winY, cz); scene.add(fr);
    // 유리
    var glass = new T.Mesh(new T.PlaneGeometry(winW, winH), new T.MeshPhysicalMaterial({
      color: 0xEAF5FF, roughness: 0.05, metalness: 0.0, transmission: 0.6, transparent: true,
      opacity: 0.5, emissive: 0xEAF5FF, emissiveIntensity: 0.22, side: T.DoubleSide
    }));
    glass.rotation.y = -Math.PI / 2; glass.position.set(wx - 0.07, winY, cz); scene.add(glass);
    this.windowGlass = glass;
    // 멀리언 격자
    for (var mz = -1; mz <= 1; mz++) {
      var vb = new T.Mesh(new T.BoxGeometry(0.05, winH, 0.07), frameMat);
      vb.position.set(wx - 0.1, winY, cz + mz * (winW / 3)); scene.add(vb);
    }
    for (var my = -1; my <= 1; my++) {
      var hb = new T.Mesh(new T.BoxGeometry(0.05, 0.07, winW), frameMat);
      hb.position.set(wx - 0.1, winY + my * (winH / 3.2), cz); scene.add(hb);
    }
    // 천장 커튼 봉
    var rod = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, winW + 1.6, 12), frameMat);
    rod.rotation.x = Math.PI / 2; rod.position.set(wx - 0.34, H - 0.4, cz); scene.add(rod);

    // 천장→바닥 쉬폰 커튼 (wave morph)
    var curtH = H - 0.6;
    var cg = new T.PlaneGeometry(winW + 1.4, curtH, 28, 16);
    var cmat = new T.MeshPhysicalMaterial({
      color: PALETTE.offwhite, roughness: 0.6, transmission: 0.55,
      thickness: 0.2, transparent: true, opacity: 0.5, side: T.DoubleSide,
      sheen: 1.0, sheenColor: new T.Color(0xFFF4E8)
    });
    var curtain = new T.Mesh(cg, cmat);
    curtain.rotation.y = -Math.PI / 2;
    curtain.position.set(wx - 0.36, curtH / 2 + 0.2, cz);
    scene.add(curtain);
    this.curtain = curtain;
    this.curtainBase = cg.attributes.position.array.slice();
  };

  /* ----------------------------------------------------------------------- *
   * 옷장 (아르무아) + 의류 패널 12 + 골드 행거
   * ----------------------------------------------------------------------- */
  P._buildArmoire = function () {
    var T = this.T, scene = this.scene;
    var D = this.ROOM.D;
    var AW = 3.2, AH = 2.15, AD_ = 0.5;
    var zBack = -D / 2 + 0.1;

    // 갈색 우드(월넛) — 결 텍스처 + 클리어코트로 고급스러운 목재 옷장
    var woodTex = this._woodTex('#5E4632', '40,26,16');
    woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(2, 3);
    var lacquer = new T.MeshPhysicalMaterial({ map: woodTex, bumpMap: this._woodBump(), bumpScale: 0.012, color: 0xffffff, roughness: 0.42, metalness: 0.0, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
    var goldEdge = this.goldMat;

    var arm = new T.Group();
    arm.position.set(0, 0, zBack);
    scene.add(arm);

    // 내부 후면 패널 — 따뜻한 우드 톤(옷이 도드라지되 갈색 옷장과 통일감)
    var inWoodTex = this._woodTex('#6B5038', '50,34,22');
    inWoodTex.wrapS = inWoodTex.wrapT = T.RepeatWrapping; inWoodTex.repeat.set(3, 3);
    var back = new T.Mesh(new T.BoxGeometry(AW, AH, 0.1), new T.MeshStandardMaterial({ map: inWoodTex, color: 0xffffff, roughness: 0.7 }));
    back.position.set(0, AH / 2, 0.02); arm.add(back);
    // 측면 안쪽
    var inSide = new T.MeshStandardMaterial({ color: 0x6B5038, roughness: 0.8 });
    var inL = new T.Mesh(new T.BoxGeometry(0.06, AH, AD_ * 0.95), inSide);
    inL.position.set(-AW / 2 + 0.12, AH / 2, AD_ / 2); arm.add(inL);
    var inR = new T.Mesh(new T.BoxGeometry(0.06, AH, AD_ * 0.95), inSide);
    inR.position.set(AW / 2 - 0.12, AH / 2, AD_ / 2); arm.add(inR);

    // 좌우 측면 + 상하
    function slab(w, h, d, x, y, z) {
      var s = new T.Mesh(new T.BoxGeometry(w, h, d), lacquer);
      s.position.set(x, y, z); s.castShadow = true; s.receiveShadow = true; arm.add(s); return s;
    }
    slab(0.18, AH, AD_, -AW / 2, AH / 2, AD_ / 2);
    slab(0.18, AH, AD_, AW / 2, AH / 2, AD_ / 2);
    slab(AW + 0.36, 0.2, AD_, 0, AH, AD_ / 2);
    slab(AW + 0.36, 0.3, AD_, 0, 0.15, AD_ / 2);

    // 골드 엣지 트림
    function trim(w, h, d, x, y, z) {
      var m = new T.Mesh(new T.BoxGeometry(w, h, d), goldEdge);
      m.position.set(x, y, z); arm.add(m);
    }
    trim(0.06, AH, 0.06, -AW / 2, AH / 2, AD_);
    trim(0.06, AH, 0.06, AW / 2, AH / 2, AD_);
    trim(AW, 0.06, 0.06, 0, AH, AD_);
    trim(AW, 0.06, 0.06, 0, 0.32, AD_);

    // 행잉 로드 (골드)
    var rod = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, AW - 0.4, 16), goldEdge);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, AH * 0.78, AD_ * 0.55);
    arm.add(rod);

    // 의류 — 무드에 맞는 3D 의류 메시(원피스/자켓/스커트/팬츠) + 천 재질.
    // 옷걸이 hook 을 봉 중심에 정렬, 가로 칸막이 없이 한 단으로 자연스럽게 건다.
    var group = new T.Group();
    arm.add(group);
    this.garmentGroup = group;

    var rodY = AH * 0.78, rodZ = AD_ * 0.55;
    // 디자인 다양화: 자켓/롱코트/플레어 원피스/A라인/블라우스/시스/스커트 (밝은 베이지 트위드 위주)
    var GARMENTS = [
      { type: 'jacket', fabric: 'tweed',   color: 0xEADFC8 },
      { type: 'coat',   fabric: 'wool',    color: 0xE3D6BC },
      { type: 'dress',  fabric: 'chiffon', color: 0xF3D2D0 },
      { type: 'aline',  fabric: 'tweed',   color: 0xE6DAC2 },
      { type: 'top',    fabric: 'chiffon', color: 0xFBF8F1 },
      { type: 'dress',  fabric: 'satin',   color: 0x2A3247 },
      { type: 'skirt',  fabric: 'tweed',   color: 0xDFD0B2 }
    ];
    var nG = GARMENTS.length, spanW = AW - 0.7;
    for (var i = 0; i < nG; i++) {
      var g = GARMENTS[i];
      var fx = -spanW / 2 + spanW * (i / (nG - 1));
      var slot = new T.Group();
      slot.position.set(fx, rodY, rodZ);
      slot.rotation.y = 0.55 + (i % 3) * 0.12;   // ≈45° 각도로 걸어 옆선이 보이게
      group.add(slot);
      this._buildHangerOnRod(slot, g.type);
      slot.add(this._buildGarment(g.type, g.fabric, g.color));
    }
  };

  /* 옷걸이 — hook 이 봉(parent 원점) 위를 감싸고, 어깨/클립 바가 아래에 */
  P._buildHangerOnRod = function (parent, type) {
    var T = this.T, gold = this.goldMat;
    // 후크는 봉 위에 걸리고, 어깨 와이어는 옷 어깨선 안쪽(좁게)으로 들어가 가려진다.
    var hook = new T.Mesh(new T.TorusGeometry(0.03, 0.006, 8, 16, Math.PI), gold);
    hook.rotation.y = Math.PI / 2; parent.add(hook);
    var neck = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.085, 8), gold);
    neck.position.set(0, -0.045, 0.0); parent.add(neck);

    if (type === 'skirt' || type === 'pants') {
      var clipbar = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.3, 10), gold);
      clipbar.rotation.z = Math.PI / 2; clipbar.position.set(0, -0.09, 0.0); parent.add(clipbar);
      [-0.11, 0.11].forEach(function (cx) {
        var clip = new T.Mesh(new T.BoxGeometry(0.028, 0.04, 0.02), gold);
        clip.position.set(cx, -0.1, 0.0); parent.add(clip);
      });
    } else {
      var sw = (type === 'jacket' || type === 'coat') ? 0.155 : 0.13;
      var bar = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([
        new T.Vector3(-sw, -0.1, 0.0), new T.Vector3(0, -0.035, 0.0), new T.Vector3(sw, -0.1, 0.0)
      ]), 12, 0.005, 6, false), gold);
      parent.add(bar);
    }
  };

  /* 3D 의류 — 어깨가 봉긋한 납작한 실루엣(ExtrudeGeometry). 어깨선이 옷걸이를 덮어
   * 실제로 옷걸이에 걸린 천처럼 보이게 한다(상단 피크 = 후크 아래). */
  P._buildGarment = function (type, fabric, color) {
    var T = this.T;
    var grp = new T.Group();
    var mat = this._fabricMat(fabric, color);
    var depth = 0.13;
    var exOpt = { depth: depth, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.022, bevelSegments: 2, steps: 1, curveSegments: 3 };

    function panel(pts) {
      var s = new T.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.closePath();
      var geo = new T.ExtrudeGeometry(s, exOpt);
      geo.translate(0, 0, -depth / 2 - 0.011);     // 깊이 중앙 정렬
      var m = new T.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
      grp.add(m); return m;
    }
    function sleeves(sx, sy, len, outAng) {        // 옆선으로 살짝 나오는 소매
      [-1, 1].forEach(function (s) {
        var sh = new T.Shape();
        sh.moveTo(0, 0.03); sh.lineTo(s * 0.11, 0.0); sh.lineTo(s * 0.14, -len); sh.lineTo(s * 0.03, -len); sh.closePath();
        var geo = new T.ExtrudeGeometry(sh, { depth: depth * 0.7, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
        geo.translate(0, 0, -depth * 0.35);
        var m = new T.Mesh(geo, mat); m.position.set(s * sx, sy, 0); m.rotation.z = s * outAng; m.castShadow = true; grp.add(m);
      });
    }
    function frontLine(h, yc, op) {
      var l = new T.Mesh(new T.BoxGeometry(0.008, h, depth + 0.02),
        new T.MeshStandardMaterial({ color: 0x3a2e22, transparent: true, opacity: op }));
      l.position.set(0, yc, 0); grp.add(l);
    }

    if (type === 'dress') {
      panel([[0, 0.04], [-0.2, -0.06], [-0.15, -0.55], [-0.32, -1.5], [0.32, -1.5], [0.15, -0.55], [0.2, -0.06]]);
      sleeves(0.18, -0.06, 0.22, 0.5);
    } else if (type === 'aline') {
      panel([[0, 0.04], [-0.19, -0.06], [-0.17, -0.45], [-0.42, -1.4], [0.42, -1.4], [0.17, -0.45], [0.19, -0.06]]);
      sleeves(0.17, -0.06, 0.18, 0.55);
    } else if (type === 'top') {
      panel([[0, 0.04], [-0.21, -0.06], [-0.2, -0.35], [-0.23, -0.62], [0.23, -0.62], [0.2, -0.35], [0.21, -0.06]]);
      sleeves(0.19, -0.06, 0.2, 0.6);
    } else if (type === 'jacket') {
      panel([[0, 0.04], [-0.24, -0.05], [-0.24, -0.45], [-0.25, -0.85], [0.25, -0.85], [0.24, -0.45], [0.24, -0.05]]);
      sleeves(0.22, -0.05, 0.52, 0.3); frontLine(0.82, -0.43, 0.16);
    } else if (type === 'coat') {
      panel([[0, 0.04], [-0.24, -0.05], [-0.24, -0.7], [-0.27, -1.55], [0.27, -1.55], [0.24, -0.7], [0.24, -0.05]]);
      sleeves(0.22, -0.05, 0.7, 0.24); frontLine(1.5, -0.78, 0.14);
    } else if (type === 'skirt') {
      panel([[-0.19, 0], [-0.2, -0.08], [-0.34, -0.92], [0.34, -0.92], [0.2, -0.08], [0.19, 0]]);
    } else if (type === 'pants') {
      panel([[-0.2, 0], [0.2, 0], [0.18, -0.12], [0.05, -0.12], [0.07, -1.02], [-0.07, -1.02], [-0.05, -0.12], [-0.18, -0.12]]);
    }
    grp.scale.set(0.85, 0.85, 1.0);
    grp.position.y = -0.05;                          // 피크가 후크 살짝 아래로
    return grp;
  };

  /* 천 재질 — 트위드/쉬폰/새틴/울 */
  P._fabricMat = function (fabric, color) {
    var T = this.T, c = new T.Color(color);
    if (fabric === 'tweed') {
      var tex = this._tweedTex(color);
      tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(7, 12);
      return new T.MeshStandardMaterial({ color: 0xffffff, map: tex, bumpMap: tex, bumpScale: 0.006,
        roughness: 0.95, metalness: 0.0, side: T.DoubleSide, envMapIntensity: 0.4 });
    }
    if (fabric === 'chiffon') {
      return new T.MeshPhysicalMaterial({ color: c, roughness: 0.5, metalness: 0.0,
        transmission: 0.16, thickness: 0.1, transparent: true, opacity: 0.92, side: T.DoubleSide,
        sheen: 1.0, sheenColor: new T.Color(0xffffff), sheenRoughness: 0.4, envMapIntensity: 0.7 });
    }
    if (fabric === 'satin') {
      return new T.MeshPhysicalMaterial({ color: c, roughness: 0.34, metalness: 0.0,
        sheen: 0.9, sheenColor: c.clone().lerp(new T.Color(0xffffff), 0.5), sheenRoughness: 0.35,
        clearcoat: 0.12, clearcoatRoughness: 0.5, side: T.DoubleSide, envMapIntensity: 0.85 });
    }
    return new T.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.0, side: T.DoubleSide, envMapIntensity: 0.35 });
  };

  /* 트위드 직조 텍스처(색실 플렉) */
  P._tweedTex = function (baseHex) {
    var hex = this._hex(baseHex);
    return this._canvas(256, function (ctx, S) {
      ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
      var n = S * S * 0.12, i, x, y, r;
      for (i = 0; i < n; i++) {
        x = Math.random() * S; y = Math.random() * S; r = Math.random();
        ctx.fillStyle = r > 0.7 ? 'rgba(255,255,255,0.22)' : (r > 0.4 ? 'rgba(0,0,0,0.16)' : 'rgba(150,110,80,0.14)');
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      for (var gx = 0; gx < S; gx += 3) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, S); ctx.stroke(); }
      for (var gy = 0; gy < S; gy += 3) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(S, gy); ctx.stroke(); }
    });
  };

  /* ----------------------------------------------------------------------- *
   * 바니티 (아치 거울 + 대리석 상판 + 골드 레그 + 향수병 + 꽃)
   * ----------------------------------------------------------------------- */
  P._buildVanity = function () {
    var T = this.T, scene = this.scene;
    var bx = -2.6, bz = -2.7;   // 백-좌측, 방 안

    var marbleMat = new T.MeshPhysicalMaterial({ map: this._marbleTex(), bumpMap: this._marbleBump(), bumpScale: 0.01, color: PALETTE.marble, roughness: 0.18, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
    var gold = this.goldMat;

    // 상판(≈0.78m 높이)
    var top = new T.Mesh(new T.BoxGeometry(1.2, 0.05, 0.5), marbleMat);
    top.position.set(bx, 0.78, bz); top.castShadow = true; top.receiveShadow = true; scene.add(top);
    // 다리 ×4 (0.75)
    [[-0.52, -0.2], [0.52, -0.2], [-0.52, 0.2], [0.52, 0.2]].forEach(function (lp) {
      var leg = new T.Mesh(new T.CylinderGeometry(0.02, 0.035, 0.75, 12), gold);
      leg.position.set(bx + lp[0], 0.375, bz + lp[1]); leg.castShadow = true; scene.add(leg);
    });

    // 아치 거울 프레임(테이블 위)
    var arch = new T.Shape();
    arch.moveTo(-0.4, 0); arch.lineTo(-0.4, 0.62);
    arch.absarc(0, 0.62, 0.4, Math.PI, 0, true);
    arch.lineTo(0.4, 0); arch.lineTo(-0.4, 0);
    var frameMesh = new T.Mesh(new T.ExtrudeGeometry(arch, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }), gold);
    frameMesh.position.set(bx, 0.82, bz - 0.2); scene.add(frameMesh);
    this._addCubeMirror(bx, 0.82, bz - 0.16, 0, 0, 0, 1, this._archMirrorGeo(0.35, 0.6));

    // 향수병 4개
    var glassMat = new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1.0, thickness: 0.2, ior: 1.5, transparent: true, envMapIntensity: 1.4 });
    var tints = [PALETTE.blush, PALETTE.lavender, PALETTE.goldLight, 0xEAD7E0];
    for (var i = 0; i < 4; i++) {
      var bottleMat = glassMat.clone();
      bottleMat.color = new T.Color(tints[i]).lerp(new T.Color(0xffffff), 0.4);
      var bh = 0.08 + (i % 3) * 0.035;
      var body = new T.Mesh(new T.CylinderGeometry(0.03, 0.038, bh, 16), bottleMat);
      var ox = bx - 0.34 + i * 0.16, oz = bz + 0.08 + (i % 2) * 0.05;
      body.position.set(ox, 0.805 + bh / 2, oz); body.castShadow = true; scene.add(body);
      var cap = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.03, 12), gold);
      cap.position.set(ox, 0.805 + bh + 0.015, oz); scene.add(cap);
    }
    // 바니티 위 작은 꽃
    this._addFlowerCluster(bx + 0.42, 0.81, bz + 0.04, 0.22, PALETTE.blush);
  };

  /* 실제 반사 거울(Reflector). geo 를 주면 그 모양(아치 등)으로, 없으면 평면. */
  P._addCubeMirror = function (x, y, z, w, h, ry, scale, geo) {
    var T = this.T, AD = this.AD, scene = this.scene;
    var g = geo || new T.PlaneGeometry(w, h);
    if (this.isMobile) {
      // 모바일: 정적 env 반사(성능)
      var m = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0xeef0f2, metalness: 1.0, roughness: 0.06, envMapIntensity: 1.7 }));
      m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
    }
    var mirror = new AD.Reflector(g, { textureWidth: 512, textureHeight: 512, color: 0xbfc3c9, clipBias: 0.003 });
    mirror.position.set(x, y, z); mirror.rotation.y = ry;
    scene.add(mirror);
    return mirror;
  };

  /* 아치형 거울 면 ShapeGeometry (프레임보다 살짝 작게) */
  P._archMirrorGeo = function (rad, straight) {
    var T = this.T;
    var s = new T.Shape();
    s.moveTo(-rad, 0.06); s.lineTo(-rad, straight);
    s.absarc(0, straight, rad, Math.PI, 0, true);
    s.lineTo(rad, 0.06); s.lineTo(-rad, 0.06);
    return new T.ShapeGeometry(s, 24);
  };

  /* ----------------------------------------------------------------------- *
   * 풀렝스 플로어 미러 (우측, 아치 골드 프레임)
   * ----------------------------------------------------------------------- */
  P._buildFloorMirror = function () {
    var T = this.T, scene = this.scene;
    var mx = 3.3, mz = 1.9, ry = -0.95;    // 우-앞측(소파 옆), 방 안으로 기울여 세움(≈1.5m)
    var gold = this.goldMat;

    var arch = new T.Shape();
    arch.moveTo(-0.42, 0); arch.lineTo(-0.42, 1.1);
    arch.absarc(0, 1.1, 0.42, Math.PI, 0, true);
    arch.lineTo(0.42, 0); arch.lineTo(-0.42, 0);
    var frame = new T.Mesh(new T.ExtrudeGeometry(arch, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 3 }), gold);
    frame.position.set(mx, 0.05, mz);
    frame.rotation.y = ry;
    frame.castShadow = true;
    scene.add(frame);

    // 아치형 반사면 — 프레임 앞면 법선을 따라 살짝 앞에 부착
    var nx = Math.sin(ry) * 0.07, nz = Math.cos(ry) * 0.07;
    this._addCubeMirror(mx + nx, 0.05, mz + nz, 0, 0, ry, 1, this._archMirrorGeo(0.37, 1.05));
  };

  /* ----------------------------------------------------------------------- *
   * 핑크 벨벳 오스만 (중앙, sheen 최대)
   * ----------------------------------------------------------------------- */
  /* 헤링본 직조 패브릭 텍스처(러그/쇼파용) */
  P._herringboneFab = function (baseHex, darkRGB) {
    return this._canvas(512, function (ctx, S) {
      ctx.fillStyle = baseHex; ctx.fillRect(0, 0, S, S);
      var b = S / 14;
      ctx.lineWidth = Math.max(1.2, b * 0.16); ctx.lineCap = 'round';
      for (var row = 0; row * 0.5 * b < S + b; row++) {
        var y = row * 0.5 * b;
        for (var col = -1; col * b < S + b; col++) {
          var x = col * b + (row % 2) * (b * 0.5);
          var dir = ((col + row) % 2 === 0) ? 1 : -1;
          ctx.strokeStyle = 'rgba(' + darkRGB + ',' + (0.12 + ((col + row) % 3 === 0 ? 0.06 : 0)) + ')';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + b * 0.5, y + dir * b * 0.5); ctx.stroke();
        }
      }
    });
  };

  P._buildOttoman = function () {
    var T = this.T, scene = this.scene;
    var velvetTex = this._herringboneFab('#CFC3B0', '92,80,64');
    velvetTex.wrapS = velvetTex.wrapT = T.RepeatWrapping; velvetTex.repeat.set(3, 1);
    var velvet = new T.MeshPhysicalMaterial({
      map: velvetTex, bumpMap: this._velvetBump(), bumpScale: 0.006,
      color: 0xffffff, roughness: 0.85, metalness: 0.0,
      sheen: 1.0, sheenRoughness: 0.25,
      sheenColor: new T.Color(0xFFC9D6), clearcoat: 0.0, envMapIntensity: 0.5
    });
    var grp = new T.Group();
    grp.position.set(-0.8, 0, 1.3);
    scene.add(grp);

    var seat = new T.Mesh(new T.CylinderGeometry(0.36, 0.38, 0.3, 40), velvet);
    seat.position.y = 0.27; seat.castShadow = true; seat.receiveShadow = true; grp.add(seat);
    // 골드 다리 (작게)
    var gold = this.goldMat;
    for (var a = 0; a < 6; a++) {
      var ang = (a / 6) * Math.PI * 2;
      var leg = new T.Mesh(new T.CylinderGeometry(0.012, 0.02, 0.14, 10), gold);
      leg.position.set(Math.cos(ang) * 0.3, 0.07, Math.sin(ang) * 0.3);
      grp.add(leg);
    }
    this.ottoman = grp;
  };

  /* ----------------------------------------------------------------------- *
   * 페데스탈 테이블 + 대리석 화병 + 피오니/라넌큘러스 꽃다발
   * ----------------------------------------------------------------------- */
  P._buildPedestalFlowers = function () {
    var T = this.T, scene = this.scene;
    var px = -4.6, pz = 2.6;
    var roseTex = this._woodTex('#5A3A33', '40,24,20');
    roseTex.wrapS = roseTex.wrapT = T.RepeatWrapping; roseTex.repeat.set(2, 2);
    var rose = new T.MeshStandardMaterial({ map: roseTex, bumpMap: this._woodBump(), bumpScale: 0.012, color: 0xffffff, roughness: 0.45, metalness: 0.12, envMapIntensity: 0.9 });

    var topT = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 0.1, 32), rose);
    topT.position.set(px, 1.45, pz); topT.castShadow = true; topT.receiveShadow = true; scene.add(topT);
    var col = new T.Mesh(new T.CylinderGeometry(0.16, 0.26, 1.4, 20), rose);
    col.position.set(px, 0.72, pz); scene.add(col);
    var base = new T.Mesh(new T.CylinderGeometry(0.5, 0.55, 0.12, 24), rose);
    base.position.set(px, 0.06, pz); scene.add(base);

    var vaseMat = new T.MeshPhysicalMaterial({ map: this._marbleTex(), bumpMap: this._marbleBump(), bumpScale: 0.015, color: PALETTE.marble, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.1 });
    var vase = new T.Mesh(new T.CylinderGeometry(0.18, 0.12, 0.42, 24), vaseMat);
    vase.position.set(px, 1.7, pz); scene.add(vase);

    this._addFlowerCluster(px, 1.95, pz, 1.0, PALETTE.deeprose);
  };

  /* 꽃 클러스터 (피오니/라넌큘러스 풍 다층 구) */
  P._addFlowerCluster = function (x, y, z, scale, accent) {
    var T = this.T, scene = this.scene;
    var colors = [accent, PALETTE.blush, PALETTE.offwhite, PALETTE.dustyrose, PALETTE.lavender];
    var stemMat = new T.MeshStandardMaterial({ color: PALETTE.sage, roughness: 0.8 });
    var n = 9;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2;
      var rr = (0.12 + Math.random() * 0.16) * scale;
      var fx = x + Math.cos(ang) * rr, fz = z + Math.sin(ang) * rr;
      var fy = y + (0.18 + Math.random() * 0.18) * scale;
      var petalMat = new T.MeshPhysicalMaterial({
        color: colors[i % colors.length], roughness: 0.7,
        sheen: 0.6, sheenColor: new T.Color(0xffffff), side: T.DoubleSide
      });
      var bloom = new T.Group();
      // 다층 꽃잎(겹 구)
      for (var l = 0; l < 3; l++) {
        var petal = new T.Mesh(new T.SphereGeometry((0.1 - l * 0.025) * scale, 10, 8), petalMat);
        petal.scale.set(1, 0.7, 1);
        petal.position.y = l * 0.02 * scale;
        bloom.add(petal);
      }
      bloom.position.set(fx, fy, fz);
      scene.add(bloom);
      // 줄기
      var stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, (fy - y) + 0.1, 6), stemMat);
      stem.position.set(fx, (y + fy) / 2, fz); scene.add(stem);
      this.flowers.push({ obj: bloom, base: bloom.position.clone(), phase: Math.random() * Math.PI * 2, amp: 0.01 * scale });
    }
  };

  /* ----------------------------------------------------------------------- *
   * 모자 박스 스택 (옷장 오른편)
   * ----------------------------------------------------------------------- */
  P._buildHatBoxes = function () {
    var T = this.T, scene = this.scene;
    var hx = 3.2, hz = -4.6;
    var cols = [PALETTE.lavender, PALETTE.blush, PALETTE.sage, PALETTE.cream];
    var radii = [0.7, 0.62, 0.54, 0.46];
    var y = 0;
    for (var i = 0; i < 4; i++) {
      var hgt = 0.5 - i * 0.05;
      var linen = this._linenTex(this._hex(cols[i]));
      linen.wrapS = linen.wrapT = T.RepeatWrapping; linen.repeat.set(4, 1);
      var mat = new T.MeshStandardMaterial({ map: linen, color: 0xffffff, roughness: 0.6, metalness: 0.0 });
      var box = new T.Mesh(new T.CylinderGeometry(radii[i], radii[i], hgt, 32), mat);
      box.position.set(hx + (i % 2) * 0.05, y + hgt / 2, hz); box.castShadow = true; box.receiveShadow = true;
      scene.add(box);
      // 골드 라인 + 리본
      var line = new T.Mesh(new T.TorusGeometry(radii[i] + 0.005, 0.012, 8, 40), this.goldMat);
      line.rotation.x = Math.PI / 2; line.position.set(box.position.x, y + hgt, hz); scene.add(line);
      y += hgt;
    }
  };

  /* ----------------------------------------------------------------------- *
   * 더스티 로즈 오발 러그
   * ----------------------------------------------------------------------- */
  P._buildRug = function () {
    var T = this.T, scene = this.scene;
    var rugTex = this._herringboneFab('#D7CDBC', '96,84,68');
    rugTex.wrapS = rugTex.wrapT = T.RepeatWrapping; rugTex.repeat.set(8, 8);
    var rugBump = this._rugBump(); rugBump.repeat.set(8, 8);
    var rug = new T.Mesh(new T.CircleGeometry(1.7, 64),
      new T.MeshStandardMaterial({ map: rugTex, bumpMap: rugBump, bumpScale: 0.01, color: 0xffffff, roughness: 1.0, metalness: 0.0 }));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.0, 0.8, 1.0);
    rug.position.set(-0.7, 0.015, 1.2);
    rug.receiveShadow = true;
    scene.add(rug);
    // 골드 보더
    var border = new T.Mesh(new T.RingGeometry(1.62, 1.7, 64),
      new T.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5, metalness: 0.6 }));
    border.rotation.x = -Math.PI / 2; border.scale.set(1.0, 0.8, 1.0);
    border.position.set(-0.7, 0.02, 1.2);
    scene.add(border);

    this._buildSofa();
  };

  /* ----------------------------------------------------------------------- *
   * 2인 쇼파 (우측, 헤링본 패브릭)
   * ----------------------------------------------------------------------- */
  P._buildSofa = function () {
    var T = this.T, scene = this.scene;
    var sx = 2.7, sz = 1.0, ry = -Math.PI / 2.3;   // 우측, 방 중앙을 향함(≈1.6m 2인)
    var fabTex = this._herringboneFab('#D7CEBE', '96,84,66');
    fabTex.wrapS = fabTex.wrapT = T.RepeatWrapping; fabTex.repeat.set(3, 2);
    var fab = new T.MeshStandardMaterial({ map: fabTex, bumpMap: this._velvetBump(), bumpScale: 0.003, color: 0xffffff, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.4 });
    var gold = this.goldMat;
    var grp = new T.Group();
    grp.position.set(sx, 0, sz); grp.rotation.y = ry; scene.add(grp);

    var W2 = 1.6, Dp = 0.8, seatY = 0.42;
    // 베이스(시트 쿠션 받침)
    var base = new T.Mesh(new T.BoxGeometry(W2, 0.28, Dp), fab);
    base.position.set(0, seatY - 0.1, 0); base.castShadow = true; base.receiveShadow = true; grp.add(base);
    // 등받이
    var backrest = new T.Mesh(new T.BoxGeometry(W2, 0.55, 0.16), fab);
    backrest.position.set(0, seatY + 0.25, -Dp / 2 + 0.08); backrest.castShadow = true; grp.add(backrest);
    // 팔걸이 ×2
    [-1, 1].forEach(function (s) {
      var arm = new T.Mesh(new T.BoxGeometry(0.16, 0.36, Dp), fab);
      arm.position.set(s * (W2 / 2 - 0.08), seatY + 0.08, 0); arm.castShadow = true; grp.add(arm);
    });
    // 시트 쿠션 ×2 (2인)
    [-1, 1].forEach(function (s) {
      var cu = new T.Mesh(new T.BoxGeometry(W2 / 2 - 0.2, 0.14, Dp - 0.2), fab);
      cu.position.set(s * (W2 / 4 - 0.01), seatY + 0.07, 0.03); cu.castShadow = true; grp.add(cu);
      var bp = new T.Mesh(new T.BoxGeometry(W2 / 2 - 0.22, 0.36, 0.1), fab);
      bp.position.set(s * (W2 / 4 - 0.01), seatY + 0.26, -Dp / 2 + 0.16); grp.add(bp);
    });
    // 골드 다리 ×4
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      var leg = new T.Mesh(new T.CylinderGeometry(0.02, 0.028, 0.2, 10), gold);
      leg.position.set(p[0] * (W2 / 2 - 0.14), 0.1, p[1] * (Dp / 2 - 0.14)); grp.add(leg);
    });
  };

  /* ----------------------------------------------------------------------- *
   * 포스트프로세싱 파이프라인
   *   RenderPass → SSAO → UnrealBloom → Bokeh → SMAA → Output
   * ----------------------------------------------------------------------- */
  P._setupComposer = function () {
    var T = this.T, AD = this.AD;
    var w = Math.max(1, this.container.clientWidth || window.innerWidth);
    var h = Math.max(1, this.container.clientHeight || window.innerHeight);

    // MSAA(멀티샘플) 렌더타깃 — 얇은 골드 몰딩/패널 모서리의 계단현상 제거.
    var pr = Math.min(window.devicePixelRatio || 1, 2);
    var samples = this.isMobile ? 0 : 4;
    var msaaRT = new T.WebGLRenderTarget(
      Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)),
      { type: T.HalfFloatType, samples: samples }
    );
    var composer = new AD.EffectComposer(this.renderer, msaaRT);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);

    composer.addPass(new AD.RenderPass(this.scene, this.camera));

    if (!this.isMobile) {
      var ssao = new AD.SSAOPass(this.scene, this.camera, w, h);
      ssao.kernelRadius = 0.12; ssao.minDistance = 0.001; ssao.maxDistance = 0.05;
      composer.addPass(ssao);
      this.ssao = ssao;
    }

    var bloom = new AD.UnrealBloomPass(new T.Vector2(w, h), 0.7, 0.6, 0.9);
    bloom.threshold = 0.9; bloom.strength = this.isMobile ? 0.22 : 0.3; bloom.radius = 0.5;
    composer.addPass(bloom);
    this.bloom = bloom;

    if (!this.isMobile) {
      var bokeh = new AD.BokehPass(this.scene, this.camera, { focus: 5.0, aperture: 0.0006, maxblur: 0.004, width: w, height: h });
      composer.addPass(bokeh);
      this.bokeh = bokeh;
    }

    var smaa = new AD.SMAAPass(w, h);
    composer.addPass(smaa);

    composer.addPass(new AD.OutputPass());

    this.composer = composer;
  };

  /* ----------------------------------------------------------------------- *
   * 인터랙션 (마우스 호버 패럴랙스 / 드래그 오빗 / 터치 / 자이로)
   * ----------------------------------------------------------------------- */
  P._setupInteraction = function () {
    var self = this, el = this.container;

    // 배경이 <a href> 링크 안에 있으면 캔버스 드래그가 '링크/이미지 드래그'로 인식돼
    // pointercancel 이 발생→오빗이 끊긴다. 네이티브 드래그를 막아 오빗을 보장한다.
    var canvas = el.querySelector('canvas');
    el.style.touchAction = 'none';
    if (canvas) { canvas.style.touchAction = 'none'; canvas.setAttribute('draggable', 'false'); }
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    var dragMoved = false, downX = 0, downY = 0;
    // 드래그 후 발생하는 링크 클릭(href 이동) 차단
    var link = el.closest ? el.closest('a') : null;
    if (link) link.addEventListener('click', function (e) {
      if (dragMoved) { e.preventDefault(); e.stopPropagation(); }
    });

    // 카메라 구면 파라미터
    this.cam = { theta: 0, phi: 1.3, radius: 2.6, targetTheta: 0, targetPhi: 1.3 };
    this.pointer = { x: 0, y: 0 };          // -1..1 (호버 패럴랙스)
    this.drag = { active: false, lastX: 0, lastY: 0, theta: 0 };
    this.lastInteract = -10;
    this.gyro = { active: false, gamma: 0 };

    var DEG = Math.PI / 180;
    // 360° 무제한 회전 + 천장(위)↔바닥(아래)까지 둘러보기. 방이 4면으로 닫혀 어느 각도든 벽.
    this.LIMIT = { theta: Infinity, hover: 9 * DEG, phiMin: 1.05, phiMax: 1.62 };

    function rect() { return el.getBoundingClientRect(); }

    el.addEventListener('pointermove', function (e) {
      var r = rect();
      self.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      self.pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (self.drag.active) {
        var dx = e.clientX - self.drag.lastX;
        var dy = e.clientY - self.drag.lastY;
        self.drag.lastX = e.clientX; self.drag.lastY = e.clientY;
        self.drag.theta += dx * 0.005;
        self.drag.theta = Math.max(-self.LIMIT.theta, Math.min(self.LIMIT.theta, self.drag.theta));
        self.cam.targetPhi = Math.max(self.LIMIT.phiMin, Math.min(self.LIMIT.phiMax, self.cam.targetPhi - dy * 0.003));
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) dragMoved = true;
        self.lastInteract = self.elapsed;
      } else {
        self.lastInteract = self.elapsed;
      }
    });
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      self.drag.active = true; self.drag.lastX = e.clientX; self.drag.lastY = e.clientY;
      dragMoved = false; downX = e.clientX; downY = e.clientY;
      self.lastInteract = self.elapsed;
      if (el.setPointerCapture) try { el.setPointerCapture(e.pointerId); } catch (x) {}
    });
    function endDrag() { self.drag.active = false; self.lastInteract = self.elapsed; }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', function () { if (!self.drag.active) { self.pointer.x = 0; self.pointer.y = 0; } });

    /* 모바일: 터치 스와이프 = 가로 오빗 */
    var tStartX = 0, tTheta = 0;
    el.addEventListener('touchstart', function (e) {
      if (!e.touches.length) return;
      tStartX = e.touches[0].clientX; tTheta = self.drag.theta;
      self.lastInteract = self.elapsed;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!e.touches.length) return;
      var dx = e.touches[0].clientX - tStartX;
      self.drag.theta = Math.max(-self.LIMIT.theta, Math.min(self.LIMIT.theta, tTheta + dx * 0.006));
      self.lastInteract = self.elapsed;
    }, { passive: true });

    /* DeviceOrientation gamma → theta (기기 틸트) */
    function onOrient(e) {
      if (e.gamma == null) return;
      self.gyro.active = true;
      self.gyro.gamma = Math.max(-45, Math.min(45, e.gamma));
      self.lastInteract = self.elapsed;
    }
    this._enableGyro = function () {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ : 사용자 제스처에서 권한 요청
        DeviceOrientationEvent.requestPermission().then(function (s) {
          if (s === 'granted') window.addEventListener('deviceorientation', onOrient);
        }).catch(function () {});
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', onOrient);
      }
    };
    if (this.isMobile) {
      // iOS 권한은 제스처 필요 → 첫 터치에서 요청
      var once = function () { self._enableGyro(); el.removeEventListener('touchend', once); };
      el.addEventListener('touchend', once);
    }
  };

  /* ----------------------------------------------------------------------- *
   * 리사이즈
   * ----------------------------------------------------------------------- */
  P._resize = function () {
    var w = Math.max(1, this.container.clientWidth || window.innerWidth);
    var h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  };

  /* ----------------------------------------------------------------------- *
   * 메인 루프
   * ----------------------------------------------------------------------- */
  P._animate = function () {
    var T = this.T;
    var dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    var t = this.elapsed;
    this._frame++;

    /* ---- 인트로 시네마틱 (0 ~ 2.5s) ---- */
    if (!this.introDone) {
      var p = t / 2.4;
      if (p >= 1) { p = 1; this.introDone = true; }
      // 천장 다이브 없이, 방을 넓게 잡았다가 옷장 정면으로 부드럽게 다가가는 establishing 샷
      var settle = this._spherical(this.cam.theta, this.cam.phi, this.cam.radius);
      var start = new T.Vector3(0, 1.9, 2.7);
      var camPos = new T.Vector3().lerpVectors(start, settle, this._ease(p));
      this.camera.position.copy(camPos);
      this.camera.lookAt(this.target);

      // fog density (옅게 시작 → 거의 걷힘)
      this.scene.fog.density = 0.09 + (0.022 - 0.09) * this._ease(p);
      // 샹들리에 0 → 1.2 (은은하게)
      var inten = 1.2 * this._ease(p);
      this.chandLights[0].intensity = inten;
      this.chandLights[1].intensity = inten;
    } else {
      this._updateCamera(t, dt);
    }

    /* ---- 루프 앰비언트 ---- */
    this._updateAmbient(t);

    /* ---- CubeCamera 반사 (프레임 분산) ---- */
    if (!this.isMobile && this.cubeMirrors.length) {
      var idx = this._frame % (this.cubeMirrors.length * 3);
      if (idx < this.cubeMirrors.length) {
        var cm = this.cubeMirrors[idx];
        cm.mesh.visible = false;
        cm.cam.update(this.renderer, this.scene);
        cm.mesh.visible = true;
      }
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  P._spherical = function (theta, phi, r) {
    var T = this.T;
    return new T.Vector3(
      this.target.x + r * Math.sin(phi) * Math.sin(theta),
      this.target.y + r * Math.cos(phi),
      this.target.z + r * Math.sin(phi) * Math.cos(theta) + 0.0
    );
  };

  P._updateCamera = function (t, dt) {
    var DEG = Math.PI / 180;

    // 자동 좌우 흔들림(오실레이션) 제거 — 사용자 입력에만 반응(가만히 두면 멈춰 있음).
    var base = this.drag.theta;
    if (this.gyro.active) base += (this.gyro.gamma / 45) * 60 * DEG;
    var hover = this.pointer.x * this.LIMIT.hover;   // 마우스 호버 패럴랙스(소폭)
    this.cam.targetTheta = Math.max(-this.LIMIT.theta, Math.min(this.LIMIT.theta, base + hover));
    this.cam.targetPhi += (-this.pointer.y * 0.12) * 0.06;
    this.cam.targetPhi = Math.max(this.LIMIT.phiMin, Math.min(this.LIMIT.phiMax, this.cam.targetPhi));

    // radius 살짝 호흡
    this.cam.radius = 2.6 + Math.sin(t * 0.3) * 0.05;

    // 스무딩
    this.cam.theta += (this.cam.targetTheta - this.cam.theta) * 0.06;
    this.cam.phi += (this.cam.targetPhi - this.cam.phi) * 0.06;

    var pos = this._spherical(this.cam.theta, this.cam.phi, this.cam.radius);
    this.camera.position.lerp(pos, 0.5);
    this.camera.lookAt(this.target);
  };

  P._updateAmbient = function (t) {
    // 샹들리에 크리스탈 미세 흔들림
    for (var i = 0; i < this.crystals.length; i++) {
      var c = this.crystals[i];
      c.obj.rotation.z = Math.sin(t * 1.4 + c.phase) * c.amp * 3;
      c.obj.position.y = c.baseY + Math.sin(t * 1.0 + c.phase) * c.amp;
    }
    // 커튼 wave morph
    if (this.curtain) {
      var pos = this.curtain.geometry.attributes.position;
      var base = this.curtainBase;
      for (var v = 0; v < pos.count; v++) {
        var bx = base[v * 3], by = base[v * 3 + 1];
        var wave = Math.sin(by * 0.8 + t * 1.2) * 0.12 * (0.5 + (bx + 2.3) / 4.6)
                 + Math.sin(by * 1.7 + t * 0.7) * 0.05;
        pos.setZ(v, base[v * 3 + 2] + wave);
      }
      pos.needsUpdate = true;
      this.curtain.geometry.computeVertexNormals();
    }
    // 꽃봉오리 미세 진동
    for (var f = 0; f < this.flowers.length; f++) {
      var fl = this.flowers[f];
      fl.obj.position.x = fl.base.x + Math.sin(t * 1.3 + fl.phase) * fl.amp;
      fl.obj.rotation.z = Math.sin(t * 0.9 + fl.phase) * 0.05;
    }
    // 자연광 서서히 이동 (60초 주기 하루 빛 변화)
    if (this.sunLight) {
      var day = (t % 60) / 60;
      var ang = -0.5 + day * 1.0;
      this.sunLight.position.set(9, 6 + Math.sin(day * Math.PI) * 2, 4 + ang * 3);
      var warm = new this.T.Color(0xFFF0DC).lerp(new this.T.Color(0xFFE2C4), Math.sin(day * Math.PI));
      this.sunLight.color.copy(warm);
    }
    // 창 유리 은은한 밝기 변화
    if (this.windowGlass) {
      var b = 0.9 + Math.sin(t * 0.2) * 0.1;
      this.windowGlass.material.color.setRGB(0.92 * b, 0.96 * b, 1.0 * b);
    }
  };

  P._ease = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

})();
