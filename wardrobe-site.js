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
      import('three/addons/loaders/RGBELoader.js'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js')
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
        RGBELoader: mods[12].RGBELoader,
        GLTFLoader: mods[13].GLTFLoader,
        DRACOLoader: mods[14].DRACOLoader
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
  /* 3D 에셋(.glb) 경로 — 기본은 스크립트 옆 assets/garments/.
   * 운영(Cafe24)에서는 window.MERRYON_WARDROBE_CONFIG.assetBase 로 CDN 경로 치환 가능. */
  function asset(path) {
    var cfg = window.MERRYON_WARDROBE_CONFIG || {};
    if (typeof cfg.resolveAsset === 'function') return cfg.resolveAsset(path);
    if (cfg.assetBase) return cfg.assetBase.replace(/\/?$/, '/') + path;
    return 'assets/garments/' + path;
  }
  /* 옷장에 거는 실제 의류 컷아웃(투명 PNG) — 기본은 merryon.cafe24.com 업로드 폴더(운영 same-origin).
   * 데모/GitHub Pages 는 MERRYON_WARDROBE_CONFIG.resolveImage('cut/<file>') → 로컬 assets/products 로 치환. */
  var CUT_FOLDERS = {
    up: '%EC%97%85%EB%A1%9C%EB%93%9C%20%EC%9D%B4%EB%AF%B8%EC%A7%80',          // 업로드 이미지
    st: '%EC%8A%A4%ED%83%AD%20%EB%A9%94%EB%89%B4%EC%96%BC%20%EC%9D%B4%EB%AF%B8%EC%A7%80'  // 스탭 메뉴얼 이미지
  };
  function cut(folder, file) {
    var cfg = window.MERRYON_WARDROBE_CONFIG || {};
    if (typeof cfg.resolveImage === 'function') return cfg.resolveImage('cut/' + file);
    return 'https://merryon.cafe24.com/' + CUT_FOLDERS[folder] + '/' + file;
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
    this.ROOM = { W: 10.6, H: 2.9, D: 10.6 };

    this._buildLights();
    this._buildRoom();
    this._buildCeilingAndChandelier();
    this._buildWindowAndCurtain();
    this._buildArmoire();
    this._buildVanity();
    this._buildFloorMirror();
    // 기존 둥근 오토만(둥근 쇼파) 삭제 — 프레피 체스터필드 소파로 대체(중앙)
    // (정리) 의미 불명 요소 제거: 페데스탈/모자박스 미배치
    // this._buildPedestalFlowers();
    // this._buildHatBoxes();
    this._buildRug();
    this._buildGardenBackdrop();
    this._buildBotanic();
    this._buildGalleryWall();
    this._buildVanityChair();
    this._buildScarves();
    this._buildCurtains();

    this._setupComposer();
    this._setupInteraction();
    this._resize();
    try { window.__MERRYON_SCENE__ = this; } catch (e) {}

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
        map: marbleTex, bumpMap: marbleBmp, bumpScale: 0.012, color: 0xF3F0E8,
        roughness: 0.28, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.18,
        transparent: true, opacity: 0.82, envMapIntensity: 0.9
      }));
      overlay.rotation.x = -Math.PI / 2; overlay.position.y = 0.012; overlay.receiveShadow = true;
      scene.add(overlay);
    } else {
      var floor = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshPhysicalMaterial({
        map: marbleTex, bumpMap: marbleBmp, bumpScale: 0.012, color: 0xF3F0E8,
        roughness: 0.3, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.8
      }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    }

    /* 벽 (4면 + 천장, 아이보리 통일 — 몰딩/패널 없음) */
    var wallMat = new T.MeshStandardMaterial({ color: 0xF1EADb, roughness: 0.96, metalness: 0.0 });
    this.wallMat = wallMat;
    function wall(w, h, x, y, z, ry) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m;
    }
    wall(W, H, 0, H / 2, -D / 2, 0);                 // 뒷벽(옷장)
    wall(W, H, 0, H / 2, D / 2, Math.PI);            // 앞벽
    wall(D, H, -W / 2, H / 2, 0, Math.PI / 2);       // 좌벽
    wall(D, H, W / 2, H / 2, 0, -Math.PI / 2);       // 우벽

    /* 몰딩 전부 삭제(베이스/체어레일/크라운·웨인스코팅 패널·문 케이싱) — 벽/천장 아이보리 통일 */

    /* 문 — 앞벽 더블, 케이싱 없이 심플 패널 도어 */
    function buildDoor(cx, cz, ry, dbl) {
      var grp = new T.Group(); grp.position.set(cx, 0, cz); grp.rotation.y = ry; scene.add(grp);
      var lh = 2.1, lw = dbl ? 0.85 : 0.92;
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
    buildDoor(0, D / 2 - 0.04, Math.PI, true);            // 앞벽 중앙: 맞닿는 더블 도어(유지)
    // 좌·우벽 방문 삭제, 몰딩/패널 없음(아이보리 벽 통일)
  };

  /* 픽처프레임 벽 패널링(웨인스코팅) — 레퍼런스 톤온톤 베이지 패널.
   * 각 벽에 직사각 프레임 몰딩을 일정 리듬으로 배치(코너/문/창은 비움). */
  P._buildWallPaneling = function () {
    var T = this.T, scene = this.scene;
    var W = this.ROOM.W, H = this.ROOM.H, D = this.ROOM.D;
    var mold = new T.MeshStandardMaterial({ color: 0xEFE8D6, roughness: 0.85, metalness: 0.0 });
    var goldLine = new T.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1.0, roughness: 0.35, envMapIntensity: 1.1 });
    function frame(cx, cy, cz, w, h, ry, proud) {
      var g = new T.Group(); g.position.set(cx, cy, cz); g.rotation.y = ry; scene.add(g);
      var t = 0.035, dz = proud;
      function bar(x, y, bw, bh) {
        var m = new T.Mesh(new T.BoxGeometry(bw, bh, 0.03), mold); m.position.set(x, y, dz); g.add(m);
        var gl = new T.Mesh(new T.BoxGeometry(bw * 0.96, bh * 0.18, 0.012), goldLine); gl.position.set(x, y, dz + 0.018); g.add(gl);
      }
      bar(0, h / 2, w, t); bar(0, -h / 2, w, t);            // 상/하
      // 좌/우(세로) — gold line 은 가로형이라 세로 바엔 단색만
      [-w / 2, w / 2].forEach(function (x) {
        var m = new T.Mesh(new T.BoxGeometry(t, h + t, 0.03), mold); m.position.set(x, 0, dz); g.add(m);
      });
    }
    // 한 벽(가로 span 을 따라) 패널 리듬 — skip(중앙 비우기) 옵션
    function wallRow(len, cy, ph, fixedX, fixedZ, ry, proud, skipHalf) {
      var pw = 1.0, gap = 0.5, step = pw + gap;
      var nPanels = Math.floor((len - gap) / step);
      var total = nPanels * step - gap, x0 = -total / 2 + pw / 2;
      for (var k = 0; k < nPanels; k++) {
        var u = x0 + k * step;
        if (skipHalf && Math.abs(u) < skipHalf) continue;   // 중앙(옷장/문) 비움
        if (fixedZ !== null) frame(u, cy, fixedZ, pw, ph, ry, proud);
        else frame(fixedX, cy, u, pw, ph, ry, proud);
      }
    }
    var cy = 1.42, ph = 1.7;
    wallRow(W, cy, ph, null, -D / 2 + 0.06, 0, 0.04, 2.1);          // 뒷벽(옷장 좌우)
    wallRow(W, cy, ph, null, D / 2 - 0.06, Math.PI, 0.04, 1.1);     // 앞벽(문 좌우)
    wallRow(D, cy, ph, -W / 2 + 0.06, null, Math.PI / 2, 0.04, 0);  // 좌벽
    wallRow(D, cy, ph, W / 2 - 0.06, null, -Math.PI / 2, 0.04, 1.5); // 우벽(창 비움)
  };

  /* ----------------------------------------------------------------------- *
   * 천장 + 로제트 메달리온 + 샹들리에
   * ----------------------------------------------------------------------- */
  P._buildCeilingAndChandelier = function () {
    var T = this.T, scene = this.scene;
    var W = this.ROOM.W, H = this.ROOM.H, D = this.ROOM.D;

    var ceil = new T.Mesh(new T.PlaneGeometry(W, D),
      new T.MeshStandardMaterial({ color: 0xF1EADB, roughness: 1.0, side: T.BackSide }));
    ceil.rotation.x = -Math.PI / 2; ceil.position.y = H;
    scene.add(ceil);

    // 천장 메달리온 제거 — 대(스템)가 천장에서 바로 나와 연결

    /* 샹들리에 (천장에 바로 연결, 약간 높여 매달림) */
    var chand = new T.Group();
    chand.position.set(0, H - 0.08, -0.6);
    chand.scale.setScalar(0.42);
    scene.add(chand);
    this.chandelier = chand;

    var gold = this.goldMat;
    // 천장에서 바로 내려오는 슬림 골드 대(스템) — 천장면 H 에 직결
    var chain = new T.Mesh(new T.CylinderGeometry(0.013, 0.013, 0.08, 10), gold);
    chain.position.set(0, H - 0.04, -0.6); scene.add(chain);

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
    var cz = 0.0, winW = 2.4, R = winW / 2, sill = 0.5, winH = 1.3;   // 사각부 높이
    var rectTop = sill + winH, archY = rectTop, winY = sill + winH / 2;
    // 화이트 프레임(아치형 팔라디안 — 레퍼런스 화이트 그리드)
    var frameMat = new T.MeshStandardMaterial({ color: 0xF4EEE1, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.7 });
    var glassMat = new T.MeshPhysicalMaterial({
      color: 0xEAF5FF, roughness: 0.05, metalness: 0.0, transmission: 0.6, transparent: true,
      opacity: 0.5, emissive: 0xF3ECDD, emissiveIntensity: 0.28, side: T.DoubleSide
    });
    var xb = wx - 0.1;   // 멀리언이 놓이는 x(실내쪽)

    // --- 유리: 사각부 + 아치(반원) ---
    var glassR = new T.Mesh(new T.PlaneGeometry(winW, winH), glassMat);
    glassR.rotation.y = -Math.PI / 2; glassR.position.set(wx - 0.07, winY, cz); scene.add(glassR);
    this.windowGlass = glassR;
    var glassA = new T.Mesh(new T.CircleGeometry(R, 28, 0, Math.PI), glassMat);
    glassA.rotation.y = -Math.PI / 2; glassA.position.set(wx - 0.07, archY, cz); scene.add(glassA);

    // --- 사각 프레임(좌우 + 하단 sill) ---
    function vbar(y, h, z, t) { var m = new T.Mesh(new T.BoxGeometry(0.06, h, t || 0.05), frameMat); m.position.set(xb, y, z); scene.add(m); return m; }
    function hbar(y, w2, t) { var m = new T.Mesh(new T.BoxGeometry(0.06, t || 0.05, w2), frameMat); m.position.set(xb, y, cz); scene.add(m); return m; }
    vbar(winY, winH, cz - R, 0.08); vbar(winY, winH, cz + R, 0.08);  // 좌우 기둥
    hbar(sill, winW + 0.06, 0.08);                                   // 하단 sill
    hbar(rectTop, winW + 0.16, 0.09);                               // 스프링라인(아치 받침)
    // 사각부 격자(세로2 가로1)
    vbar(winY, winH, cz - R / 3); vbar(winY, winH, cz + R / 3);
    hbar(sill + winH / 2, winW);

    // --- 아치 프레임(반원 튜브) + 방사형 멀리언 ---
    var pts = [];
    for (var a = 0; a <= Math.PI + 0.001; a += Math.PI / 24) pts.push(new T.Vector3(xb, archY + R * Math.sin(a), cz - R * Math.cos(a)));
    var arch = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 32, 0.035, 8, false), frameMat);
    scene.add(arch);
    [0.25, 0.5, 0.75].forEach(function (f) {
      var a = Math.PI * f, ex = cz - R * Math.cos(a) * 0.96, ey = archY + R * Math.sin(a) * 0.96;
      var len = Math.sqrt((ex - cz) * (ex - cz) + (ey - archY) * (ey - archY));
      var bar = new T.Mesh(new T.BoxGeometry(0.05, len, 0.045), frameMat);
      bar.position.set(xb, (archY + ey) / 2, (cz + ex) / 2);
      bar.rotation.x = -Math.atan2(ex - cz, ey - archY); scene.add(bar);
    });

    // 천장 커튼 봉 — 두께 1/3 로 슬림하게(골드)
    var rod = new T.Mesh(new T.CylinderGeometry(0.0167, 0.0167, winW + 1.6, 12), this.goldMat);
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
    var D = this.ROOM.D, H = this.ROOM.H;
    var AW = 3.84, AH = 2.15, AD_ = 0.5;
    var zBack = -D / 2 + 0.1;

    // 빌트인 페인티드 — 벽과 통일된 아이보리(살짝 따뜻), 클리어코트로 도장 질감
    var lacquer = new T.MeshPhysicalMaterial({ color: 0xEAE1CE, roughness: 0.5, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.6 });
    var goldEdge = this.goldMat;

    var arm = new T.Group();
    arm.position.set(0, 0, zBack);
    scene.add(arm);

    // 내부 후면 패널 — 빌트인 아이보리(살짝 그림자감), 의류가 도드라지게
    var back = new T.Mesh(new T.BoxGeometry(AW, AH, 0.1), new T.MeshStandardMaterial({ color: 0xE4DAC6, roughness: 0.85 }));
    back.position.set(0, AH / 2, 0.02); arm.add(back);
    // 측면 안쪽 — 아이보리
    var inSide = new T.MeshStandardMaterial({ color: 0xDED3BE, roughness: 0.85 });
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

    // 골드 엣지 트림 — 훨씬 얇게(부담 줄임)
    function trim(w, h, d, x, y, z) {
      var m = new T.Mesh(new T.BoxGeometry(w, h, d), goldEdge);
      m.position.set(x, y, z); arm.add(m);
    }
    trim(0.02, AH, 0.02, -AW / 2, AH / 2, AD_);
    trim(0.02, AH, 0.02, AW / 2, AH / 2, AD_);
    trim(AW, 0.02, 0.02, 0, AH, AD_);
    trim(AW, 0.02, 0.02, 0, 0.32, AD_);

    // 빌트인 알코브 — 좌우 아이보리 리턴월(옷장 옆면을 가려 어느 각도서도 측면 비노출)
    var retMat = this.wallMat || new T.MeshStandardMaterial({ color: 0xF1EADB, roughness: 0.96 });
    var retZ0 = -0.1, retZ1 = AD_ + 0.12, retDepth = retZ1 - retZ0;
    [-1, 1].forEach(function (s) {
      var ret = new T.Mesh(new T.BoxGeometry(0.06, H - 0.02, retDepth), retMat);
      ret.position.set(s * (AW / 2 + 0.14), (H - 0.02) / 2, (retZ0 + retZ1) / 2);
      ret.receiveShadow = true; arm.add(ret);
    });
    // 상단 소핏(옷장 위~천장) — 알코브 헤더
    var soffit = new T.Mesh(new T.BoxGeometry(AW + 0.4, H - AH - 0.1, retDepth), retMat);
    soffit.position.set(0, (AH + 0.1 + H) / 2 - 0.05, (retZ0 + retZ1) / 2); arm.add(soffit);

    // 행잉 로드 (골드) — 두께 1/3 로 슬림하게
    var rod = new T.Mesh(new T.CylinderGeometry(0.0133, 0.0133, AW - 0.4, 16), goldEdge);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, AH * 0.78, AD_ * 0.74);
    arm.add(rod);


    // 의류 — 무드에 맞는 3D 의류 메시(원피스/자켓/스커트/팬츠) + 천 재질.
    // 옷걸이 hook 을 봉 중심에 정렬, 가로 칸막이 없이 한 단으로 자연스럽게 건다.
    var group = new T.Group();
    arm.add(group);
    this.garmentGroup = group;

    var rodY = AH * 0.78, rodZ = AD_ * 0.74;
    // 실제 merryon 의류 컷아웃(투명 PNG)을 평면으로 걸고, 카메라를 향하는 yaw-빌보드로
    // 처리 → 어느 각도에서도 뒷면/옆모서리가 안 보임(평면의 단점 제거), 방은 계속 보인다.
    this._hangCutoutGarments(group, rodY, rodZ, AW - 0.9);
  };

  /* 실제 의류 컷아웃을 봉에 걸기 — 알파 평면 + 골드 옷걸이 후크 + yaw 빌보드 등록 */
  P._hangCutoutGarments = function (group, rodY, rodZ, spanW) {
    var T = this.T, self = this, gold = this.goldMat;
    this.billboards = this.billboards || [];
    // 실제 merryon 의류 컷아웃 8벌 [폴더, 파일, 종류]
    // 사이즈 규칙: 원피스(dress)=H0, 상의(top)=H0/2, 스커트(skirt)=H0/2, 하의(pants)=H0*2/3
    // [폴더, 파일, 종류, 개별스케일]
    var CUTS = [
      ['up', '8dbdd3289854eef87e4b7b120803db73.png', 'dress', 1.0],  // 블루 셔츠 원피스
      ['st', '696d5959f7e267f4f3563e4aca916b01.png', 'top', 1.0],    // 크림 타이 블라우스
      ['up', 'daae53f5360161f404852168cfa80303.png', 'top', 1.28],   // 블랙 카라 가디건(3번째 키움)
      ['st', '176f3746d22b9417edeb41366727ba2c.png', 'skirt', 1.0],  // 민트 트위드 스커트
      ['up', 'fddfc7c28b73ccccc67cb6245b7e1f6a.png', 'dress', 0.85], // 블랙 플리츠 원피스(5번째 15%↓)
      ['st', 'b6289b824b92eb00546b472548b31bf9.png', 'skirt', 1.0],  // 핑크 러플 스커트
      ['st', '9ff66e03d2b09d390ab2c132fe050951.png', 'pants', 1.2],  // 네이비 와이드 팬츠(7번째 20%↑)
      ['st', 'fe92285cae3666ee3cca9d573ce62166.png', 'dress', 0.85]  // 블랙 오프숄더 롬퍼(마지막 15%↓)
    ];
    var H0 = 1.2;   // 원피스 기준 높이(m)
    var HBY = { dress: H0, top: H0 / 2, skirt: H0 / 2, pants: H0 * 2 / 3 };
    var loader = new T.TextureLoader(); loader.setCrossOrigin('anonymous');
    var n = CUTS.length;
    // 종류별 옷걸이: 어깨걸이(원피스·상의) / 집게걸이(스커트·팬츠)
    // 컷아웃 상단 band 의 불투명 가로폭(=어깨/카라 폭) 비율 감지. CORS 차단 시 null.
    function topOpaqueFrac(img, loF, hiF) {
      try {
        var cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        var c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0);
        var W = img.width, H = img.height, y0 = Math.floor(H * loF), y1 = Math.floor(H * hiF);
        var minX = W, maxX = -1;
        for (var y = y0; y < y1; y += 2) {
          var d = c2.getImageData(0, y, W, 1).data;
          for (var x = 0; x < W; x++) { if (d[x * 4 + 3] > 50) { if (x < minX) minX = x; if (x > maxX) maxX = x; } }
        }
        if (maxX < minX) return null;
        return (maxX - minX) / W;
      } catch (e) { return null; }
    }
    // 후크는 봉(피벗 원점, y≈0)에 걸리고, 어깨바·평면은 dz(깊이분리)만큼 앞/뒤로.
    function rodHook(parent) {
      var hook = new T.Mesh(new T.TorusGeometry(0.022, 0.0045, 8, 18, Math.PI * 1.15), gold);
      hook.rotation.z = Math.PI; hook.rotation.y = Math.PI / 2; hook.position.set(0, -0.006, 0); parent.add(hook);
    }
    function shoulderHanger(parent, sw, dz) {
      rodHook(parent);   // 봉에 걸리는 후크
      var neck = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.05, 8), gold);
      neck.position.set(0, -0.04, dz * 0.5); neck.rotation.x = Math.atan2(dz, 0.05); parent.add(neck);
      var by = -0.065;   // 어깨 와이어 높이(봉 아래)
      var bar = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([
        new T.Vector3(-sw / 2, by - 0.038, dz), new T.Vector3(0, by, dz), new T.Vector3(sw / 2, by - 0.038, dz)
      ]), 16, 0.005, 6, false), gold);
      parent.add(bar);
      [-1, 1].forEach(function (s) {
        var tip = new T.Mesh(new T.SphereGeometry(0.0075, 8, 6), gold);
        tip.position.set(s * sw / 2, by - 0.038, dz); parent.add(tip);
      });
      return by - 0.028;   // 평면 상단(어깨)
    }
    function clipHanger(parent, sw, dz) {
      rodHook(parent);
      var neck = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.06, 8), gold);
      neck.position.set(0, -0.045, dz * 0.5); neck.rotation.x = Math.atan2(dz, 0.06); parent.add(neck);
      var by = -0.075;
      var bar = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, sw, 10), gold);
      bar.rotation.z = Math.PI / 2; bar.position.set(0, by, dz); parent.add(bar);
      [-1, 1].forEach(function (s) {
        var clip = new T.Mesh(new T.BoxGeometry(0.02, 0.034, 0.016), gold);
        clip.position.set(s * sw * 0.46, by - 0.012, dz); parent.add(clip);
      });
      return by - 0.006;
    }
    CUTS.forEach(function (entry, i) {
      var fx = n > 1 ? (-spanW / 2 + spanW * (i / (n - 1))) : 0;
      var type = entry[2];
      var pivot = new T.Group();
      // 깊이 레이어를 종류로 배정: 원피스=앞, 상의=중간, 스커트/팬츠=뒤(관통 방지 + 원피스가 스커트 앞)
      // 피벗은 봉 위(후크가 봉에 걸림). 깊이분리는 평면·어깨바만 dz 로(원피스 앞/스커트 뒤 + 교차).
      var dz = ((type === 'dress') ? 0.07 : (type === 'top') ? 0.0 : -0.07) + (i % 2 ? 0.022 : -0.022);
      pivot.position.set(fx, rodY, rodZ);
      pivot.userData.tilt = (i % 2 ? 1 : -1) * (12 * Math.PI / 180);
      group.add(pivot);
      loader.load(cut(entry[0], entry[1]),
        function (tex) {
          tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
          var aspect = tex.image.width / tex.image.height;
          // 종류별 실제 높이(인체 대비) × 개별 스케일 → 폭은 비율 유지
          var h = (HBY[type] || H0 / 2) * (entry[3] || 1), w = h * aspect;
          var clipType = (type === 'skirt' || type === 'pants');
          // 옷걸이 폭 = (상의/원피스) 최상단 카라(목) 개구부 폭 / (스커트·팬츠) 허리 폭
          var band = clipType ? topOpaqueFrac(tex.image, 0.0, 0.06) : topOpaqueFrac(tex.image, 0.0, 0.04);
          var swDefault = clipType ? w * 0.6 : w * 0.28;
          var sw = (band != null ? band * w * (clipType ? 0.82 : 0.92) : swDefault);
          sw = Math.max(clipType ? 0.12 : 0.07, Math.min(0.42, sw));
          var topY = clipType ? clipHanger(pivot, sw, dz) : shoulderHanger(pivot, sw, dz);
          var mat = new T.MeshStandardMaterial({
            map: tex, transparent: true, alphaTest: 0.45, side: T.DoubleSide,
            roughness: 0.82, metalness: 0.0, color: 0xffffff
          });
          var plane = new T.Mesh(new T.PlaneGeometry(w, h), mat);
          plane.position.set(0, topY - h / 2, dz);   // 깊이분리 dz, 행거 어깨바 바로 아래
          plane.castShadow = true;
          pivot.add(plane);
          self.billboards.push(pivot);
          try { window.__MERRYON_CUTS__ = self.billboards.length; } catch (e) {}
        },
        undefined,
        function () { console.warn('[merryon] 컷아웃 로드 실패', entry[1]); }
      );
    });
  };

  /* GLB 의류 로딩 — 그룹별 GLB 를 불러와 오브젝트를 x 좌표로 옷별 클러스터링하고,
   * 내장된 넓은 봉(rod)은 제외, 각 옷을 후크가 원점에 오도록 정규화한 뒤 봉에 균등 분배. */
  P._loadGarmentGLBs = function (group, rodY, rodZ, spanW) {
    var T = this.T, AD = this.AD, self = this;
    if (!AD.GLTFLoader) return;
    var loader = new AD.GLTFLoader();
    if (AD.DRACOLoader) {
      var draco = new AD.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/');
      loader.setDRACOLoader(draco);
    }
    // 그룹별 GLB 와 옷 개수(Blender 배치와 동일: x = k*0.6 - 0.3*(n-1)).
    // 전역 인덱스를 미리 배정해, 파일이 도착하는 즉시 봉의 제 위치에 건다(다른 파일을 기다리지 않음).
    var files = [['w2_0.glb', 4], ['w2_1.glb', 4], ['w2_2.glb', 4]];
    var total = 0, start = []; files.forEach(function (e) { start.push(total); total += e[1]; });

    // 각 메시를 가장 가까운 옷 슬롯에 배정(소매가 이웃 칸까지 퍼져도 중심 기준으로 정확히 분리).
    function assignToSlots(scene, n) {
      scene.updateMatrixWorld(true);
      var slots = [];
      for (var k = 0; k < n; k++) slots.push({ x: k * 0.6 - 0.3 * (n - 1), items: [] });
      scene.traverse(function (o) {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        var wb = new T.Box3().setFromObject(o), sz = new T.Vector3(); wb.getSize(sz);
        if (sz.x > 1.6) return;                 // 봉(rod): 매우 긴 실린더 → 제외
        var cx = (wb.min.x + wb.max.x) / 2, bi = 0, bd = Infinity;
        for (var i = 0; i < slots.length; i++) {
          var d = Math.abs(cx - slots[i].x); if (d < bd) { bd = d; bi = i; }
        }
        slots[bi].items.push({ mesh: o });
      });
      return slots;
    }

    function makeGarment(cluster) {
      var g = new T.Group();
      var box = new T.Box3();
      cluster.items.forEach(function (it) { g.attach(it.mesh); box.expandByObject(it.mesh); });
      // 후크 상단이 원점에 오도록, x 중심 정렬
      var cx = (box.min.x + box.max.x) / 2, topY = box.max.y;
      g.children.forEach(function (m) { m.position.x -= cx; m.position.y -= topY; });
      return g;
    }

    var placed = 0;
    files.forEach(function (entry, fi) {
      var fn = entry[0], n = entry[1], base = start[fi];
      loader.load(asset(fn),
        function (gltf) {
          assignToSlots(gltf.scene, n).forEach(function (cl, k) {
            if (!cl.items.length) return;
            self._placeGarment(group, makeGarment(cl), base + k, total, rodY, rodZ, spanW);
            placed++; self.garmentCount = placed;
            try { window.__MERRYON_GARMENTS__ = placed; } catch (e) {}
          });
        },
        undefined,
        function (err) { console.warn('[merryon] GLB 로드 실패', fn, err && (err.message || err)); }
      );
    });
  };

  /* 한 벌을 전역 인덱스(idx/total)에 맞춰 봉에 건다. */
  P._placeGarment = function (group, g, idx, total, rodY, rodZ, spanW) {
    var fx = total > 1 ? (-spanW / 2 + spanW * (idx / (total - 1))) : 0;
    g.position.set(fx, rodY + 0.02, rodZ);
    g.rotation.y = 0.5 + (idx % 3) * 0.13;   // ≈45° 각도로 옆선이 보이게
    g.scale.setScalar(0.92);
    group.add(g);
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
    var bx = -3.7, bz = -3.0;   // 좌측(벽과 간격)

    var gold = this.goldMat;
    // 화이트 프렌치 프로방살 — 카브드 우드 톤(레퍼런스 img2)
    var white = new T.MeshStandardMaterial({ color: 0xF3EFE5, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.7 });
    var whiteP = new T.MeshStandardMaterial({ color: 0xEFE9DB, roughness: 0.6, metalness: 0.0 });

    // 상판(≈0.78m) — 화이트, 살짝 오버행
    var top = new T.Mesh(new T.BoxGeometry(1.3, 0.05, 0.55), white);
    top.position.set(bx, 0.78, bz); top.castShadow = true; top.receiveShadow = true; scene.add(top);
    // 몸통(서랍 캐비닛)
    var body = new T.Mesh(new T.BoxGeometry(1.16, 0.24, 0.46), white);
    body.position.set(bx, 0.64, bz); body.castShadow = true; scene.add(body);
    // 서랍 3 + 골드 손잡이
    for (var dI = -1; dI <= 1; dI++) {
      var df = new T.Mesh(new T.BoxGeometry(0.34, 0.18, 0.02), whiteP);
      df.position.set(bx + dI * 0.38, 0.64, bz + 0.24); scene.add(df);
      var knob = new T.Mesh(new T.SphereGeometry(0.018, 12, 10), gold);
      knob.position.set(bx + dI * 0.38, 0.64, bz + 0.27); scene.add(knob);
    }
    // 카브리올(살짝 휜) 화이트 다리 ×4 — 위 굵고 아래 가늘게 + 바깥 스플레이
    [[-0.55, -0.18, -1], [0.55, -0.18, 1], [-0.55, 0.18, -1], [0.55, 0.18, 1]].forEach(function (lp) {
      var leg = new T.Mesh(new T.CylinderGeometry(0.035, 0.018, 0.52, 12), white);
      leg.position.set(bx + lp[0], 0.26, bz + lp[1]); leg.rotation.z = lp[2] * 0.07; leg.castShadow = true; scene.add(leg);
      var foot = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), gold);
      foot.position.set(bx + lp[0] + lp[2] * 0.035, 0.01, bz + lp[1]); scene.add(foot);
    });

    // 골드 오벌 거울(테이블 위 스탠딩) — 타원 링 + 반사면
    var ring = new T.Mesh(new T.TorusGeometry(0.3, 0.022, 12, 40), gold);
    ring.scale.set(1.0, 1.35, 1.0); ring.position.set(bx, 1.22, bz - 0.18); scene.add(ring);
    var ovGeo = new T.CircleGeometry(0.28, 40); ovGeo.scale(1.0, 1.32, 1.0);
    this._addCubeMirror(bx, 1.22, bz - 0.16, 0, 0, 0, 1, ovGeo);
    // 오벌 받침대
    var mstand = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.42, 8), gold);
    mstand.position.set(bx, 0.92, bz - 0.18); scene.add(mstand);

    // 향수 — 실제 브랜드 실루엣(샤넬 No.5 사각 / 디올 J'adore 앰포라 / 라운드 / 큐브)
    this._buildPerfumes(bx, bz, gold);
    // 바니티 위 작은 꽃
    this._addFlowerCluster(bx + 0.46, 0.81, bz + 0.02, 0.22, PALETTE.blush);
  };

  /* 실제 향수 브랜드 실루엣 4종 */
  P._buildPerfumes = function (bx, bz, gold) {
    var T = this.T, scene = this.scene, y0 = 0.805;
    function glass(tint, rough) {
      return new T.MeshPhysicalMaterial({ color: tint, metalness: 0, roughness: rough || 0.06, transmission: 0.92, thickness: 0.25, ior: 1.5, transparent: true, envMapIntensity: 1.4 });
    }
    var goldCap = new T.MeshStandardMaterial({ color: 0xCBA24A, metalness: 1.0, roughness: 0.3 });
    var blackCap = new T.MeshStandardMaterial({ color: 0x1A1A1C, roughness: 0.35, metalness: 0.2 });
    // 1) 샤넬 No.5 — 직사각 플라콘 + 블랙 캡
    (function () {
      var ox = bx - 0.4, oz = bz + 0.02;
      var body = new T.Mesh(new T.BoxGeometry(0.058, 0.092, 0.03), glass(0xF3E7C9, 0.05)); body.position.set(ox, y0 + 0.046, oz); body.castShadow = true; scene.add(body);
      var cap = new T.Mesh(new T.BoxGeometry(0.034, 0.026, 0.022), blackCap); cap.position.set(ox, y0 + 0.092 + 0.012, oz); scene.add(cap);
    })();
    // 2) 디올 J'adore — 앰포라(물방울) + 골드 칼라
    (function () {
      var ox = bx - 0.22, oz = bz + 0.06;
      var body = new T.Mesh(new T.SphereGeometry(0.042, 18, 16), glass(0xE7C766, 0.05));
      body.scale.set(0.82, 1.5, 0.82); body.position.set(ox, y0 + 0.07, oz); body.castShadow = true; scene.add(body);
      var collar = new T.Mesh(new T.TorusGeometry(0.012, 0.006, 8, 16), goldCap); collar.rotation.x = Math.PI / 2; collar.position.set(ox, y0 + 0.135, oz); scene.add(collar);
      var neck = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.03, 10), goldCap); neck.position.set(ox, y0 + 0.15, oz); scene.add(neck);
    })();
    // 3) 라운드 플라콘(구르베) + 골드 캡
    (function () {
      var ox = bx - 0.05, oz = bz + 0.02;
      var body = new T.Mesh(new T.SphereGeometry(0.04, 18, 16), glass(0xF0CBD6, 0.06));
      body.scale.set(1, 0.92, 1); body.position.set(ox, y0 + 0.042, oz); body.castShadow = true; scene.add(body);
      var cap = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.022, 14), goldCap); cap.position.set(ox, y0 + 0.082, oz); scene.add(cap);
    })();
    // 4) 큐브 플라콘 + 골드 스퀘어 캡
    (function () {
      var ox = bx + 0.12, oz = bz + 0.05;
      var body = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.05), glass(0xD8E3E0, 0.06)); body.position.set(ox, y0 + 0.025, oz); body.castShadow = true; scene.add(body);
      var cap = new T.Mesh(new T.BoxGeometry(0.026, 0.02, 0.026), goldCap); cap.position.set(ox, y0 + 0.06, oz); scene.add(cap);
    })();
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

  /* 창밖 정원(보타닉) — 우측 아치창 너머로 보이는 그린/로즈 가든 백드롭 */
  P._buildGardenBackdrop = function () {
    var T = this.T, scene = this.scene;
    var W = this.ROOM.W;
    var wx = W / 2 - 0.05, cz = 0.0;
    // 하늘→그린 그라데이션 캔버스
    var c = document.createElement('canvas'); c.width = 64; c.height = 256;
    var g = c.getContext('2d'); var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#F3EEDF'); gr.addColorStop(0.4, '#E7E6CC'); gr.addColorStop(0.7, '#BFD0A6'); gr.addColorStop(1, '#8FB081');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    var back = new T.Mesh(new T.PlaneGeometry(9, 5), new T.MeshBasicMaterial({ map: tex }));
    back.rotation.y = -Math.PI / 2; back.position.set(wx + 3.0, 2.0, cz); scene.add(back);
    // 정원 식재(그린 덤불 + 로즈) — 창과 백드롭 사이
    var greens = [0x7E9B68, 0x8Cab74, 0x6F8C5C, 0xA3B98A];
    for (var i = 0; i < 14; i++) {
      var bush = new T.Mesh(new T.IcosahedronGeometry(0.35 + Math.random() * 0.5, 1),
        new T.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 1.0, flatShading: true }));
      bush.position.set(wx + 0.8 + Math.random() * 1.8, 0.4 + Math.random() * 2.4, cz - 2.6 + Math.random() * 5.2);
      bush.scale.y = 0.8 + Math.random() * 0.5; scene.add(bush);
    }
    // 흰/핑크 장미 군집(창가 보타닉)
    var rose = [0xF3D9DE, 0xF7EFE6, 0xEBC3CE];
    for (var r = 0; r < 18; r++) {
      var fl = new T.Mesh(new T.SphereGeometry(0.06 + Math.random() * 0.05, 8, 6),
        new T.MeshStandardMaterial({ color: rose[r % rose.length], roughness: 0.7 }));
      fl.position.set(wx + 0.5 + Math.random() * 1.0, 0.3 + Math.random() * 2.3, cz - 1.5 + Math.random() * 3.0); scene.add(fl);
    }
  };

  /* 보타닉 — 화분(트리/토피어리) + 책장+책 + 플로어 화병 */
  P._buildBotanic = function () {
    var T = this.T, scene = this.scene, self = this;
    var W = this.ROOM.W, D = this.ROOM.D;
    var greens = [0x7E9B68, 0x88A472, 0x6F8C5C, 0x9DB87E];
    // 잎 텍스처(투명 PNG 대용 캔버스) — 실사 부피감용
    function leafTex() {
      if (self._leafTexC) return self._leafTexC;
      var c = document.createElement('canvas'); c.width = 64; c.height = 64; var g = c.getContext('2d');
      var grd = g.createLinearGradient(0, 4, 0, 60); grd.addColorStop(0, '#A6C48C'); grd.addColorStop(0.6, '#7B9B63'); grd.addColorStop(1, '#52703F');
      g.fillStyle = grd; g.beginPath(); g.moveTo(32, 3); g.quadraticCurveTo(61, 30, 32, 61); g.quadraticCurveTo(3, 30, 32, 3); g.fill();
      g.strokeStyle = 'rgba(40,60,35,0.45)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(32, 8); g.lineTo(32, 56); g.stroke();
      for (var k = 0; k < 5; k++) { var yy = 14 + k * 8; g.beginPath(); g.moveTo(32, yy); g.lineTo(32 + (k % 2 ? 9 : -9), yy + 6); g.stroke(); }
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; self._leafTexC = t; return t;
    }
    function foliage(grp, cy, R, count, tint, leafLen) {
      var mat = new T.MeshStandardMaterial({ map: leafTex(), transparent: true, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.85, color: tint });
      var lg = new T.PlaneGeometry(leafLen * 0.62, leafLen);
      for (var i = 0; i < count; i++) {
        var leaf = new T.Mesh(lg, mat);
        var u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), rr = R * (0.55 + 0.45 * Math.random());
        leaf.position.set(rr * Math.sin(v) * Math.cos(u), cy + rr * Math.cos(v) * 0.85, rr * Math.sin(v) * Math.sin(u));
        leaf.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        leaf.castShadow = true; grp.add(leaf);
      }
    }
    function potPlant(x, z, s, kind) {
      var grp = new T.Group(); grp.position.set(x, 0, z); scene.add(grp);
      var pot = new T.Mesh(new T.CylinderGeometry(0.2 * s, 0.15 * s, 0.34 * s, 24),
        new T.MeshStandardMaterial({ color: 0xEDE6D6, roughness: 0.8 }));
      pot.position.y = 0.17 * s; pot.castShadow = true; grp.add(pot);
      var rim = new T.Mesh(new T.TorusGeometry(0.2 * s, 0.02 * s, 8, 24), new T.MeshStandardMaterial({ color: 0xE3DAC6, roughness: 0.8 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.34 * s; grp.add(rim);
      var trunk = new T.Mesh(new T.CylinderGeometry(0.022 * s, 0.03 * s, 0.5 * s, 8), new T.MeshStandardMaterial({ color: 0x7A6248, roughness: 0.9 }));
      trunk.position.y = 0.5 * s; grp.add(trunk);
      var tint = greens[(x | 0) % greens.length];
      var dense = self.isMobile ? 0.5 : 1.0;
      if (kind === 'topiary') {
        foliage(grp, 0.95 * s, 0.27 * s, Math.round(42 * dense), tint, 0.17 * s);
        foliage(grp, 1.3 * s, 0.21 * s, Math.round(30 * dense), tint, 0.16 * s);
      } else { // 풍성한 관엽
        foliage(grp, 1.0 * s, 0.34 * s, Math.round(52 * dense), tint, 0.21 * s);
      }
      return grp;
    }
    // 화분 배치(넓은 방 코너/창가/소파 옆)
    potPlant(-W / 2 + 0.9, -D / 2 + 0.8, 1.15, 'tree');
    potPlant(W / 2 - 1.0, D / 2 - 1.0, 1.0, 'topiary');
    potPlant(-2.0, 1.9, 0.85, 'topiary');
    potPlant(W / 2 - 1.2, -1.6, 1.1, 'tree');

    // 책장 + 책 (백벽 우측, 옷장 옆)
    (function () {
      var bx = W / 2 - 1.4, bz = -D / 2 + 0.28, bw = 1.4, bh = 1.9, dep = 0.32;
      var woodM = new T.MeshStandardMaterial({ color: 0xEDE7D8, roughness: 0.7 });
      var frameG = new T.Group(); frameG.position.set(bx, 0, bz); scene.add(frameG);
      // 좌우 측판 + 상하 + 후면
      [[-bw / 2, 0], [bw / 2, 0]].forEach(function (p) {
        var side = new T.Mesh(new T.BoxGeometry(0.05, bh, dep), woodM); side.position.set(p[0], bh / 2, 0); frameG.add(side);
      });
      var nShelf = 4;
      for (var s = 0; s <= nShelf; s++) {
        var sh = new T.Mesh(new T.BoxGeometry(bw, 0.04, dep), woodM); sh.position.set(0, s * (bh / nShelf), 0); frameG.add(sh);
      }
      var back = new T.Mesh(new T.BoxGeometry(bw, bh, 0.03), woodM); back.position.set(0, bh / 2, -dep / 2); frameG.add(back);
      // 책 채우기
      var bookCols = [0x8C4A3B, 0x3B5A6B, 0xC9B07A, 0x6B7A52, 0x9A6A8C, 0x44423F, 0xC98A6B, 0xE3D7C0];
      for (var row = 0; row < nShelf; row++) {
        var x = -bw / 2 + 0.09, yb = row * (bh / nShelf) + 0.02;
        while (x < bw / 2 - 0.09) {
          var thick = 0.022 + Math.random() * 0.03, hh = 0.22 + Math.random() * 0.12;
          var lean = Math.random() < 0.12;
          var book = new T.Mesh(new T.BoxGeometry(thick, hh, dep - 0.08 - Math.random() * 0.05),
            new T.MeshStandardMaterial({ color: bookCols[(Math.random() * bookCols.length) | 0], roughness: 0.85 }));
          book.position.set(x + thick / 2, yb + hh / 2, 0.02); if (lean) book.rotation.z = 0.12;
          frameG.add(book); x += thick + 0.004 + (lean ? 0.02 : 0);
        }
      }
    })();

    // 책장 위 골드 테이블 램프(따뜻한 빛)
    (function () {
      var lx = W / 2 - 1.4, lz = -D / 2 + 0.28, ly = 1.9;
      var base = new T.Mesh(new T.BoxGeometry(0.13, 0.16, 0.13), new T.MeshStandardMaterial({ color: 0xCBA24A, metalness: 1.0, roughness: 0.3 }));
      base.position.set(lx + 0.4, ly + 0.08, lz); scene.add(base);
      var shade = new T.Mesh(new T.CylinderGeometry(0.15, 0.18, 0.18, 4),
        new T.MeshStandardMaterial({ color: 0xF6F0E2, roughness: 0.9, emissive: 0xF0E2C2, emissiveIntensity: 0.5, side: T.DoubleSide }));
      shade.rotation.y = Math.PI / 4; shade.position.set(lx + 0.4, ly + 0.28, lz); scene.add(shade);
      var bulb = new T.PointLight(0xFFE9C2, 6, 4, 2); bulb.position.set(lx + 0.4, ly + 0.28, lz); scene.add(bulb);
    })();

    // 플로어 화병 + 팜파스/가지 (코너)
    (function () {
      var vx = -W / 2 + 1.7, vz = D / 2 - 1.2;
      var vase = new T.Mesh(new T.CylinderGeometry(0.13, 0.09, 0.5, 20), new T.MeshStandardMaterial({ color: 0xEFE9DB, roughness: 0.5, metalness: 0.05 }));
      vase.position.set(vx, 0.25, vz); vase.castShadow = true; scene.add(vase);
      var pampMat = new T.MeshStandardMaterial({ color: 0xE3D3B0, roughness: 1.0 });
      for (var b = 0; b < 9; b++) {
        var ang = (b / 9) * Math.PI * 2, lean = 0.18 + Math.random() * 0.12;
        var stem = new T.Mesh(new T.CylinderGeometry(0.006, 0.01, 0.7, 5), pampMat);
        stem.position.set(vx + Math.cos(ang) * 0.18, 0.5 + 0.34, vz + Math.sin(ang) * 0.18);
        stem.rotation.set(Math.sin(ang) * lean, 0, -Math.cos(ang) * lean); scene.add(stem);
      }
    })();
    // 화병 꽃다발(콘솔/소파 옆 바닥 액센트)
    this._addFlowerCluster(-W / 2 + 1.7, 0.5, D / 2 - 1.2, 0.5, PALETTE.dustyrose);
  };

  /* 빌트인 커튼 — Blender 천시뮬 드레이프 GLB를 빈 벽에 천장부터 내려오게.
   * 옷장 우측 벽 커튼에는 merryon 로고가 주름을 따라 들어간 logo 버전 사용. */
  P._buildCurtains = function () {
    var T = this.T, AD = this.AD, scene = this.scene;
    if (!AD.GLTFLoader) return;
    var W = this.ROOM.W, H = this.ROOM.H, D = this.ROOM.D;
    var AW = 3.84;
    var loader = new AD.GLTFLoader();
    // [파일, x, z, ry(실내향), 가로스케일]
    var panels = [
      ['curtain_logo.glb', (AW / 2 + W / 2) / 2 + 0.3, -D / 2 + 0.12, 0, 1.55],   // 옷장 우측(백벽) — 로고
      ['curtain_plain.glb', -(AW / 2 + W / 2) / 2 - 0.3, -D / 2 + 0.12, 0, 1.55],  // 옷장 좌측(백벽)
      ['curtain_plain.glb', -W / 2 + 0.12, 2.0, Math.PI / 2, 1.4],                 // 좌벽 뒤쪽
      ['curtain_plain.glb', W / 2 - 0.12, -1.0, -Math.PI / 2, 1.4]                 // 우벽(창 옆)
    ];
    panels.forEach(function (p) {
      loader.load(asset(p[0]), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material.side = T.DoubleSide; } });
        s.position.set(p[1], 0, p[2]); s.rotation.y = p[3];
        s.scale.set(p[4], H / 2.75 + 0.02, 1.0);   // 천장까지
        scene.add(s);
      }, undefined, function () { });
    });
  };

  /* 바닥 스카프 — Blender 천시뮬로 헝클어진 스카프 GLB(러그 위 자연스럽게) */
  P._buildScarves = function () {
    var T = this.T, AD = this.AD, scene = this.scene;
    if (!AD.GLTFLoader) return;
    new AD.GLTFLoader().load(asset('scarves.glb'), function (gltf) {
      var s = gltf.scene;
      s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      s.position.set(-0.3, 0.015, 1.45); s.scale.setScalar(1.0);
      scene.add(s);
    }, undefined, function () { });
  };

  /* 소파 위 자연스러운 소품 — 퀼팅 핸드백 + 아이폰 */
  P._buildSofaProps = function () {
    var T = this.T, AD = this.AD, scene = this.scene, gold = this.goldMat;
    // 소파 중앙(0,0,0.35), 좌석 윗면 ≈ 0.46
    var seatY = 0.5;
    // 퀼팅 플랩백 — Blender GLB(다이아 퀼팅+골드 체인)
    var bagG = new T.Group(); bagG.position.set(-0.4, seatY, 0.42); bagG.rotation.y = 0.5; scene.add(bagG);
    if (AD.GLTFLoader) {
      new AD.GLTFLoader().load(asset('bag.glb'), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        s.position.y = 0.1; bagG.add(s);   // 바닥(좌석)에 앉게
      }, undefined, function () { });
    }
    // 아이폰(다크) — 화면 살짝 비침
    var phone = new T.Mesh(new T.BoxGeometry(0.075, 0.012, 0.155),
      new T.MeshStandardMaterial({ color: 0x101013, roughness: 0.3, metalness: 0.4 }));
    phone.position.set(0.4, seatY + 0.01, 0.3); phone.rotation.y = -0.6; phone.castShadow = true; scene.add(phone);
    var screen = new T.Mesh(new T.PlaneGeometry(0.066, 0.142),
      new T.MeshStandardMaterial({ color: 0x2A3550, emissive: 0x223047, emissiveIntensity: 0.4, roughness: 0.2 }));
    screen.rotation.set(-Math.PI / 2, 0, -0.6); screen.position.set(0.4, seatY + 0.017, 0.3); scene.add(screen);
  };

  /* 빈티지 보타닉 아트 패턴(캔버스) — 액자 안 그림 */
  P._artTex = function (seed) {
    var T = this.T;
    var c = document.createElement('canvas'); c.width = 128; c.height = 160; var g = c.getContext('2d');
    var bgs = ['#EFE6D2', '#E9DCE0', '#E4E7DC', '#F0E7D8']; g.fillStyle = bgs[seed % bgs.length]; g.fillRect(0, 0, 128, 160);
    // 골드 보더 라인
    g.strokeStyle = 'rgba(150,120,70,0.5)'; g.lineWidth = 3; g.strokeRect(8, 8, 112, 144);
    // 보타닉 가지/꽃
    var stem = '#7E8C5E', fl = ['#D6A7B4', '#E7CBA0', '#C9B79A', '#B98C9E'][seed % 4];
    g.strokeStyle = stem; g.lineWidth = 2;
    for (var b = 0; b < 3; b++) {
      var bx = 40 + b * 26, by = 140;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + (b % 2 ? 16 : -16), 90, bx + (b % 2 ? -6 : 6), 40); g.stroke();
      for (var l = 0; l < 5; l++) {
        var ly = by - 16 - l * 20, lx = bx + (l % 2 ? 10 : -10);
        g.fillStyle = stem; g.beginPath(); g.ellipse(lx, ly, 7, 3.4, l % 2 ? 0.6 : -0.6, 0, 6.28); g.fill();
      }
      g.fillStyle = fl; g.beginPath(); g.arc(bx + (b % 2 ? -6 : 6), 40, 9, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(bx + (b % 2 ? -6 : 6), 40, 4, 0, 6.28); g.fill();
    }
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  };

  /* 갤러리 월 — 좌측 벽에 골드 액자(오벌/사각) 클러스터 + 보타닉 아트 */
  P._buildGalleryWall = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat, self = this;
    var W = this.ROOM.W;
    var wx = -W / 2 + 0.06;   // 좌측 벽
    // [벽z(가로), y, w, h, oval]
    var frames = [
      [0.0, 1.85, 0.5, 0.62, false],
      [-0.66, 1.62, 0.42, 0.5, true],
      [0.64, 1.7, 0.36, 0.46, true],
      [-0.5, 1.12, 0.34, 0.42, false],
      [0.52, 1.16, 0.46, 0.34, false],
      [0.02, 1.14, 0.28, 0.36, true]
    ];
    frames.forEach(function (f, i) {
      var g = new T.Group(); g.position.set(wx, f[1], f[0]); g.rotation.y = Math.PI / 2; scene.add(g);
      var w = f[2], h = f[3], oval = f[4];
      var artMat = new T.MeshStandardMaterial({ map: self._artTex(i), roughness: 0.9 });
      var canvas = new T.Mesh(oval ? (function () { var c = new T.CircleGeometry(w / 2, 32); c.scale(1, h / w, 1); return c; })() : new T.PlaneGeometry(w, h), artMat);
      canvas.position.z = 0.012; g.add(canvas);
      if (oval) {
        var ring = new T.Mesh(new T.TorusGeometry(w / 2, 0.022, 10, 40), gold); ring.scale.set(1, h / w, 1); ring.position.z = 0.02; g.add(ring);
        var crest = new T.Mesh(new T.SphereGeometry(0.03, 10, 8), gold); crest.position.set(0, h / 2 + 0.02, 0.02); g.add(crest);
      } else {
        var t = 0.028;
        [[0, h / 2, w + t, t], [0, -h / 2, w + t, t], [-w / 2, 0, t, h], [w / 2, 0, t, h]].forEach(function (b) {
          var bar = new T.Mesh(new T.BoxGeometry(b[2], b[3], 0.03), gold); bar.position.set(b[0], b[1], 0.02); g.add(bar);
        });
      }
    });
  };

  /* 프렌치 화장대 의자 — 화장대 앞 대각 배치(카브리올 다리 + 카브드 등 + 그레이 시트) */
  P._buildVanityChair = function () {
    var T = this.T, AD = this.AD, scene = this.scene;
    // 화장대 앞 대각 — Blender 프렌치 의자(카브리올 다리+카브드 오벌 등받이) GLB
    var g = new T.Group(); g.position.set(-3.05, 0, -2.35); g.rotation.y = Math.PI * 0.72; scene.add(g);
    if (AD.GLTFLoader) {
      new AD.GLTFLoader().load(asset('chair.glb'), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        g.add(s);
      }, undefined, function () { });
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
    var T = this.T, AD = this.AD, scene = this.scene;
    // 방 중앙에 배치, 정면(좌석)이 옷장(-z)을 바라보게 → 카메라(+z)는 소파 뒷면을 본다.
    var grp = new T.Group();
    grp.position.set(0, 0, 0.35); grp.rotation.y = 0; scene.add(grp);
    this.sofaGroup = grp;
    this._buildSofaProps();
    if (!AD.GLTFLoader) return;
    var loader = new AD.GLTFLoader();
    loader.load(asset('sofa.glb'),
      function (gltf) {
        var s = gltf.scene;
        s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        // 모델 정면(Blender +y)이 glTF -z → 그대로 옷장을 바라봄(회전 불필요)
        grp.add(s);
        try { window.__MERRYON_SOFA__ = true; } catch (e) {}
      },
      undefined,
      function (e) { console.warn('[merryon] 소파 GLB 로드 실패', e && (e.message || e)); }
    );
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
    this.cam = { theta: 0, phi: 1.45, radius: 3.4, targetTheta: 0, targetPhi: 1.45 };
    this.pointer = { x: 0, y: 0 };          // -1..1 (호버 패럴랙스)
    this.drag = { active: false, lastX: 0, lastY: 0, theta: 0 };
    this.lastInteract = -10;
    this.gyro = { active: false, gamma: 0 };

    var DEG = Math.PI / 180;
    // 360° 무제한 회전 + 천장(위)↔바닥(아래)까지 둘러보기. 방이 4면으로 닫혀 어느 각도든 벽.
    this.LIMIT = { theta: Infinity, hover: 6 * DEG, phiMin: 1.28, phiMax: 1.62 };   // 빌트인으로 옆면 가려져 360° 허용

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
      var start = new T.Vector3(0, 1.75, 3.3);
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

    /* ---- 의류 컷아웃 빌보드: 항상 카메라를 향해(yaw) → 뒷면/옆모서리 노출 방지 ---- */
    if (this.billboards && this.billboards.length) {
      var cp = this.camera.position;
      var wp = this._bbV || (this._bbV = new T.Vector3());
      for (var bi = 0; bi < this.billboards.length; bi++) {
        var bb = this.billboards[bi]; bb.getWorldPosition(wp);
        // 카메라를 향하되 ±57°로 제한 → 측면 각도서도 옷이 옷장 안으로 회전·관통하지 않음
        var yaw = Math.atan2(cp.x - wp.x, cp.z - wp.z);
        yaw = Math.max(-1.0, Math.min(1.0, yaw));
        bb.rotation.y = yaw + (bb.userData.tilt || 0);
      }
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
    this.cam.radius = 3.4 + Math.sin(t * 0.3) * 0.05;

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
