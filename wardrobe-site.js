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
  var ASSET_VER = 'v10-20260616';   // GLB 캐시 무효화(에셋 갱신 시 증가)
  function asset(path) {
    var cfg = window.MERRYON_WARDROBE_CONFIG || {};
    var base;
    if (typeof cfg.resolveAsset === 'function') base = cfg.resolveAsset(path);
    else if (cfg.assetBase) base = cfg.assetBase.replace(/\/?$/, '/') + path;
    else base = 'assets/garments/' + path;
    return base + (base.indexOf('?') < 0 ? '?' : '&') + 'av=' + ASSET_VER;
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
    // 라이트 모드(헤드리스 검증용): 포스트프로세싱/실시간 반사 비활성 → 가벼운 렌더로 레이아웃 확인
    this._lite = !!window.__MERRYON_LITE__;

    /* --- 렌더러 --------------------------------------------------------- */
    var renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.43;   // 섬광 저감
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
    scene.environmentIntensity = 0.72;
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
    this._buildJewelryCabinet();
    this._buildStorageAndSpeaker();
    this._buildBookshelfVase();
    this._buildGoldRack();
    this._buildTrunk();
    this._buildDisplayCase();
    this._buildMannequin();   // 임시: 옷 사이즈 가늠용 사람 목업
    // this._buildScarves();   // 바닥 스카프 제거(요청)
    this._buildCurtains();

    this._setupComposer();
    this._setupInteraction();
    this._buildGarmentEditor();   // 옷 편집 패널(?edit 또는 localStorage.MERRYON_EDIT='1')
    this._buildPropEditor();      // 소품(아이폰/가방/목업) 드래그 편집
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
      ctx.fillStyle = '#F1EDE4'; ctx.fillRect(0, 0, S, S);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 곁가지 달린 굵은 메인 베인(칼라카타풍) — 회갈/골드빛
      function vein(x, y, ang, width, depth, col) {
        if (depth <= 0 || width < 0.4) return;
        var len = 26 + Math.random() * 46;
        var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
        ctx.strokeStyle = col; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo((x + nx) / 2 + (Math.random() - 0.5) * 22, (y + ny) / 2 + (Math.random() - 0.5) * 22, nx, ny); ctx.stroke();
        vein(nx, ny, ang + (Math.random() - 0.5) * 0.7, width * 0.74, depth - 1, col);
        if (Math.random() < 0.45) vein(nx, ny, ang + (Math.random() - 0.5) * 1.5, width * 0.5, depth - 1, col);
      }
      for (var i = 0; i < 5; i++) vein(Math.random() * S, Math.random() * S, Math.random() * 6.28, 4.5 + Math.random() * 2, 5, 'rgba(58,60,66,0.55)');   // 차콜 메인
      for (var j = 0; j < 9; j++) vein(Math.random() * S, Math.random() * S, Math.random() * 6.28, 1.6, 3, 'rgba(92,96,104,0.42)');                    // 미드 그레이
      for (var k = 0; k < 7; k++) vein(Math.random() * S, Math.random() * S, Math.random() * 6.28, 1.0, 2, 'rgba(74,78,86,0.32)');                     // 차콜 잔맥
      // 미세 결정 얼룩
      for (var g = 0; g < 1400; g++) { ctx.fillStyle = 'rgba(80,84,90,' + (Math.random() * 0.05) + ')'; ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
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

    var amb = new T.AmbientLight(0xFFEFD8, 0.28);   // 웜·약간 낮춰 평면적 밝음↓(코지 무드)
    scene.add(amb);

    // 웜 코브 글로우 — 천장 둘레의 은은한 골든 간접광(레퍼런스 코브 조명 무드)
    var cove = new T.RectAreaLight(0xFFE6BE, 1.4, R.W * 0.8, R.D * 0.8);
    cove.position.set(0, R.H - 0.12, 0); cove.lookAt(0, 0, 0); scene.add(cove);

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

    // 창문 자연광 — 차가운 푸른빛 완화(웜 데이라이트), 워시 줄임
    var win = new T.RectAreaLight(0xF0EEE4, 1.7, 1.8, 3.0);
    win.position.set(R.W / 2 - 0.15, 1.7, 0.0);
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

    // LightProbe (부드러운 환경 채움) — 살짝 웜 톤(차가운 회색 캐스트 제거)
    var probe = new T.LightProbe();
    probe.sh.coefficients[0].set(0.355, 0.325, 0.285);
    scene.add(probe);

    // 앞벽 웜 워시 — 앞벽(문·갤러리)이 직사광을 못 받아 차갑게 보이는 것 보정(다른 벽과 톤 통일)
    var frontWash = new T.RectAreaLight(0xFFE7CB, 1.1, R.W * 0.95, R.H * 0.85);
    frontWash.position.set(0, R.H / 2, R.D / 2 - 2.4);
    frontWash.lookAt(0, R.H / 2, R.D / 2);
    scene.add(frontWash);

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
    marbleTex.wrapS = marbleTex.wrapT = T.RepeatWrapping; marbleTex.repeat.set(4, 4);
    var marbleBmp = this._marbleBump(); marbleBmp.repeat.set(4, 4);
    if (!this.isMobile && !this._lite) {
      var reflector = new AD.Reflector(new T.PlaneGeometry(W, D), {
        textureWidth: 640, textureHeight: 640, color: 0x9b968c, clipBias: 0.003
      });
      reflector.rotation.x = -Math.PI / 2; reflector.position.y = 0.0;
      scene.add(reflector); this.reflector = reflector;
      var overlay = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshPhysicalMaterial({
        map: marbleTex, bumpMap: marbleBmp, bumpScale: 0.03, color: 0xFFFFFF,
        roughness: 0.28, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.18,
        transparent: true, opacity: 0.82, envMapIntensity: 0.9
      }));
      overlay.rotation.x = -Math.PI / 2; overlay.position.y = 0.012; overlay.receiveShadow = true;
      scene.add(overlay);
    } else {
      var floor = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshPhysicalMaterial({
        map: marbleTex, bumpMap: marbleBmp, bumpScale: 0.03, color: 0xFFFFFF,
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
    // 우벽 — 아치창 개구부(사각 z±1.2 + 아치)만 비우고 나머지는 벽. 스팬드럴(아치 양옆 윗부분)도 벽.
    var woZ = 1.2, woY = 0.45, springY = 1.6, archR = 1.2;   // 아치 꼭대기(1.6+1.2=2.8)<천장(2.9): 천장 뚫림 방지
    wall(D, woY, W / 2, woY / 2, 0, -Math.PI / 2);                                   // 창 아래
    [-1, 1].forEach(function (s) {
      var segW = D / 2 - woZ;
      wall(segW, H - woY, W / 2, woY + (H - woY) / 2, s * (woZ + D / 2) / 2, -Math.PI / 2);  // 창 좌우
    });
    // 스팬드럴(아치 위 코너) 벽 채움 — z[-1.2,1.2], y[springY..springY+R] 에서 아치(반원)를 뺀 영역
    (function () {
      var sp = new T.Shape();
      var yTop = H;   // 천장까지 채워 아치 위 틈/테두리 제거
      sp.moveTo(-woZ, springY); sp.lineTo(-woZ, yTop); sp.lineTo(woZ, yTop); sp.lineTo(woZ, springY);
      sp.lineTo(archR, springY); sp.absarc(0, springY, archR, 0, Math.PI, false); sp.lineTo(-woZ, springY);
      var sm = new T.Mesh(new T.ShapeGeometry(sp, 96), wallMat);   // 곡선 분할↑(아치 매끈하게)
      sm.position.set(W / 2 - 0.001, 0, 0); sm.rotation.y = -Math.PI / 2; sm.receiveShadow = true; scene.add(sm);
    })();

    /* 몰딩 전부 삭제(베이스/체어레일/크라운·웨인스코팅 패널·문 케이싱) — 벽/천장 아이보리 통일 */

    /* 문 — 앞벽 더블, 케이싱 없이 심플 패널 도어 */
    // 아치형 팔라디안 더블 도어(상단 부채꼴 팬라이트 + 골드 아치 프레임)
    function buildDoor(cx, cz, ry, dbl) {
      var grp = new T.Group(); grp.position.set(cx, 0, cz); grp.rotation.y = ry; scene.add(grp);
      var lh = 1.95, lw = dbl ? 0.82 : 0.9, totW = dbl ? lw * 2 : lw, R = totW / 2;
      var glassMat = new T.MeshPhysicalMaterial({ color: 0xEAF2FF, roughness: 0.06, transmission: 0.55, transparent: true, opacity: 0.5, emissive: 0xF2ECDD, emissiveIntensity: 0.22, side: T.DoubleSide });
      // 도어 잎(패널 + 골드 트림)
      (dbl ? [-1, 1] : [0]).forEach(function (s) {
        var cxo = dbl ? s * lw / 2 : 0;
        var leaf = new T.Mesh(new T.BoxGeometry(lw - 0.01, lh, 0.05), doorMat);
        leaf.position.set(cxo, lh / 2, 0.025); leaf.castShadow = true; grp.add(leaf);
        [lh * 0.74, lh * 0.46, lh * 0.18].forEach(function (py, pi) {
          var ph = (pi === 0 ? 0.42 : 0.26) * lh;
          var tr = new T.Mesh(new T.BoxGeometry(lw * 0.66, ph + 0.04, 0.005), gold); tr.position.set(cxo, py, 0.0545); grp.add(tr);
          var dp = new T.Mesh(new T.BoxGeometry(lw * 0.62, ph, 0.006), doorPanelMat); dp.position.set(cxo, py, 0.060); grp.add(dp);
        });
        var hx = dbl ? (cxo - s * (lw / 2 - 0.08)) : (lw / 2 - 0.1);
        var handle = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.34, 12), gold); handle.position.set(hx, lh * 0.5, 0.075); grp.add(handle);
        var knob = new T.Mesh(new T.SphereGeometry(0.026, 12, 10), gold); knob.position.set(hx, lh * 0.5, 0.085); grp.add(knob);
      });
      // 부채꼴 팬라이트(아치 유리 + 방사형 골드 바)
      var fan = new T.Mesh(new T.CircleGeometry(R, 28, 0, Math.PI), glassMat);
      fan.position.set(0, lh + 0.03, 0.02); grp.add(fan);
      var pts = [];
      for (var a = 0; a <= Math.PI + 0.001; a += Math.PI / 20) pts.push(new T.Vector3(R * Math.cos(a), lh + 0.03 + R * Math.sin(a), 0.03));
      var arch = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 28, 0.03, 8, false), gold); grp.add(arch);
      [0.25, 0.5, 0.75].forEach(function (f) {
        var a = Math.PI * f, ex = R * Math.cos(a) * 0.94, ey = R * Math.sin(a) * 0.94, len = Math.sqrt(ex * ex + ey * ey);
        var bar = new T.Mesh(new T.BoxGeometry(0.028, len, 0.03), gold);
        bar.position.set(ex / 2, lh + 0.03 + ey / 2, 0.03); bar.rotation.z = Math.atan2(ey, ex) - Math.PI / 2; grp.add(bar);
      });
      // 골드 세로 프레임 + 스프링라인
      [-R, R].forEach(function (x) { var v = new T.Mesh(new T.BoxGeometry(0.05, lh + 0.06, 0.06), gold); v.position.set(x, lh / 2, 0.03); grp.add(v); });
      var spring = new T.Mesh(new T.BoxGeometry(totW + 0.1, 0.05, 0.06), gold); spring.position.set(0, lh + 0.03, 0.03); grp.add(spring);
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
    var cz = 0.0, winW = 2.4, R = winW / 2, sill = 0.5, winH = 1.1;   // 사각부 높이(아치 꼭대기 2.8<천장)
    var rectTop = sill + winH, archY = rectTop, winY = sill + winH / 2;
    // 화이트 프레임(아치형 팔라디안 — 레퍼런스 화이트 그리드)
    var frameMat = new T.MeshStandardMaterial({ color: 0xF4EEE1, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.7 });
    var glassMat = new T.MeshPhysicalMaterial({
      color: 0xF2FBFF, roughness: 0.04, metalness: 0.0, transmission: 0.9, transparent: true,
      opacity: 0.18, emissive: 0xEAF2E0, emissiveIntensity: 0.05, side: T.DoubleSide
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

    // 창 커튼봉 제거(요청) — 커튼은 빌트인 드레이프로 대체

    // 중앙 쉬폰 커튼 제거 — 물결 morph 가 창 위에서 울퉁불퉁하게 보여 삭제(양옆 드레이프 GLB 로 대체)
    this.curtain = null;
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
    // 실제 merryon 의류 컷아웃 [폴더, 파일, 종류, 이름, 베이크값?{h,hl,hr,dy}]
    // 종류: dress/top/skirt/pants (skirt·pants = 집게(바지)걸이). 베이크 없으면 자동(밴드 감지)
    var CUTS = [
      ['up', '8dbdd3289854eef87e4b7b120803db73.png', 'dress', '블루 원피스', { h: 1.050, hl: 0.030, hr: 0.030, dy: 0.040 }],
      ['st', '696d5959f7e267f4f3563e4aca916b01.png', 'top', '크림 블라우스', { h: 0.720, hl: 0.065, hr: 0.075, dy: -0.050 }],
      ['up', 'daae53f5360161f404852168cfa80303.png', 'top', '블랙 가디건', { h: 1.050, hl: 0.035, hr: 0.035, dy: -0.010 }],
      ['up', 'fddfc7c28b73ccccc67cb6245b7e1f6a.png', 'dress', '블랙 플리츠 원피스', { h: 0.700, hl: 0.055, hr: 0.055, dy: 0.035 }],
      ['st', 'b6289b824b92eb00546b472548b31bf9.png', 'skirt', '핑크 스커트', { h: 0.600, hl: 0.130, hr: 0.125, dy: 0.000 }],
      ['up', '벨리나 스커트.png', 'skirt', '벨리나 스커트', { h: 3.350, hl: 0.125, hr: 0.125, dy: 0.615 }],
      ['up', '이븐 레이스.png', 'top', '이븐 레이스', { h: 3.380, hl: 0.126, hr: 0.126, dy: 0.530 }],
      ['up', '넴프 슬랙스.png', 'pants', '넴프 슬랙스', { h: 2.420, hl: 0.130, hr: 0.140, dy: 0.510 }],
      ['up', '노에아 벨트 스커트.png', 'skirt', '노에아 벨트 스커트', { h: 3.220, hl: 0.105, hr: 0.130, dy: 0.575 }],
      ['up', '로엘 시어서커 원피스.png', 'dress', '로엘 시어서커 원피스', { h: 1.850, hl: 0.040, hr: 0.045, dy: 0.530 }],
      ['up', '벨리나 블라우스.png', 'top', '벨리나 블라우스', { h: 2.230, hl: 0.060, hr: 0.060, dy: 0.405, tint: 0xFCF7F6 }]
    ];
    // 편집 패널에서 확정한 표시 순서(garment index) — 핑크스커트,블루,크림블,블랙가디건,이븐레이스,벨리나블,벨리나스,블랙플리츠,넴프,노에아,로엘
    var DEFAULT_ORDER = [4, 0, 1, 2, 6, 10, 5, 3, 7, 8, 9];
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
    // 디프린지: 반투명 가장자리(밝은 배경 잔상) 제거 — 알파 하드닝 + 컬러 블리드(딜레이션)
    // 1) alpha<thr → 0, ≥thr → 255 (반투명 헤일로 링 제거)
    // 2) 불투명 색을 투명영역으로 수 px 번지게 → 바이리니어 필터가 흰 테두리 대신 옷 색을 샘플
    function defringe(img, thr, erodePx) {
      try {
        var W = img.width, H = img.height, N = W * H;
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        var id = ctx.getImageData(0, 0, W, H), d = id.data;
        // 1) 하드 마스크(0/255)
        var msk = new Uint8Array(N);
        for (var p = 0; p < N; p++) msk[p] = d[p * 4 + 3] >= thr ? 255 : 0;
        // 2) 침식(erode) — 외곽의 밝은 반투명 프린지 링 제거(경계 픽셀은 알파 높아도 색이 배경)
        var er = msk;
        for (var e = 0; e < (erodePx || 2); e++) {
          var ee = new Uint8Array(N);
          for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
            var idx = y * W + x;
            if (!er[idx]) continue;
            var keep = 1;
            for (var dy = -1; dy <= 1 && keep; dy++) for (var dx = -1; dx <= 1; dx++) {
              var nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              if (!er[ny * W + nx]) { keep = 0; break; }
            }
            ee[idx] = keep ? 255 : 0;
          }
          er = ee;
        }
        // 3) 컬러 블리드 — 침식된 불투명 영역의 RGB 를 바깥으로 번지게(필터가 옷 색 샘플)
        var cur = new Uint8Array(er);
        for (var pass = 0; pass < 6; pass++) {
          var next = new Uint8Array(cur), changed = false;
          for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
            var i2 = y2 * W + x2;
            if (cur[i2]) continue;
            var sr = 0, sg = 0, sb = 0, cnt = 0;
            for (var dy2 = -1; dy2 <= 1; dy2++) for (var dx2 = -1; dx2 <= 1; dx2++) {
              if (!dx2 && !dy2) continue;
              var nx2 = x2 + dx2, ny2 = y2 + dy2;
              if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
              var ni = ny2 * W + nx2;
              if (cur[ni]) { var o = ni * 4; sr += d[o]; sg += d[o + 1]; sb += d[o + 2]; cnt++; }
            }
            if (cnt) { var q = i2 * 4; d[q] = sr / cnt; d[q + 1] = sg / cnt; d[q + 2] = sb / cnt; next[i2] = 255; changed = true; }
          }
          cur = next;
          if (!changed) break;
        }
        // 4) 최종 알파 = 침식 마스크(0/255) → 밝은 프린지 링 제거 + 블리드된 옷 색 외곽
        for (var m = 0; m < N; m++) d[m * 4 + 3] = er[m];
        ctx.putImageData(id, 0, 0);
        return cv;
      } catch (e2) { return img; }
    }
    // 후크는 봉(피벗 원점, y≈0)에 걸리고, 어깨바·평면은 dz(깊이분리)만큼 앞/뒤로.
    function rodHook(parent) {
      var hook = new T.Mesh(new T.TorusGeometry(0.022, 0.0045, 8, 18, Math.PI * 1.15), gold);
      hook.rotation.z = Math.PI; hook.rotation.y = Math.PI / 2; hook.position.set(0, -0.006, 0); parent.add(hook);
    }
    function shoulderHanger(parent, hl, hr, dz) {
      rodHook(parent);   // 봉에 걸리는 후크
      var neck = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.05, 8), gold);
      neck.position.set(0, -0.04, dz * 0.5); neck.rotation.x = Math.atan2(dz, 0.05); parent.add(neck);
      var by = -0.065;   // 어깨 와이어 높이(봉 아래)
      var bar = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([
        new T.Vector3(-hl, by - 0.038, dz), new T.Vector3(0, by, dz), new T.Vector3(hr, by - 0.038, dz)
      ]), 16, 0.005, 6, false), gold);
      parent.add(bar);
      [-hl, hr].forEach(function (tx) {
        var tip = new T.Mesh(new T.SphereGeometry(0.0075, 8, 6), gold);
        tip.position.set(tx, by - 0.038, dz); parent.add(tip);
      });
      return by - 0.028;   // 평면 상단(어깨)
    }
    function clipHanger(parent, hl, hr, dz) {
      rodHook(parent);
      var neck = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.06, 8), gold);
      neck.position.set(0, -0.045, dz * 0.5); neck.rotation.x = Math.atan2(dz, 0.06); parent.add(neck);
      var by = -0.075, len = hl + hr, cx = (hr - hl) / 2;
      var bar = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, len, 10), gold);
      bar.rotation.z = Math.PI / 2; bar.position.set(cx, by, dz); parent.add(bar);
      [-hl + 0.012, hr - 0.012].forEach(function (tx) {
        var clip = new T.Mesh(new T.BoxGeometry(0.02, 0.034, 0.016), gold);
        clip.position.set(tx, by - 0.012, dz); parent.add(clip);
      });
      return by - 0.006;
    }

    // 런타임 트윅(높이/옷걸이/상하/순서) — localStorage 저장(새로고침 유지) + 편집 패널에서 조정
    function getTweaks() { try { return JSON.parse(localStorage.getItem('MERRYON_GARMENT_TWEAKS2') || '{}'); } catch (e) { return {}; } }
    function getOrder() {
      var o; try { o = JSON.parse(localStorage.getItem('MERRYON_GARMENT_ORDER2') || 'null'); } catch (e) { o = null; }
      if (!o || o.length !== n) { o = (DEFAULT_ORDER && DEFAULT_ORDER.length === n) ? DEFAULT_ORDER.slice() : []; if (!o.length) for (var k = 0; k < n; k++) o.push(k); }
      return o;
    }
    function saveOrder(o) { try { localStorage.setItem('MERRYON_GARMENT_ORDER2', JSON.stringify(o)); } catch (e) {} }
    self._garmentOrder = getOrder;
    var cache = [];
    self._garmentState = [];

    function buildOne(i) {
      var entry = CUTS[i], cc = cache[i]; if (!cc) return;
      var type = entry[2], clipType = (type === 'skirt' || type === 'pants'), bk = entry[4] || {};
      var pos = getOrder().indexOf(i); if (pos < 0) pos = i;            // 표시 순서(편집 가능)
      var fx = n > 1 ? (-spanW / 2 + spanW * (pos / (n - 1))) : 0;
      var dz = ((type === 'dress') ? 0.10 : (type === 'top') ? 0.0 : -0.10) + (pos % 2 ? 0.05 : -0.05);
      // 기본값(디폴트) — 베이크값(entry[4])이 있으면 우선, 없으면 자동(밴드 감지)
      var aspect = cc.aspect, band = cc.band;
      var heightDef = (bk.h != null) ? bk.h : 1;
      var w0 = (HBY[type] || H0 / 2) * heightDef * aspect;
      var swDef = band != null ? band * w0 * (clipType ? 0.82 : 0.74) : (clipType ? w0 * 0.6 : w0 * 0.28);
      swDef = Math.max(clipType ? 0.12 : 0.07, Math.min(0.42, swDef));
      var hlDef = (bk.hl != null) ? bk.hl : swDef / 2;
      var hrDef = (bk.hr != null) ? bk.hr : swDef / 2;
      var dyDef = (bk.dy != null) ? bk.dy : 0;
      // 트윅 적용(라이브 편집이 베이크값보다 우선)
      var t = getTweaks()[i] || {};
      var hmul = (t.h != null) ? t.h : heightDef;
      var hl = (t.hl != null) ? t.hl : hlDef;
      var hr = (t.hr != null) ? t.hr : hrDef;
      var dyv = (t.dy != null) ? t.dy : dyDef;   // 상하 위치 오프셋(옷걸이 고정, 천만)
      // 기존 제거
      var prev = self._garmentState[i];
      if (prev && prev.pivot) { group.remove(prev.pivot); }
      // 빌드
      var pivot = new T.Group();
      pivot.position.set(fx, rodY, rodZ);   // 옷걸이(피벗)는 봉에 고정
      pivot.userData.tilt = (pos % 2 ? 1 : -1) * (6 * Math.PI / 180);
      group.add(pivot);
      var h = (HBY[type] || H0 / 2) * hmul, w = h * aspect;
      var topY = clipType ? clipHanger(pivot, hl, hr, dz) : shoulderHanger(pivot, hl, hr, dz);
      if (type === 'top') topY += 0.045;
      topY += 0.022;
      var mat = new T.MeshStandardMaterial({
        map: cc.tex, transparent: true, alphaTest: 0.5, side: T.DoubleSide,
        roughness: 0.82, metalness: 0.0, color: (bk.tint != null) ? bk.tint : 0xffffff   // 틴트=색감 보정(블로우아웃 완화)
      });
      var plane = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      plane.position.set(0, topY - h / 2 + dyv, dz); plane.castShadow = false; pivot.add(plane);   // 천만 상하 이동(옷걸이 고정)
      self._garmentState[i] = { pivot: pivot, type: type, name: entry[3] || type, def: { h: heightDef, hl: hlDef, hr: hrDef, dy: dyDef }, cur: { h: hmul, hl: hl, hr: hr, dy: dyv } };
      // 빌보드 목록 재구성
      var bb = []; for (var k = 0; k < n; k++) { if (self._garmentState[k] && self._garmentState[k].pivot) bb.push(self._garmentState[k].pivot); }
      self.billboards = bb;
      try { window.__MERRYON_CUTS__ = bb.length; } catch (e) {}
      if (self._refreshGarmentEditor) self._refreshGarmentEditor();
    }
    self._rebuildGarment = buildOne;
    // 로드된 모든 옷 재빌드(순서 변경 시 fx 재계산)
    function rebuildAll() { for (var k = 0; k < n; k++) if (cache[k]) buildOne(k); }
    // 순서 변경: 표시 순서에서 옷 i 를 dir(-1 앞/+1 뒤)로 이동
    self._moveGarment = function (i, dir) {
      var o = getOrder(), p = o.indexOf(i), q = p + dir;
      if (p < 0 || q < 0 || q >= o.length) return;
      var tmp = o[p]; o[p] = o[q]; o[q] = tmp; saveOrder(o);
      rebuildAll();
      if (self._ed) self._ed.built = -1;
      if (self._refreshGarmentEditor) self._refreshGarmentEditor();
    };

    CUTS.forEach(function (entry, i) {
      loader.load(cut(entry[0], entry[1]),
        function (tex) {
          var img = tex.image;
          var clipType = (entry[2] === 'skirt' || entry[2] === 'pants');
          // 다운스케일(긴 변 ≤ 720) → 디프린지/텍스처 비용 대폭↓(초기 로딩 가속)
          var MAX = 720, scl = Math.min(1, MAX / Math.max(img.width, img.height));
          var dw = Math.max(1, Math.round(img.width * scl)), dh = Math.max(1, Math.round(img.height * scl));
          var dc = document.createElement('canvas'); dc.width = dw; dc.height = dh;
          var dctx = dc.getContext('2d'); dctx.drawImage(img, 0, 0, dw, dh);
          var tainted = false; try { dctx.getImageData(0, 0, 1, 1); } catch (e) { tainted = true; }
          var finalTex, aspect, band = null;
          if (tainted) {   // 교차출처 → 캔버스 처리 불가, 원본 텍스처로 폴백
            tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = false; tex.minFilter = T.LinearFilter; finalTex = tex; aspect = img.width / img.height;
          } else {
            band = clipType ? topOpaqueFrac(dc, 0.0, 0.06) : topOpaqueFrac(dc, 0.0, 0.04);
            var clean = defringe(dc, 150, 3);   // 임계↑·침식↑ → 밝은 프린지 링 제거 강화
            finalTex = new T.CanvasTexture(clean); finalTex.colorSpace = T.SRGBColorSpace; finalTex.anisotropy = 4;
            finalTex.generateMipmaps = false; finalTex.minFilter = T.LinearFilter;   // 밉맵 끄기(가장자리 반투명 헤일로 방지)
            tex.dispose(); aspect = dw / dh;
          }
          cache[i] = { tex: finalTex, aspect: aspect, band: band };
          buildOne(i);
        },
        undefined,
        function () { console.warn('[merryon] 컷아웃 로드 실패', entry[1]); }
      );
    });
  };

  /* 옷 편집 패널 — 옷별 높이/옷걸이 좌·우 길이 슬라이더(라이브 반영 + localStorage 저장).
   * 노출 조건: URL 에 ?edit 또는 localStorage.MERRYON_EDIT='1' (일반 방문자엔 숨김). */
  P._buildGarmentEditor = function () {
    var self = this;
    // 개발 중: 항상 표시(런칭 전 아래 게이트로 되돌리면 ?edit=1 일 때만 노출)
    var on = true; // /[?&]edit/i.test(location.search) || localStorage.getItem('MERRYON_EDIT') === '1';
    if (!on) return;
    try { localStorage.setItem('MERRYON_EDIT', '1'); } catch (e) {}

    var btn = document.createElement('button');
    btn.textContent = '✎ 옷 편집';
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 12px;border-radius:18px;border:none;background:#2a2a2a;color:#fff;font:13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;';
    document.body.appendChild(btn);

    var panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:12px;bottom:54px;z-index:99999;width:268px;max-height:74vh;overflow:auto;background:rgba(24,22,20,.94);color:#f3ece0;border-radius:12px;padding:10px 12px;font:12px/1.4 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);display:none;';
    document.body.appendChild(panel);

    var rows = document.createElement('div');
    var foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
    var copyBtn = document.createElement('button'), resetBtn = document.createElement('button');
    copyBtn.textContent = '값 복사'; resetBtn.textContent = '초기화';
    [copyBtn, resetBtn].forEach(function (b) { b.style.cssText = 'flex:1;padding:7px;border:none;border-radius:8px;background:#d9b8a0;color:#241;font:12px sans-serif;cursor:pointer;'; });
    var hint = document.createElement('div');
    hint.style.cssText = 'margin-top:6px;color:#b8ada0;font-size:11px;';
    hint.textContent = '슬라이더=크기/위치/옷걸이, ▲▼=순서. 라이브 반영+저장. [값 복사] 후 채팅에 붙여주시면 영구 반영해 드려요.';
    panel.appendChild(rows); foot.appendChild(copyBtn); foot.appendChild(resetBtn); panel.appendChild(foot); panel.appendChild(hint);

    function tw() { try { return JSON.parse(localStorage.getItem('MERRYON_GARMENT_TWEAKS2') || '{}'); } catch (e) { return {}; } }
    function saveTw(o) { try { localStorage.setItem('MERRYON_GARMENT_TWEAKS2', JSON.stringify(o)); } catch (e) {} }

    btn.onclick = function () { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
    copyBtn.onclick = function () {
      var st = self._garmentState || [], order = self._garmentOrder ? self._garmentOrder() : [];
      var lines = ['merryon 옷 편집값 (표시 순서대로 name: height/hangerL/hangerR/posY):'];
      order.forEach(function (i, pos) { var s = st[i]; if (!s) return; var c = s.cur; lines.push((pos + 1) + '. ' + s.name + ': height=' + c.h.toFixed(3) + ' hangerL=' + c.hl.toFixed(3) + ' hangerR=' + c.hr.toFixed(3) + ' posY=' + (c.dy || 0).toFixed(3)); });
      var txt = lines.join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { copyBtn.textContent = '복사됨!'; setTimeout(function () { copyBtn.textContent = '값 복사'; }, 1200); });
      else { window.prompt('복사:', txt); }
    };
    resetBtn.onclick = function () { saveTw({}); try { localStorage.removeItem('MERRYON_GARMENT_ORDER2'); } catch (e) {} if (self._garmentState) for (var i = 0; i < self._garmentState.length; i++) if (self._garmentState[i]) self._rebuildGarment(i); self._ed.built = -1; self._refreshGarmentEditor(); };

    self._ed = { panel: panel, rows: rows, built: -1 };

    self._refreshGarmentEditor = function () {
      var st = self._garmentState || [], cnt = 0; for (var k = 0; k < st.length; k++) if (st[k]) cnt++;
      if (cnt === self._ed.built) return;   // 슬라이더 드래그 중 재생성 방지(개수 변화시만)
      self._ed.built = cnt;
      rows.innerHTML = '';
      var order = self._garmentOrder ? self._garmentOrder() : [];
      order.forEach(function (i, pos) {
        var s = st[i]; if (!s) return;
        var box = document.createElement('div');
        box.style.cssText = 'padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);';
        var title = document.createElement('div');
        title.style.cssText = 'display:flex;align-items:center;gap:4px;font-weight:600;margin-bottom:3px;color:#f6e9d8;';
        var nm = document.createElement('span'); nm.textContent = (pos + 1) + '. ' + s.name; nm.style.cssText = 'flex:1;';
        var up = document.createElement('button'); up.textContent = '▲'; var dn = document.createElement('button'); dn.textContent = '▼';
        [up, dn].forEach(function (b) { b.style.cssText = 'width:24px;padding:2px;border:none;border-radius:5px;background:#4a4640;color:#f3ece0;cursor:pointer;font-size:11px;'; });
        up.onclick = function () { self._moveGarment(i, -1); }; dn.onclick = function () { self._moveGarment(i, 1); };
        title.appendChild(nm); title.appendChild(up); title.appendChild(dn); box.appendChild(title);
        [['h', '높이', 0.4, 4.0, 0.01], ['dy', '상하위치', -1.2, 1.2, 0.005], ['hl', '옷걸이 ◀', 0.02, 0.6, 0.005], ['hr', '옷걸이 ▶', 0.02, 0.6, 0.005]].forEach(function (sp) {
          var key = sp[0], cur = (s.cur[key] != null) ? s.cur[key] : 0;
          var row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
          var lab = document.createElement('span'); lab.textContent = sp[1]; lab.style.cssText = 'width:54px;color:#cbb;';
          var rng = document.createElement('input'); rng.type = 'range'; rng.min = sp[2]; rng.max = sp[3]; rng.step = sp[4]; rng.value = cur; rng.style.cssText = 'flex:1;';
          var num = document.createElement('span'); num.textContent = (+cur).toFixed(3); num.style.cssText = 'width:42px;text-align:right;color:#e9d;';
          rng.oninput = function () {
            var v = parseFloat(this.value); num.textContent = v.toFixed(3);
            var o = tw(); o[i] = o[i] || {}; o[i][key] = v; saveTw(o);
            self._rebuildGarment(i);
          };
          row.appendChild(lab); row.appendChild(rng); row.appendChild(num); box.appendChild(row);
        });
        rows.appendChild(box);
      });
    };
    self._refreshGarmentEditor();
  };

  /* 소품 편집 모드 — 아이폰/가방/목업을 탭→드래그(바닥 이동)+높이▲▼로 배치, 위치값 복사/저장.
   * 개발 중 항상 표시(런칭 전 호출 제거). */
  P._buildPropEditor = function () {
    var self = this, T = this.T, el = this.container;
    var props = this.editProps || [];
    var rc = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
    var sel = null, dragging = false;
    self._propEdit = false;
    var selBox = new T.BoxHelper(new T.Object3D(), 0xff5fbf); selBox.visible = false; this.scene.add(selBox);
    function showBox() { if (sel && self._propEdit) { selBox.setFromObject(sel.obj); selBox.visible = true; } else selBox.visible = false; }

    function savePos() {
      var all = {}; try { all = JSON.parse(localStorage.getItem('MERRYON_PROP_POS') || '{}'); } catch (e) {}
      props.forEach(function (p) { var q = p.obj.position; all[p.name] = [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3)]; });
      try { localStorage.setItem('MERRYON_PROP_POS', JSON.stringify(all)); } catch (e) {}
    }
    function setNdc(e) { var r = el.getBoundingClientRect(), cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY; ndc.x = (cx - r.left) / r.width * 2 - 1; ndc.y = -((cy - r.top) / r.height * 2 - 1); }
    function pick(e) {
      setNdc(e); rc.setFromCamera(ndc, self.camera);
      var hits = rc.intersectObjects(props.map(function (p) { return p.obj; }), true);
      if (!hits.length) return null;
      var o = hits[0].object;
      while (o) { for (var i = 0; i < props.length; i++) if (props[i].obj === o) return props[i]; o = o.parent; }
      return null;
    }

    var btn = document.createElement('button'); btn.textContent = '✦ 소품';
    btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:8px 12px;border-radius:18px;border:none;background:#3a2f55;color:#fff;font:13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;';
    document.body.appendChild(btn);
    var panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:12px;bottom:54px;z-index:99999;width:236px;background:rgba(24,22,30,.95);color:#f0ece6;border-radius:12px;padding:10px 12px;font:12px/1.4 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);display:none;';
    document.body.appendChild(panel);
    var infod = document.createElement('div'); infod.style.cssText = 'margin-bottom:6px;color:#b8aec8;'; infod.textContent = '소품/가구를 탭→드래그(바닥 이동), 미세조정은 좌우/앞뒤/높이 버튼. [위치 복사] 후 채팅에.';
    var selLbl = document.createElement('div'); selLbl.style.cssText = 'font-weight:600;color:#e8c0e8;margin-bottom:6px;'; selLbl.textContent = '선택: 없음';
    function axisRow(label, axis, step) {
      var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
      var lab = document.createElement('span'); lab.textContent = label; lab.style.cssText = 'width:48px;color:#cbb;font-size:11px;';
      var minus = document.createElement('button'), plus = document.createElement('button'); minus.textContent = '−'; plus.textContent = '+';
      [minus, plus].forEach(function (b) { b.style.cssText = 'flex:1;padding:6px;border:none;border-radius:6px;background:#4a4258;color:#fff;cursor:pointer;font-size:15px;'; });
      minus.onclick = function () { if (sel) { sel.obj.position[axis] -= step; savePos(); showBox(); } };
      plus.onclick = function () { if (sel) { sel.obj.position[axis] += step; savePos(); showBox(); } };
      row.appendChild(lab); row.appendChild(minus); row.appendChild(plus); return row;
    }
    var rowX = axisRow('좌우 X', 'x', 0.05), rowZ = axisRow('앞뒤 Z', 'z', 0.05), rowY = axisRow('높이 Y', 'y', 0.02);
    var foot = document.createElement('div'); foot.style.cssText = 'display:flex;gap:6px;margin-top:2px;';
    var copyB = document.createElement('button'), resetB = document.createElement('button'); copyB.textContent = '위치 복사'; resetB.textContent = '초기화';
    [copyB, resetB].forEach(function (b) { b.style.cssText = 'flex:1;padding:7px;border:none;border-radius:8px;background:#cdb6e0;color:#221;cursor:pointer;'; });
    foot.appendChild(copyB); foot.appendChild(resetB);
    panel.appendChild(infod); panel.appendChild(selLbl); panel.appendChild(rowX); panel.appendChild(rowZ); panel.appendChild(rowY); panel.appendChild(foot);

    btn.onclick = function () {
      self._propEdit = !self._propEdit;
      panel.style.display = self._propEdit ? 'block' : 'none';
      btn.style.background = self._propEdit ? '#7a5fae' : '#3a2f55';
      if (!self._propEdit) { sel = null; dragging = false; selLbl.textContent = '선택: 없음'; }
      showBox();
    };
    el.addEventListener('pointerdown', function (e) {
      if (!self._propEdit) return;
      var p = pick(e);
      if (p) { sel = p; dragging = true; selLbl.textContent = '선택: ' + p.name; showBox(); e.preventDefault(); if (el.setPointerCapture) try { el.setPointerCapture(e.pointerId); } catch (x) {} }
    });
    el.addEventListener('pointermove', function (e) {
      if (!self._propEdit || !dragging || !sel) return;
      setNdc(e); rc.setFromCamera(ndc, self.camera);
      plane.constant = -sel.obj.position.y;
      if (rc.ray.intersectPlane(plane, hit)) { sel.obj.position.x = hit.x; sel.obj.position.z = hit.z; showBox(); }
    });
    function up() { if (dragging) { dragging = false; savePos(); } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    copyB.onclick = function () {
      var list = sel ? [sel] : props;   // 선택된 것만(없으면 전체)
      var lines = ['merryon ' + (sel ? '선택 소품' : '소품 전체') + ' 위치 (name: x,y,z):'];
      list.forEach(function (p) { var q = p.obj.position; lines.push(p.name + ': ' + q.x.toFixed(3) + ', ' + q.y.toFixed(3) + ', ' + q.z.toFixed(3)); });
      var txt = lines.join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { copyB.textContent = '복사됨!'; setTimeout(function () { copyB.textContent = '위치 복사'; }, 1200); });
      else window.prompt('복사:', txt);
    };
    resetB.onclick = function () { try { localStorage.removeItem('MERRYON_PROP_POS'); } catch (e) {} props.forEach(function (p) { p.obj.position.copy(p.def); }); sel = null; selLbl.textContent = '선택: 없음'; showBox(); };
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
    // 좌측 벽(갤러리 벽)에 등을 대고 붙임 — 그룹으로 묶어 회전 배치
    var W = this.ROOM.W;
    var vg = new T.Group(); vg.position.set(-W / 2 + 0.5, 0, 0); vg.rotation.y = Math.PI / 2; scene.add(vg); this._regProp('화장대', vg);
    this.vanityGroup = vg;
    var bx = 0, bz = 0;   // 그룹 로컬

    var gold = this.goldMat;
    // 화이트 프렌치 프로방살 — 카브드 우드 톤(레퍼런스 img2)
    var white = new T.MeshStandardMaterial({ color: 0xF3EFE5, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.7 });
    var whiteP = new T.MeshStandardMaterial({ color: 0xEFE9DB, roughness: 0.6, metalness: 0.0 });

    // 상판(≈0.78m) — 화이트, 살짝 오버행
    var top = new T.Mesh(new T.BoxGeometry(1.3, 0.05, 0.55), white);
    top.position.set(bx, 0.78, bz); top.castShadow = true; top.receiveShadow = true; vg.add(top);
    // 몸통(서랍 캐비닛)
    var body = new T.Mesh(new T.BoxGeometry(1.16, 0.24, 0.46), white);
    body.position.set(bx, 0.64, bz); body.castShadow = true; vg.add(body);
    // 서랍 3 + 골드 손잡이
    for (var dI = -1; dI <= 1; dI++) {
      var df = new T.Mesh(new T.BoxGeometry(0.34, 0.18, 0.02), whiteP);
      df.position.set(bx + dI * 0.38, 0.64, bz + 0.24); vg.add(df);
      var knob = new T.Mesh(new T.SphereGeometry(0.018, 12, 10), gold);
      knob.position.set(bx + dI * 0.38, 0.64, bz + 0.27); vg.add(knob);
    }
    // 카브리올(살짝 휜) 화이트 다리 ×4 — 위 굵고 아래 가늘게 + 바깥 스플레이
    [[-0.55, -0.18, -1], [0.55, -0.18, 1], [-0.55, 0.18, -1], [0.55, 0.18, 1]].forEach(function (lp) {
      var leg = new T.Mesh(new T.CylinderGeometry(0.035, 0.018, 0.52, 12), white);
      leg.position.set(bx + lp[0], 0.26, bz + lp[1]); leg.rotation.z = lp[2] * 0.07; leg.castShadow = true; vg.add(leg);
      var foot = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), gold);
      foot.position.set(bx + lp[0] + lp[2] * 0.035, 0.01, bz + lp[1]); vg.add(foot);
    });

    // 골드 오벌 거울(테이블 위 스탠딩) — 타원 링 + 반사면(벽쪽, bz-0.18)
    var ring = new T.Mesh(new T.TorusGeometry(0.3, 0.022, 12, 40), gold);
    ring.scale.set(1.0, 1.35, 1.0); ring.position.set(bx, 1.22, bz - 0.18); vg.add(ring);
    var ovGeo = new T.CircleGeometry(0.28, 40); ovGeo.scale(1.0, 1.32, 1.0);
    var ovm = this._addCubeMirror(bx, 1.22, bz - 0.16, 0, 0, 0, 1, ovGeo);
    if (ovm) { scene.remove(ovm); vg.add(ovm); }
    var mstand = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.42, 8), gold);
    mstand.position.set(bx, 0.92, bz - 0.18); vg.add(mstand);

    // 향수 + 꽃 (그룹에 부착)
    this._buildPerfumes(vg, bx, bz, gold);
    this._addFlowerCluster(bx + 0.46, 0.81, bz + 0.02, 0.22, PALETTE.blush, vg);
  };

  /* 실제 향수 브랜드 실루엣 4종 (parent 그룹에 부착) */
  P._buildPerfumes = function (scene, bx, bz, gold) {
    var T = this.T, y0 = 0.805;
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
    var T = this.T, scene = this.scene;
    var g = geo || new T.PlaneGeometry(w, h);
    // 작은 장식 거울(화장대/셰발)은 정적 env 반사로 통일 → 매 프레임 전체 씬 재렌더 제거(성능)
    var m = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0xEDF0F3, metalness: 1.0, roughness: 0.05, envMapIntensity: 1.6 }));
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
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
    var T = this.T, scene = this.scene, gold = this.goldMat;
    var mx = 3.3, mz = 1.9, ry = -0.95;    // 우-앞측(소파 옆)
    var orx = 0.40, ory = 0.62, cy = 0.98; // 오벌 반경, 중심 높이 → 셰발(전신) 미러
    var g = new T.Group(); g.position.set(mx, 0, mz); g.rotation.y = ry; scene.add(g); this._regProp('체발 미러', g);

    // 오벌 골드 프레임(이중 링) + 상단 크레스트(오너먼트)
    function ovalRing(tube, scaleY, rad) {
      var r = new T.Mesh(new T.TorusGeometry(rad, tube, 12, 48), gold);
      r.scale.set(1, scaleY, 1); r.position.set(0, cy, 0.02); g.add(r); return r;
    }
    ovalRing(0.028, ory / orx, orx);
    ovalRing(0.012, (ory - 0.05) / (orx - 0.05), orx - 0.05);
    var crest = new T.Mesh(new T.SphereGeometry(0.05, 12, 10), gold);
    crest.scale.set(1.7, 0.8, 0.6); crest.position.set(0, cy + ory + 0.03, 0.02); g.add(crest);
    var crest2 = new T.Mesh(new T.TorusGeometry(0.035, 0.01, 8, 18, Math.PI), gold);
    crest2.position.set(0, cy + ory + 0.06, 0.02); g.add(crest2);

    // 셰발(전신) 스탠드 — 곧은 세로 기둥 한 쌍(상단 피니얼 + 중앙 피벗 노브 + 썰매발) + 크로스바
    var px = orx + 0.09;            // 기둥 x(프레임 바로 바깥)
    var postTop = cy + ory * 0.5;   // 기둥 상단(미러 중상부)
    var postBot = 0.05;
    [-1, 1].forEach(function (s) {
      var x = s * px, len = postTop - postBot;
      var post = new T.Mesh(new T.CylinderGeometry(0.015, 0.018, len, 14), gold);
      post.position.set(x, (postTop + postBot) / 2, 0); g.add(post);
      // 상단 피니얼(장식구)
      var fin = new T.Mesh(new T.SphereGeometry(0.026, 12, 10), gold);
      fin.position.set(x, postTop + 0.012, 0); g.add(fin);
      // 중앙 피벗 노브 — 오벌 프레임이 회전 결합되는 부분
      var knob = new T.Mesh(new T.CylinderGeometry(0.019, 0.019, 0.05, 14), gold);
      knob.rotation.x = Math.PI / 2; knob.position.set(x - s * 0.005, cy, 0.018); g.add(knob);
      // 썰매발(앞뒤로 뻗는 발) + 둥근 끝
      var foot = new T.Mesh(new T.CylinderGeometry(0.013, 0.013, 0.36, 12), gold);
      foot.rotation.x = Math.PI / 2; foot.position.set(x, 0.05, 0); g.add(foot);
      [-1, 1].forEach(function (d) {
        var cap = new T.Mesh(new T.SphereGeometry(0.019, 10, 8), gold);
        cap.position.set(x, 0.05, d * 0.18); g.add(cap);
      });
    });
    // 하단 크로스바(스트레처) + 가운데 터닝 장식
    var crossbar = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, px * 2, 12), gold);
    crossbar.rotation.z = Math.PI / 2; crossbar.position.set(0, 0.34, 0); g.add(crossbar);
    var orn = new T.Mesh(new T.SphereGeometry(0.028, 12, 10), gold);
    orn.scale.set(1, 1.5, 1); orn.position.set(0, 0.34, 0); g.add(orn);

    // 오벌 반사면(프레임 안)
    var ng = new T.CircleGeometry(orx - 0.06, 40); ng.scale(1, (ory - 0.06) / (orx - 0.06), 1);
    var nx = Math.sin(ry) * 0.04, nz = Math.cos(ry) * 0.04;
    this._addCubeMirror(mx + nx, cy, mz + nz, 0, 0, ry, 1, ng);
    // 뒷판(백킹) — 반사면이 단면이라 뒤에서 뚫려 보이는 것 방지
    var bg = new T.CircleGeometry(orx - 0.05, 40); bg.scale(1, (ory - 0.05) / (orx - 0.05), 1);
    var back = new T.Mesh(bg, new T.MeshStandardMaterial({ color: 0xE6DCC8, roughness: 0.6, metalness: 0.0, side: T.DoubleSide }));
    back.position.set(0, cy, 0.0); g.add(back);
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
  P._addFlowerCluster = function (x, y, z, scale, accent, parent) {
    var T = this.T, scene = parent || this.scene;
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
    // 덤불 높이를 낮춰 창 상단(아치)에는 울퉁불퉁한 잎이 안 비치게 — 사각 창부 위주로 채움
    for (var i = 0; i < 14; i++) {
      var bush = new T.Mesh(new T.IcosahedronGeometry(0.32 + Math.random() * 0.42, 1),
        new T.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 1.0, flatShading: true }));
      bush.position.set(wx + 0.8 + Math.random() * 1.8, 0.25 + Math.random() * 1.1, cz - 2.6 + Math.random() * 5.2);
      bush.scale.y = 0.8 + Math.random() * 0.4; scene.add(bush);
    }
    // 흰/핑크 장미 군집(창가 보타닉) — 낮게
    var rose = [0xF3D9DE, 0xF7EFE6, 0xEBC3CE];
    for (var r = 0; r < 18; r++) {
      var fl = new T.Mesh(new T.SphereGeometry(0.06 + Math.random() * 0.05, 8, 6),
        new T.MeshStandardMaterial({ color: rose[r % rose.length], roughness: 0.7 }));
      fl.position.set(wx + 0.5 + Math.random() * 1.0, 0.25 + Math.random() * 1.2, cz - 1.5 + Math.random() * 3.0); scene.add(fl);
    }
  };

  /* 보타닉 — 화분(트리/토피어리) + 책장+책 + 플로어 화병 */
  P._buildBotanic = function () {
    var T = this.T, scene = this.scene, self = this;
    var W = this.ROOM.W, D = this.ROOM.D;
    var greens = [0x7E9B68, 0x88A472, 0x6F8C5C, 0x9DB87E];
    // 잎 패턴 텍스처(타일) — 토피어리 구에 매핑해 실사 잎 질감(가벼움)
    function foliageTex() {
      if (self._foliageTexC) return self._foliageTexC;
      var c = document.createElement('canvas'); c.width = 128; c.height = 128; var g = c.getContext('2d');
      g.fillStyle = '#5E7B47'; g.fillRect(0, 0, 128, 128);
      for (var k = 0; k < 140; k++) {
        var lx = Math.random() * 128, ly = Math.random() * 128, ang = Math.random() * 6.28, len = 7 + Math.random() * 8;
        var shade = ['#6F8C54', '#7F9D63', '#536F40', '#8BAA6E'][k % 4];
        g.save(); g.translate(lx, ly); g.rotate(ang); g.fillStyle = shade;
        g.beginPath(); g.ellipse(0, 0, len * 0.45, len, 0, 0, 6.28); g.fill(); g.restore();
      }
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3); self._foliageTexC = t; return t;
    }
    function foliage_UNUSED(grp, cy, R, count, tint, leafLen) {
      var mat = new T.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.85, color: tint });
      var lg = new T.PlaneGeometry(leafLen * 0.62, leafLen);
      for (var i = 0; i < count; i++) {
        var leaf = new T.Mesh(lg, mat);
        var u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), rr = R * (0.55 + 0.45 * Math.random());
        leaf.position.set(rr * Math.sin(v) * Math.cos(u), cy + rr * Math.cos(v) * 0.85, rr * Math.sin(v) * Math.sin(u));
        leaf.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        leaf.castShadow = true; grp.add(leaf);
      }
    }
    // 고품질 토피어리 — Blender 제작 GLB(잎 디테일+세라믹 화분+장미)를 클론 배치
    var plantSpots = [];   // 화분(토피어리) 전부 삭제(요청) — 자리엔 아이보리 진열장 배치
    // 화분(세라믹) → 바닥과 동일한 대리석 재질
    var potMat = self._potMarbleMat || (self._potMarbleMat = (function () {
      var mt = self._marbleTex(); mt.wrapS = mt.wrapT = T.RepeatWrapping; mt.repeat.set(2, 2);
      var mb = self._marbleBump(); mb.wrapS = mb.wrapT = T.RepeatWrapping; mb.repeat.set(2, 2);
      return new T.MeshPhysicalMaterial({ map: mt, bumpMap: mb, bumpScale: 0.02, color: 0xFFFFFF, roughness: 0.3, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.8 });
    })());
    if (self.AD.GLTFLoader) {
      new self.AD.GLTFLoader().load(asset('topiary.glb'), function (gltf) {
        var src = gltf.scene; src.traverse(function (o) {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            var nm = (o.material && o.material.name) || '';
            if (/ceramic/i.test(nm)) o.material = potMat;   // 화분 → 대리석
          }
        });
        plantSpots.forEach(function (p) {
          var c = src.clone(true);
          c.position.set(p[0], 0, p[1]); c.scale.setScalar(p[2]); c.rotation.y = Math.random() * 6.28;
          scene.add(c);
        });
      }, undefined, function () { });
    }

    // 책장 + 책 (백벽 우측, 옷장 옆)
    (function () {
      var bx = W / 2 - 0.95, bz = -D / 2 + 0.28, bw = 1.4, bh = 1.9, dep = 0.32;
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
      var lx = W / 2 - 0.95, lz = -D / 2 + 0.28, ly = 1.9;
      var base = new T.Mesh(new T.BoxGeometry(0.13, 0.16, 0.13), new T.MeshStandardMaterial({ color: 0xCBA24A, metalness: 1.0, roughness: 0.3 }));
      base.position.set(lx + 0.4, ly + 0.08, lz); scene.add(base);
      var shade = new T.Mesh(new T.CylinderGeometry(0.15, 0.18, 0.18, 4),
        new T.MeshStandardMaterial({ color: 0xF6F0E2, roughness: 0.9, emissive: 0xF0E2C2, emissiveIntensity: 0.5, side: T.DoubleSide }));
      shade.rotation.y = Math.PI / 4; shade.position.set(lx + 0.4, ly + 0.28, lz); scene.add(shade);
      var bulb = new T.PointLight(0xFFE9C2, 6, 4, 2); bulb.position.set(lx + 0.4, ly + 0.28, lz); scene.add(bulb);
    })();

    // (제거) 팜파스 플로어 화병 — 사용자 요청
  };

  /* 빌트인 커튼 — Blender 천시뮬 드레이프 GLB를 빈 벽에 천장부터 내려오게.
   * 옷장 우측 벽 커튼에는 merryon 로고가 주름을 따라 들어간 logo 버전 사용. */
  P._buildCurtains = function () {
    var T = this.T, AD = this.AD, scene = this.scene;
    if (!AD.GLTFLoader) return;
    var W = this.ROOM.W, H = this.ROOM.H, D = this.ROOM.D;
    var AW = 3.84;
    var loader = new AD.GLTFLoader();
    // [파일, x, z, ry(실내향), 가로스케일] — 우측벽 커튼 제거(책장 자리), 로고는 옷장-책장 사이로
    var panels = [
      ['curtain_plain.glb', 2.65, -D / 2 + 0.12, 0, 1.3],                          // 옷장 우측(책장 사이) — 플레인
      ['curtain_logo.glb', -3.35, -D / 2 + 0.12, 0, 1.55],                         // 옷장 좌측(백벽) — 메리온 로고(오른쪽으로 더 펼침)
      ['curtain_plain.glb', -W / 2 + 0.12, 2.1, Math.PI / 2, 1.5],                 // 좌벽 앞쪽
      ['curtain_plain.glb', W / 2 - 0.12, -2.55, -Math.PI / 2, 1.05],              // 창 좌측(우벽) — 크림(베이스)
      ['curtain_plain.glb', W / 2 - 0.12, 2.55, -Math.PI / 2, 1.05],               // 창 우측(우벽) — 크림(베이스)
      // 짙은 베이지 레이어링 — 크림 위에 한 겹 더(방 안쪽으로 살짝 앞, 창쪽으로 당겨 겹침)
      ['curtain_plain.glb', W / 2 - 0.30, -2.10, -Math.PI / 2, 0.85, 0xB3A488],    // 창 좌측 짙은베이지
      ['curtain_plain.glb', W / 2 - 0.30, 2.10, -Math.PI / 2, 0.85, 0xB3A488]      // 창 우측 짙은베이지
    ];
    panels.forEach(function (p) {
      loader.load(asset(p[0]), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.material = o.material.clone(); o.material.side = T.DoubleSide;
            if (p[5] != null) o.material.color = new T.Color(p[5]);   // 짙은 베이지 오버라이드
          }
        });
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
    var bagG = new T.Group(); bagG.position.set(-0.436, 0.5, 0.332); bagG.rotation.y = 0.5; scene.add(bagG);
    if (AD.GLTFLoader) {
      new AD.GLTFLoader().load(asset('bag.glb'), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        s.position.y = 0.1; bagG.add(s);   // 바닥(좌석)에 앉게
      }, undefined, function () { });
    }
    // 아이폰(로즈골드) — 좌석 표면(가방과 동일 높이)에 그룹으로
    var phoneG = new T.Group(); phoneG.position.set(0.42, 0.54, 0.4); phoneG.rotation.y = -0.6; scene.add(phoneG);
    var phone = new T.Mesh(new T.BoxGeometry(0.075, 0.012, 0.155),
      new T.MeshStandardMaterial({ color: 0xE7B7A6, roughness: 0.28, metalness: 0.85 }));   // 로즈골드
    phone.position.y = 0.006; phone.castShadow = true; phoneG.add(phone);
    var screen = new T.Mesh(new T.PlaneGeometry(0.066, 0.142),
      new T.MeshStandardMaterial({ color: 0x2A3550, emissive: 0x223047, emissiveIntensity: 0.4, roughness: 0.2 }));
    screen.rotation.x = -Math.PI / 2; screen.position.y = 0.013; phoneG.add(screen);
    this._regProp('아이폰', phoneG);
    this._regProp('핸드백', bagG);
  };

  /* 소품 편집 등록 — 드래그 이동 + 위치 저장(localStorage) 대상. */
  P._regProp = function (name, obj) {
    this.editProps = this.editProps || [];
    var def = obj.position.clone();
    try { var all = JSON.parse(localStorage.getItem('MERRYON_PROP_POS') || '{}'); var s = all[name]; if (s && s.length === 3) obj.position.set(s[0], s[1], s[2]); } catch (e) {}
    this.editProps.push({ name: name, obj: obj, def: def });
  };

  /* 빈티지 보타닉 아트 패턴(캔버스) — 액자 안 그림 */
  P._artTex = function (seed) {
    var T = this.T;
    var c = document.createElement('canvas'); c.width = 128; c.height = 160; var g = c.getContext('2d');
    var bgs = ['#EFE6D2', '#E9DCE0', '#E4E7DC', '#F0E7D8', '#EDE3DA', '#E6E9E2'];
    g.fillStyle = bgs[seed % bgs.length]; g.fillRect(0, 0, 128, 160);
    var kind = seed % 6;
    if (kind === 0) { // 보타닉 가지
      var stem = '#7E8C5E', fl = '#D6A7B4'; g.strokeStyle = stem; g.lineWidth = 2;
      for (var b = 0; b < 3; b++) {
        var bx = 40 + b * 26; g.beginPath(); g.moveTo(bx, 140); g.quadraticCurveTo(bx + (b % 2 ? 16 : -16), 90, bx + (b % 2 ? -6 : 6), 40); g.stroke();
        for (var l = 0; l < 5; l++) { var ly = 124 - l * 20, lx = bx + (l % 2 ? 10 : -10); g.fillStyle = stem; g.beginPath(); g.ellipse(lx, ly, 7, 3.4, l % 2 ? 0.6 : -0.6, 0, 6.28); g.fill(); }
        g.fillStyle = fl; g.beginPath(); g.arc(bx + (b % 2 ? -6 : 6), 40, 9, 0, 6.28); g.fill();
      }
    } else if (kind === 1) { // 추상 수채 블롭
      var cols = ['rgba(198,150,170,0.5)', 'rgba(150,170,140,0.5)', 'rgba(210,180,140,0.5)', 'rgba(160,170,200,0.45)'];
      for (var i = 0; i < 7; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.ellipse(30 + Math.random() * 70, 30 + Math.random() * 100, 14 + Math.random() * 22, 12 + Math.random() * 18, Math.random() * 3, 0, 6.28); g.fill(); }
    } else if (kind === 2) { // 여성 측면 실루엣
      g.fillStyle = '#5A4A52'; g.beginPath();
      g.moveTo(48, 130); g.bezierCurveTo(40, 100, 44, 70, 60, 56); g.bezierCurveTo(66, 50, 64, 44, 70, 40);
      g.bezierCurveTo(86, 32, 92, 52, 86, 64); g.bezierCurveTo(94, 70, 90, 84, 80, 88); g.lineTo(82, 130); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(150,120,70,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(64, 80, 44, 0, 6.28); g.stroke();
    } else if (kind === 3) { // 다마스크(다이아 격자)
      g.strokeStyle = 'rgba(150,120,80,0.4)'; g.lineWidth = 1.4;
      for (var yy = 20; yy < 150; yy += 22) for (var xx = 18; xx < 116; xx += 22) { g.beginPath(); g.moveTo(xx, yy - 8); g.lineTo(xx + 8, yy); g.lineTo(xx, yy + 8); g.lineTo(xx - 8, yy); g.closePath(); g.stroke(); g.fillStyle = 'rgba(190,150,160,0.3)'; g.beginPath(); g.arc(xx, yy, 2.4, 0, 6.28); g.fill(); }
    } else if (kind === 4) { // 풍경(수평선/언덕)
      var sky = g.createLinearGradient(0, 12, 0, 150); sky.addColorStop(0, '#E8E2D0'); sky.addColorStop(0.6, '#DCD8C4'); sky.addColorStop(1, '#BFC6A8');
      g.fillStyle = sky; g.fillRect(12, 12, 104, 136);
      g.fillStyle = 'rgba(140,160,120,0.6)'; g.beginPath(); g.moveTo(12, 110); g.quadraticCurveTo(50, 92, 70, 106); g.quadraticCurveTo(95, 118, 116, 104); g.lineTo(116, 148); g.lineTo(12, 148); g.fill();
      g.fillStyle = 'rgba(120,140,100,0.55)'; g.beginPath(); g.moveTo(12, 126); g.quadraticCurveTo(48, 112, 80, 124); g.quadraticCurveTo(104, 132, 116, 122); g.lineTo(116, 148); g.lineTo(12, 148); g.fill();
    } else { // 꽃다발
      var rc = ['#D98AA0', '#E7B7A0', '#C98CA8', '#EAC9A0'];
      for (var f = 0; f < 9; f++) { g.fillStyle = rc[f % 4]; var fx = 44 + Math.random() * 40, fy = 50 + Math.random() * 50; g.beginPath(); g.arc(fx, fy, 7 + Math.random() * 5, 0, 6.28); g.fill(); }
      g.strokeStyle = '#7E8C5E'; g.lineWidth = 2; for (var s = 0; s < 5; s++) { g.beginPath(); g.moveTo(60 + s * 3, 140); g.lineTo(56 + s * 6, 90); g.stroke(); }
    }
    g.strokeStyle = 'rgba(150,120,70,0.5)'; g.lineWidth = 3; g.strokeRect(8, 8, 112, 144);
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  };

  /* 갤러리 월 — 앞벽(문 좌측)에 골드 액자(오벌/사각) 클러스터 + 보타닉 아트 */
  P._buildGalleryWall = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat, self = this;
    var W = this.ROOM.W, D = this.ROOM.D;
    var fz = D / 2 - 0.06, cx = -2.7;   // 앞벽, 문 좌측 중심
    // [상대x, y, w, h, oval]
    var frames = [
      [0.0, 1.85, 0.5, 0.62, false],
      [-0.66, 1.62, 0.42, 0.5, true],
      [0.64, 1.7, 0.36, 0.46, true],
      [-0.5, 1.12, 0.34, 0.42, false],
      [0.52, 1.16, 0.46, 0.34, false],
      [0.02, 1.14, 0.28, 0.36, true]
    ];
    frames.forEach(function (f, i) {
      var g = new T.Group(); g.position.set(cx + f[0], f[1], fz); g.rotation.y = Math.PI; scene.add(g);
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
    var W = this.ROOM.W;
    var g = new T.Group(); g.position.set(-W / 2 + 1.05, 0, 0.05); g.rotation.y = Math.PI / 2; scene.add(g); this._regProp('화장대 의자', g);   // 화장대(좌벽) 앞
    if (AD.GLTFLoader) {
      new AD.GLTFLoader().load(asset('chair.glb'), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        g.add(s);
      }, undefined, function () { });
    }
  };

  /* 주얼리 장(글라스 비트린) — 핀터레스트 프렌치 스타일: 크림 락커 우드 + 골드 트림 +
   * 유리 도어/측면 + 진열 선반 + 소품(목걸이 스탠드·링 트레이·주얼리 박스). 뒷벽 좌측 빈자리. */
  P._buildJewelryCabinet = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat;
    var D = this.ROOM.D;
    var g = new T.Group();
    var W = this.ROOM.W;
    g.position.set(-W / 2 + 0.4, 0, 4.3); g.rotation.y = Math.PI / 2; scene.add(g); this._regProp('주얼리 장식장', g);   // 화장대 벽 앞-코너

    var cream = new T.MeshPhysicalMaterial({ color: 0xF1E9D8, roughness: 0.42, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.7 });
    var glass = new T.MeshPhysicalMaterial({ color: 0xF4FAFF, roughness: 0.05, metalness: 0.0, transmission: 0.92, transparent: true, opacity: 0.22, thickness: 0.05, side: T.DoubleSide, envMapIntensity: 1.0 });
    var velvet = new T.MeshStandardMaterial({ color: 0x7C5A66, roughness: 0.95, metalness: 0.0 });   // 더스티 로즈 벨벳 내장

    var BW = 0.78, BH = 1.18, BD = 0.34, legH = 0.30;
    var bodyY0 = legH, bodyYc = legH + BH / 2, bodyY1 = legH + BH;

    // 다리 4개(테이퍼 + 골드 페럴)
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      var lx = sx * (BW / 2 - 0.06), lz = sz * (BD / 2 - 0.06);
      var leg = new T.Mesh(new T.CylinderGeometry(0.022, 0.014, legH, 12), cream);
      leg.position.set(lx, legH / 2, lz); leg.castShadow = true; g.add(leg);
      var fer = new T.Mesh(new T.SphereGeometry(0.016, 10, 8), gold); fer.position.set(lx, 0.012, lz); g.add(fer);
    }); });

    // 캐비닛 코어(측/배/천/바닥은 크림, 앞·옆은 유리로 별도) — 얇은 프레임 박스
    // 배면(벨벳 내장이 보이도록 안쪽은 벨벳)
    var back = new T.Mesh(new T.BoxGeometry(BW, BH, 0.03, 1, 1), cream);
    back.position.set(0, bodyYc, -BD / 2 + 0.015); back.castShadow = true; g.add(back);
    var backVel = new T.Mesh(new T.PlaneGeometry(BW - 0.06, BH - 0.06), velvet);
    backVel.position.set(0, bodyYc, -BD / 2 + 0.032); g.add(backVel);
    // 천장/바닥 패널
    [bodyY0 + 0.015, bodyY1 - 0.015].forEach(function (yy) {
      var pan = new T.Mesh(new T.BoxGeometry(BW, 0.03, BD), cream); pan.position.set(0, yy, 0); pan.castShadow = true; g.add(pan);
    });
    // 측면 기둥(코너 4개) — 크림 + 골드 인레이
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      var px = c[0] * (BW / 2 - 0.012), pz = c[1] * (BD / 2 - 0.012);
      var post = new T.Mesh(new T.BoxGeometry(0.028, BH, 0.028), cream); post.position.set(px, bodyYc, pz); g.add(post);
    });
    // 측면 유리
    [-1, 1].forEach(function (sx) {
      var sg = new T.Mesh(new T.PlaneGeometry(BD - 0.06, BH - 0.06), glass);
      sg.rotation.y = Math.PI / 2; sg.position.set(sx * (BW / 2 - 0.006), bodyYc, 0); g.add(sg);
    });

    // 진열 선반(유리) 3단 + 골드 선반 테두리
    var shelfYs = [bodyY0 + BH * 0.30, bodyY0 + BH * 0.56, bodyY0 + BH * 0.80];
    shelfYs.forEach(function (sy) {
      var sh = new T.Mesh(new T.BoxGeometry(BW - 0.07, 0.012, BD - 0.07), glass); sh.position.set(0, sy, 0); g.add(sh);
      var lip = new T.Mesh(new T.BoxGeometry(BW - 0.07, 0.006, 0.012), gold); lip.position.set(0, sy, BD / 2 - 0.05); g.add(lip);
    });

    // 유리 더블 도어(앞면) + 골드 프레임/세로 멀리언 + 손잡이 노브
    var doorY = bodyYc;
    var dz = BD / 2 - 0.004;
    var dg = new T.Mesh(new T.PlaneGeometry(BW - 0.05, BH - 0.05), glass); dg.position.set(0, doorY, dz); g.add(dg);
    // 프레임(상/하/좌/우 + 중앙)
    [[0, bodyY1 - 0.02, BW, 0.03], [0, bodyY0 + 0.02, BW, 0.03],
     [-BW / 2 + 0.02, doorY, 0.03, BH], [BW / 2 - 0.02, doorY, 0.03, BH],
     [0, doorY, 0.022, BH]].forEach(function (b) {
      var bar = new T.Mesh(new T.BoxGeometry(b[2], b[3], 0.022), gold); bar.position.set(b[0], b[1], dz); g.add(bar);
    });
    [-1, 1].forEach(function (s) {
      var knob = new T.Mesh(new T.SphereGeometry(0.016, 12, 10), gold); knob.position.set(s * 0.05, doorY, dz + 0.02); g.add(knob);
    });

    // 크라운 코니스 + 상단 골드 갤러리 레일 + 크레스트
    var crown = new T.Mesh(new T.BoxGeometry(BW + 0.06, 0.05, BD + 0.06), cream); crown.position.set(0, bodyY1 + 0.025, 0); crown.castShadow = true; g.add(crown);
    var rail = new T.Mesh(new T.TorusGeometry(0.03, 0.006, 8, 16), gold);
    var crest = new T.Mesh(new T.SphereGeometry(0.03, 12, 10), gold); crest.scale.set(1.6, 0.9, 0.6); crest.position.set(0, bodyY1 + 0.075, 0); g.add(crest);
    var crestArc = new T.Mesh(new T.TorusGeometry(0.05, 0.008, 8, 20, Math.PI), gold); crestArc.position.set(0, bodyY1 + 0.06, BD / 2 - 0.02); g.add(crestArc);

    // ---- 진열 소품 ----
    // 목걸이 스탠드(T자) + 체인(토러스) — 상단 선반
    (function () {
      var sy = shelfYs[2] + 0.006;
      var stand = new T.Group(); stand.position.set(-0.18, sy, 0); g.add(stand);
      var pole = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.16, 8), gold); pole.position.y = 0.08; stand.add(pole);
      var arm = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.14, 8), gold); arm.rotation.z = Math.PI / 2; arm.position.y = 0.15; stand.add(arm);
      var neck = new T.Mesh(new T.TorusGeometry(0.05, 0.004, 8, 24), new T.MeshStandardMaterial({ color: 0xF2D9A0, roughness: 0.3, metalness: 0.9 }));
      neck.scale.set(1, 1.3, 1); neck.position.y = 0.105; stand.add(neck);
      var pend = new T.Mesh(new T.SphereGeometry(0.01, 10, 8), new T.MeshStandardMaterial({ color: 0xE7B7C2, roughness: 0.2, metalness: 0.3 })); pend.position.y = 0.04; stand.add(pend);
    })();
    // 링 트레이 + 작은 링 3개 — 중단 선반
    (function () {
      var sy = shelfYs[1] + 0.006;
      var tray = new T.Mesh(new T.CylinderGeometry(0.07, 0.075, 0.018, 20), velvet); tray.position.set(0.14, sy + 0.009, 0); g.add(tray);
      var rim = new T.Mesh(new T.TorusGeometry(0.072, 0.005, 8, 24), gold); rim.rotation.x = Math.PI / 2; rim.position.set(0.14, sy + 0.018, 0); g.add(rim);
      for (var r = 0; r < 3; r++) {
        var ring = new T.Mesh(new T.TorusGeometry(0.012, 0.0035, 8, 16), gold);
        ring.rotation.x = Math.PI / 2.3; ring.position.set(0.10 + r * 0.04, sy + 0.022, (r - 1) * 0.025); g.add(ring);
      }
    })();
    // 주얼리 박스 + 향수 — 하단 선반
    (function () {
      var sy = shelfYs[0] + 0.006;
      var box = new T.Mesh(new T.BoxGeometry(0.12, 0.06, 0.09), new T.MeshPhysicalMaterial({ color: 0xE9DCC4, roughness: 0.4, clearcoat: 0.4 }));
      box.position.set(-0.16, sy + 0.03, 0); box.castShadow = true; g.add(box);
      var lid = new T.Mesh(new T.BoxGeometry(0.124, 0.012, 0.094), gold); lid.position.set(-0.16, sy + 0.066, 0); g.add(lid);
      var bottle = new T.Mesh(new T.BoxGeometry(0.05, 0.075, 0.035), new T.MeshPhysicalMaterial({ color: 0xF5D9DF, roughness: 0.08, transmission: 0.6, transparent: true, opacity: 0.7 }));
      bottle.position.set(0.12, sy + 0.038, 0); g.add(bottle);
      var cap = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.02, 10), gold); cap.position.set(0.12, sy + 0.086, 0); g.add(cap);
    })();
  };

  /* 2단 수납장(콘솔) + 마샬 스피커(바디 베이지) — 뒷벽 우측(커튼-책장 사이 빈 구간) */
  P._buildStorageAndSpeaker = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat;
    var D = this.ROOM.D;
    var g = new T.Group();
    g.position.set(1.6, 0, D / 2 - 0.36); g.rotation.y = Math.PI; scene.add(g); this._regProp('2단 수납장', g);   // 앞벽, 문 쪽

    var cream = new T.MeshPhysicalMaterial({ color: 0xEFE7D6, roughness: 0.42, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.7 });
    var panel = new T.MeshPhysicalMaterial({ color: 0xE7DDC8, roughness: 0.5, clearcoat: 0.3 });

    var BW = 1.0, BH = 0.80, BD = 0.42, legH = 0.16;
    var y0 = legH, y1 = legH + BH;

    // 다리 4(테이퍼 + 골드 페럴)
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      var lx = sx * (BW / 2 - 0.07), lz = sz * (BD / 2 - 0.07);
      var leg = new T.Mesh(new T.CylinderGeometry(0.026, 0.018, legH, 12), cream);
      leg.position.set(lx, legH / 2, lz); leg.castShadow = true; g.add(leg);
      var fer = new T.Mesh(new T.SphereGeometry(0.018, 10, 8), gold); fer.position.set(lx, 0.013, lz); g.add(fer);
    }); });

    // 캐비닛 바디
    var body = new T.Mesh(new T.BoxGeometry(BW, BH, BD), cream);
    body.position.set(0, (y0 + y1) / 2, 0); body.castShadow = true; body.receiveShadow = true; g.add(body);
    // 천판(살짝 오버행 + 골드 엣지)
    var top = new T.Mesh(new T.BoxGeometry(BW + 0.05, 0.03, BD + 0.05), cream);
    top.position.set(0, y1 + 0.015, 0); top.castShadow = true; g.add(top);
    var topEdge = new T.Mesh(new T.BoxGeometry(BW + 0.055, 0.006, BD + 0.055), gold);
    topEdge.position.set(0, y1 + 0.002, 0); g.add(topEdge);

    // 2단 × 2도어 = 4도어(패널 + 골드 노브) — 중앙 골드 디바이더(철판) 제거(요청)
    [0, 1].forEach(function (tier) {
      var cyc = y0 + BH * (tier === 0 ? 0.25 : 0.75);   // 하단/상단 중심
      [-1, 1].forEach(function (s) {
        var dw = BW / 2 - 0.03, dh = BH / 2 - 0.04;
        var door = new T.Mesh(new T.BoxGeometry(dw, dh, 0.02), panel);
        door.position.set(s * (BW / 4), cyc, BD / 2 - 0.005); g.add(door);
        // 골드 몰딩 테두리
        var fr = new T.Mesh(new T.BoxGeometry(dw + 0.012, dh + 0.012, 0.012), gold);
        fr.position.set(s * (BW / 4), cyc, BD / 2 - 0.012); g.add(fr);
        var face = new T.Mesh(new T.BoxGeometry(dw - 0.01, dh - 0.01, 0.016), panel);
        face.position.set(s * (BW / 4), cyc, BD / 2 - 0.001); g.add(face);
        // 노브(안쪽 모서리)
        var knob = new T.Mesh(new T.SphereGeometry(0.018, 12, 10), gold);
        knob.position.set(s * 0.06, cyc, BD / 2 + 0.012); g.add(knob);
      });
    });

    // ---- 마샬 스피커 (천판 위) — 바디 베이지, 다크 그릴, 골드 프렛/탑플레이트, 화이트 스크립트 ----
    (function () {
      var sg = new T.Group(); sg.position.set(0.0, y1 + 0.03, 0.0); g.add(sg);
      var beige = new T.MeshStandardMaterial({ color: 0xCEC0A2, roughness: 0.78, metalness: 0.0 });   // 텍스처드 비닐 베이지
      var grilleM = new T.MeshStandardMaterial({ color: 0x35322B, roughness: 0.9, metalness: 0.0 });   // 다크 그릴
      var brass = new T.MeshStandardMaterial({ color: 0xC9A24B, roughness: 0.35, metalness: 0.95 });
      var SW = 0.36, SH = 0.27, SD = 0.21;
      // 바디
      var box = new T.Mesh(new T.BoxGeometry(SW, SH, SD), beige);
      box.position.y = SH / 2; box.castShadow = true; box.receiveShadow = true;
      var bbev = box; // (베벨 없음 — 박스형)
      sg.add(box);
      // 프론트 그릴(앞면 패널, 살짝 인셋)
      var gr = new T.Mesh(new T.BoxGeometry(SW - 0.06, SH - 0.06, 0.012), grilleM);
      gr.position.set(0, SH / 2, SD / 2 - 0.004); sg.add(gr);
      // 골드 프렛 테두리(그릴 둘레 파이핑)
      var fw = SW - 0.05, fh = SH - 0.05, ft = 0.008;
      [[0, fh / 2, fw, ft], [0, -fh / 2, fw, ft], [-fw / 2, 0, ft, fh], [fw / 2, 0, ft, fh]].forEach(function (b) {
        var bar = new T.Mesh(new T.BoxGeometry(b[2], b[3], 0.014), brass); bar.position.set(b[0], SH / 2 + b[1], SD / 2 - 0.002); sg.add(bar);
      });
      // 화이트 'Marshall' 스크립트 로고(그릴 상단)
      var lc = document.createElement('canvas'); lc.width = 512; lc.height = 140;
      var lg = lc.getContext('2d'); lg.clearRect(0, 0, 512, 140);
      lg.fillStyle = '#F3F0E8'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
      lg.font = 'italic 900 92px Georgia, "Times New Roman", serif';
      lg.fillText('Marshall', 256, 78);
      var lt = new T.CanvasTexture(lc); lt.colorSpace = T.SRGBColorSpace; lt.anisotropy = 4;
      var logo = new T.Mesh(new T.PlaneGeometry(SW - 0.10, (SW - 0.10) * 140 / 512),
        new T.MeshBasicMaterial({ map: lt, transparent: true }));
      logo.position.set(0, SH * 0.7, SD / 2 + 0.002); sg.add(logo);
      // 탑 브라스 컨트롤 플레이트 + 노브들
      var plate = new T.Mesh(new T.BoxGeometry(SW - 0.05, 0.012, 0.07), brass);
      plate.position.set(0, SH + 0.002, -SD / 2 + 0.06); sg.add(plate);
      for (var k = 0; k < 4; k++) {
        var kn = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 0.016, 12), brass);
        kn.position.set(-SW / 2 + 0.08 + k * 0.07, SH + 0.012, -SD / 2 + 0.06); sg.add(kn);
      }
      // 탑 캐리 핸들(골드 스트랩 아치)
      var hpts = [new T.Vector3(-0.08, SH, 0.02), new T.Vector3(0, SH + 0.045, 0.02), new T.Vector3(0.08, SH, 0.02)];
      var handle = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(hpts), 14, 0.007, 6, false), brass);
      sg.add(handle);
      // 프론트 골드 코너 캡(4)
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) {
        var cap = new T.Mesh(new T.SphereGeometry(0.016, 10, 8), brass);
        cap.position.set(c[0] * (SW / 2 - 0.012), SH / 2 + c[1] * (SH / 2 - 0.012), SD / 2 - 0.01); sg.add(cap);
      });
    })();
  };

  /* 책장 앞 플로어 꽃병 — 클리어 글라스 화병 + 풍성한 핑크 피오니/로즈 부케 */
  P._buildBookshelfVase = function () {
    var T = this.T, scene = this.scene;
    var vx = 4.15, vz = -4.15;   // 책장(우측 백벽) 앞 바닥
    // 클리어 글라스 화병(테이퍼)
    // 프로스트 글라스 — 반투명이지만 또렷하게 보이게(꽃 떠보임 방지)
    var glass = new T.MeshPhysicalMaterial({
      color: 0xEAF1F4, roughness: 0.22, metalness: 0.0, transmission: 0.45,
      transparent: true, opacity: 0.72, thickness: 0.2, ior: 1.45, side: T.DoubleSide,
      clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 1.1, reflectivity: 0.6
    });
    var vase = new T.Mesh(new T.CylinderGeometry(0.16, 0.10, 0.36, 28), glass);
    vase.position.set(vx, 0.18, vz); scene.add(vase);
    var rim = new T.Mesh(new T.TorusGeometry(0.155, 0.008, 8, 28), glass);
    rim.rotation.x = Math.PI / 2; rim.position.set(vx, 0.36, vz); scene.add(rim);
    // 핑크 장미 부케만(초록 요소 제거) — 화병 입구까지 내려 틈 없이 채움
    if (this.AD.GLTFLoader) {
      new this.AD.GLTFLoader().load(asset('bouquet.glb'), function (gltf) {
        var s = gltf.scene; s.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        s.position.set(vx, 0.31, vz); s.scale.setScalar(1.0);   // 하단 꽃이 화병 림에 걸치게(떠보임 방지)
        scene.add(s);
      }, undefined, function () { });
    }
  };

  /* 앤틱 골드 행거 랙 + 드레이프 천(아이보리/핑크) — 레퍼런스 빈티지 가먼트 랙
   * 오너먼트 포스트(피니얼/컬러) + 가로 레일 + 훅 + Blender 천 GLB 여러 장 드레이프. */
  P._buildGoldRack = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat;
    var g = new T.Group();
    g.position.set(-4.9, 0, -3.3); g.rotation.y = Math.PI / 2; scene.add(g); this._regProp('골드 행거랙', g);   // 좌측 벽
    var goldS = new T.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1.0, roughness: 0.26, envMapIntensity: 1.3 });

    var HW = 0.72, PH = 1.62, railY = 1.5;   // 포스트 반폭 / 높이 / 레일 높이
    [-1, 1].forEach(function (s) {
      var px = s * HW;
      var post = new T.Mesh(new T.CylinderGeometry(0.026, 0.03, PH, 16), goldS);
      post.position.set(px, PH / 2, 0); post.castShadow = true; g.add(post);
      // 장식 컬러(링) 2단
      [0.5, 1.15].forEach(function (cy) {
        var ring = new T.Mesh(new T.TorusGeometry(0.034, 0.012, 10, 20), goldS);
        ring.rotation.x = Math.PI / 2; ring.position.set(px, cy, 0); g.add(ring);
      });
      // 상단 피니얼(어반/볼)
      var collar = new T.Mesh(new T.CylinderGeometry(0.04, 0.03, 0.03, 16), goldS); collar.position.set(px, PH + 0.015, 0); g.add(collar);
      var ball = new T.Mesh(new T.SphereGeometry(0.052, 16, 12), goldS); ball.position.set(px, PH + 0.075, 0); g.add(ball);
      var tip = new T.Mesh(new T.SphereGeometry(0.022, 12, 8), goldS); tip.position.set(px, PH + 0.13, 0); g.add(tip);
      // 받침(턴드 베이스 + 발)
      var base = new T.Mesh(new T.CylinderGeometry(0.04, 0.075, 0.04, 16), goldS); base.position.set(px, 0.02, 0); g.add(base);
      var foot = new T.Mesh(new T.SphereGeometry(0.06, 14, 10), goldS); foot.scale.set(1.5, 0.45, 1.5); foot.position.set(px, 0.012, 0); g.add(foot);
    });
    // 가로 레일 + 훅
    var rail = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, HW * 2 + 0.06, 16), goldS);
    rail.rotation.z = Math.PI / 2; rail.position.set(0, railY, 0); g.add(rail);
    for (var h = -5; h <= 5; h++) {
      var hook = new T.Mesh(new T.TorusGeometry(0.018, 0.005, 8, 16, Math.PI * 1.3), goldS);
      hook.position.set(h * 0.12, railY - 0.018, 0.0); hook.rotation.y = Math.PI / 2; g.add(hook);
    }

    // 드레이프 천(아이보리/핑크) — Blender GLB 여러 장
    if (this.AD.GLTFLoader) {
      var cloths = [
        [-0.22, 0xF2EBDD, 1.0, 0.02],   // [x, color, 높이scale, z] — 천 갯수 3→2(절반)
        [0.22, 0xE7BFCB, 1.05, -0.005]
      ];
      var loader = new this.AD.GLTFLoader();
      loader.load(asset('cloth.glb'), function (gltf) {
        cloths.forEach(function (c) {
          var s = gltf.scene.clone(true);
          s.traverse(function (o) {
            if (o.isMesh) {
              o.castShadow = true; o.receiveShadow = true;
              o.material = o.material.clone(); o.material.color = new T.Color(c[1]); o.material.side = T.DoubleSide;
            }
          });
          s.position.set(c[0], railY + 0.02, c[3]);          // 상단을 레일에 걸침
          s.scale.set(0.95 + Math.random() * 0.1, c[2], 1.0);
          s.rotation.y = (Math.random() - 0.5) * 0.12;
          g.add(s);
        });
      }, undefined, function () { });
    }
  };

  /* 빈티지 모노그램 스팀 트렁크 — 브라운 모노그램 캔버스 + 베이지 라스 스트립 + 브라스 하드웨어 */
  P._buildTrunk = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat;
    var g = new T.Group();
    g.position.set(-2.7, 0, 4.95); g.rotation.y = Math.PI; scene.add(g); this._regProp('트렁크', g);   // 앞벽 갤러리 액자 밑
    var W = 1.02, H = 0.5, D = 0.58;

    // 모노그램 캔버스 텍스처(브라운 + 탄 모티프 — 제너릭)
    var mono = this._canvas(512, function (ctx, S) {
      ctx.fillStyle = '#46331E'; ctx.fillRect(0, 0, S, S);
      var step = S / 5;
      function floret(cx, cy, r) {
        ctx.fillStyle = '#B89A62';
        for (var a = 0; a < 4; a++) {
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a * Math.PI / 2) * r * 0.9, cy + Math.sin(a * Math.PI / 2) * r * 0.9, r * 0.5, r * 0.32, a * Math.PI / 2, 0, 6.28);
          ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, 6.28); ctx.fill();
      }
      for (var gy = -1; gy * step < S + step; gy++)
        for (var gx = -1; gx * step < S + step; gx++) {
          var cx = gx * step + ((gy % 2) ? step / 2 : 0), cy = gy * step;
          floret(cx, cy, step * 0.17);
          // 사이 다이아몬드
          ctx.fillStyle = '#A98B55'; ctx.save(); ctx.translate(cx + step / 2, cy + step / 2); ctx.rotate(Math.PI / 4);
          ctx.fillRect(-step * 0.08, -step * 0.08, step * 0.16, step * 0.16); ctx.restore();
        }
    });
    mono.wrapS = mono.wrapT = T.RepeatWrapping; mono.repeat.set(3, 1.6);
    var bodyMat = new T.MeshStandardMaterial({ map: mono, color: 0xffffff, roughness: 0.62, metalness: 0.05 });
    var leather = new T.MeshStandardMaterial({ color: 0xC6A86A, roughness: 0.5, metalness: 0.0 });
    var brass = new T.MeshStandardMaterial({ color: 0xC9A24B, roughness: 0.32, metalness: 0.95 });

    // 본체
    var body = new T.Mesh(new T.BoxGeometry(W, H, D), bodyMat);
    body.position.y = H / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

    // 베이지 라스 — 가로 밴드(상단/뚜껑선/하단) : 본체보다 살짝 크게 감싸기
    [0.05, H * 0.72, H - 0.04].forEach(function (by) {
      var band = new T.Mesh(new T.BoxGeometry(W + 0.012, 0.045, D + 0.012), leather);
      band.position.y = by; g.add(band);
    });
    // 세로 라스 스트립(앞뒤 관통)
    for (var k = -2; k <= 2; k++) {
      var strip = new T.Mesh(new T.BoxGeometry(0.035, H + 0.004, D + 0.014), leather);
      strip.position.set(k * (W / 5.2), H / 2, 0); g.add(strip);
    }
    // 뚜껑선(살짝 진한 음영 띠)
    var seam = new T.Mesh(new T.BoxGeometry(W + 0.014, 0.012, D + 0.014), new T.MeshStandardMaterial({ color: 0x3A2A18, roughness: 0.7 }));
    seam.position.y = H * 0.72; g.add(seam);

    // 브라스 코너 캡(8)
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      [0.04, H - 0.04].forEach(function (cy) {
        var cap = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.07), brass);
        cap.position.set(c[0] * (W / 2 - 0.005), cy, c[1] * (D / 2 - 0.005)); g.add(cap);
      });
    });
    // 중앙 브라스 락 + 클래스프(앞면 +z)
    var lock = new T.Mesh(new T.BoxGeometry(0.11, 0.13, 0.02), brass);
    lock.position.set(0, H * 0.72, D / 2 + 0.006); g.add(lock);
    [-0.26, 0.26].forEach(function (lx) {
      var clasp = new T.Mesh(new T.BoxGeometry(0.06, 0.08, 0.018), brass);
      clasp.position.set(lx, H * 0.72, D / 2 + 0.006); g.add(clasp);
    });
    // 양옆 가죽+브라스 손잡이
    [-1, 1].forEach(function (s) {
      var handle = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 8, 18, Math.PI), leather);
      handle.rotation.y = Math.PI / 2; handle.rotation.z = Math.PI; handle.position.set(s * (W / 2 + 0.006), H * 0.5, 0); g.add(handle);
      [-1, 1].forEach(function (m) {
        var mnt = new T.Mesh(new T.BoxGeometry(0.02, 0.03, 0.025), brass);
        mnt.position.set(s * (W / 2 + 0.006), H * 0.5 + m * 0.05, 0); g.add(mnt);
      });
    });
    // 스터드(밴드 위 브라스 점) — 앞면 일부
    for (var sx = -2; sx <= 2; sx++) {
      [0.05, H - 0.04].forEach(function (sy) {
        var stud = new T.Mesh(new T.SphereGeometry(0.011, 8, 6), brass);
        stud.position.set(sx * (W / 5.0), sy, D / 2 + 0.006); g.add(stud);
      });
    }
  };

  /* 아이보리 잡화 진열장 — 빈티지 글라스 카운터(크림 우드 프레임 + 유리 + 계단식 선반 + 파스텔 잡화) */
  P._buildDisplayCase = function () {
    var T = this.T, scene = this.scene, gold = this.goldMat, D = this.ROOM.D;
    var g = new T.Group();
    g.position.set(-4.85, 0, -1.5); g.rotation.y = Math.PI / 2; scene.add(g); this._regProp('잡화 진열장', g);   // 좌벽, 화장대 왼쪽
    var CW = 1.7, CD = 0.52, CH = 0.82, plinth = 0.12;
    var cream = new T.MeshPhysicalMaterial({ color: 0xEFE7D6, roughness: 0.42, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.7 });
    var creamD = new T.MeshStandardMaterial({ color: 0xE4DAC6, roughness: 0.55 });
    var glass = new T.MeshPhysicalMaterial({ color: 0xEAF1F4, roughness: 0.06, metalness: 0.0, transmission: 0.9, transparent: true, opacity: 0.2, thickness: 0.05, side: T.DoubleSide, envMapIntensity: 1.0 });

    // 플린스 베이스 + 발
    var base = new T.Mesh(new T.BoxGeometry(CW, plinth, CD), cream); base.position.y = plinth / 2; base.castShadow = true; base.receiveShadow = true; g.add(base);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      var foot = new T.Mesh(new T.BoxGeometry(0.07, 0.04, 0.07), creamD);
      foot.position.set(c[0] * (CW / 2 - 0.06), 0.0, c[1] * (CD / 2 - 0.06)); foot.position.y = -0.0; g.add(foot);
    });
    var y0 = plinth, y1 = CH, yc = (y0 + y1) / 2;
    // 코너 포스트 + 상하 프레임 레일
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      var post = new T.Mesh(new T.BoxGeometry(0.04, y1 - y0, 0.04), cream);
      post.position.set(c[0] * (CW / 2 - 0.02), yc, c[1] * (CD / 2 - 0.02)); g.add(post);
    });
    [y0 + 0.02, y1].forEach(function (ry) {
      [[CW, 0.03, 0.04, 0, (CD / 2 - 0.02)], [CW, 0.03, 0.04, 0, -(CD / 2 - 0.02)],
       [0.04, 0.03, CD, (CW / 2 - 0.02), 0], [0.04, 0.03, CD, -(CW / 2 - 0.02), 0]].forEach(function (r) {
        var bar = new T.Mesh(new T.BoxGeometry(r[0], r[1], r[2]), cream); bar.position.set(r[3], ry, r[4]); g.add(bar);
      });
    });
    // 유리: 상판 + 정면(+z) + 양옆 + 후면
    var topG = new T.Mesh(new T.BoxGeometry(CW - 0.05, 0.014, CD - 0.05), glass); topG.position.y = y1 - 0.005; g.add(topG);
    var frontG = new T.Mesh(new T.PlaneGeometry(CW - 0.05, y1 - y0 - 0.04), glass); frontG.position.set(0, yc, CD / 2 - 0.006); g.add(frontG);
    var backG = new T.Mesh(new T.PlaneGeometry(CW - 0.05, y1 - y0 - 0.04), glass); backG.position.set(0, yc, -CD / 2 + 0.006); backG.rotation.y = Math.PI; g.add(backG);
    [-1, 1].forEach(function (s) {
      var sg = new T.Mesh(new T.PlaneGeometry(CD - 0.05, y1 - y0 - 0.04), glass);
      sg.rotation.y = s * Math.PI / 2; sg.position.set(s * (CW / 2 - 0.006), yc, 0); g.add(sg);
    });

    // 계단식 선반(3단) — 뒤가 높고 앞이 낮게(정면 +z로 갈수록 낮음) + 잡화
    var pastels = [0xCBB7D6, 0xE7C3CE, 0xBFD2C0, 0xEDE3CC, 0xBcd0e0, 0xE8C9A8, 0xD9B6C4];
    function good(parent, x, y, z, kind) {
      var col = pastels[(Math.random() * pastels.length) | 0];
      var m = new T.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05 });
      if (kind === 0) { // 슈즈 한 켤레(작은 둥근 박스 2)
        [-1, 1].forEach(function (s) {
          var sh = new T.Mesh(new T.BoxGeometry(0.05, 0.035, 0.1), m); sh.position.set(x + s * 0.035, y + 0.018, z); sh.rotation.y = s * 0.2;
          var bev = sh; parent.add(sh);
        });
      } else if (kind === 1) { // 가방(박스 + 손잡이)
        var bag = new T.Mesh(new T.BoxGeometry(0.09, 0.07, 0.04), m); bag.position.set(x, y + 0.035, z); parent.add(bag);
        var hd = new T.Mesh(new T.TorusGeometry(0.022, 0.005, 8, 14, Math.PI), gold); hd.position.set(x, y + 0.07, z); parent.add(hd);
      } else if (kind === 2) { // 책 스택(얇은 박스 2-3)
        for (var b = 0; b < 3; b++) {
          var bk = new T.Mesh(new T.BoxGeometry(0.13, 0.022, 0.09), new T.MeshStandardMaterial({ color: pastels[(Math.random() * pastels.length) | 0], roughness: 0.7 }));
          bk.position.set(x, y + 0.012 + b * 0.024, z); bk.rotation.y = (Math.random() - 0.5) * 0.2; parent.add(bk);
        }
      } else { // 향수/소품(작은 박스+골드 캡)
        var bo = new T.Mesh(new T.BoxGeometry(0.05, 0.08, 0.035), m); bo.position.set(x, y + 0.04, z); parent.add(bo);
        var cap = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.02, 10), gold); cap.position.set(x, y + 0.09, z); parent.add(cap);
      }
    }
    var steps = [[0.56, -0.12], [0.42, 0.04], [0.28, 0.2]];   // [선반 y, z(정면쪽)]
    steps.forEach(function (st, si) {
      var sy = st[0], sz = st[1];
      var shelf = new T.Mesh(new T.BoxGeometry(CW - 0.08, 0.018, CD * 0.42), creamD);
      shelf.position.set(0, sy, sz); shelf.receiveShadow = true; g.add(shelf);
      var kinds = [0, 1, 2, 3, 1, 0];
      for (var n = 0; n < 5; n++) {
        good(g, -CW / 2 + 0.18 + n * ((CW - 0.36) / 4), sy + 0.009, sz, kinds[(n + si) % kinds.length]);
      }
    });
  };

  /* 임시 사람 목업(약 1.7m 여성 실루엣) — 옷 사이즈 가늠용. 런칭 전 _buildMannequin 호출 제거. */
  P._buildMannequin = function () {
    var T = this.T, scene = this.scene;
    var g = new T.Group(); g.position.set(2.3, 0, -3.6); g.rotation.y = 0; scene.add(g);   // 옷장 앞(가늠용)
    this._regProp('사람 목업', g);
    var skin = new T.MeshStandardMaterial({ color: 0xD9CFC0, roughness: 0.85, metalness: 0.0 });
    // 토르소(여성 실루엣) — LatheGeometry
    var prof = [[0.001, 0.96], [0.16, 0.97], [0.135, 1.05], [0.11, 1.13], [0.118, 1.21], [0.155, 1.30], [0.16, 1.37], [0.14, 1.43], [0.06, 1.47], [0.001, 1.47]];
    var pts = prof.map(function (p) { return new T.Vector2(p[0], p[1]); });
    var torso = new T.Mesh(new T.LatheGeometry(pts, 28), skin); torso.castShadow = true; torso.receiveShadow = true; g.add(torso);
    // 목 + 머리
    var neck = new T.Mesh(new T.CylinderGeometry(0.034, 0.04, 0.08, 16), skin); neck.position.y = 1.50; g.add(neck);
    var head = new T.Mesh(new T.SphereGeometry(0.092, 20, 16), skin); head.scale.set(0.92, 1.12, 0.92); head.position.y = 1.61; head.castShadow = true; g.add(head);
    var bun = new T.Mesh(new T.SphereGeometry(0.05, 14, 12), skin); bun.position.set(0, 1.66, -0.07); g.add(bun);   // 낮은 번(머리)
    // 어깨 + 팔(약간 벌림)
    [-1, 1].forEach(function (s) {
      var arm = new T.Mesh(new T.CylinderGeometry(0.036, 0.026, 0.54, 14), skin);
      arm.position.set(s * 0.18, 1.15, 0.0); arm.rotation.z = s * 0.11; arm.castShadow = true; g.add(arm);
      var hand = new T.Mesh(new T.SphereGeometry(0.033, 12, 10), skin); hand.position.set(s * 0.215, 0.89, 0); g.add(hand);
    });
    // 골반 + 다리 + 발
    var pelvis = new T.Mesh(new T.SphereGeometry(0.155, 18, 14), skin); pelvis.scale.set(1.05, 0.55, 0.82); pelvis.position.y = 0.95; g.add(pelvis);
    [-1, 1].forEach(function (s) {
      var leg = new T.Mesh(new T.CylinderGeometry(0.062, 0.04, 0.9, 16), skin);
      leg.position.set(s * 0.07, 0.49, 0); leg.castShadow = true; g.add(leg);
      var foot = new T.Mesh(new T.BoxGeometry(0.07, 0.04, 0.17), skin); foot.position.set(s * 0.07, 0.025, 0.04); g.add(foot);
    });
  };

  /* ----------------------------------------------------------------------- *
   * 더스티 로즈 오발 러그
   * ----------------------------------------------------------------------- */
  P._buildRug = function () {
    var T = this.T, scene = this.scene;
    var RX = 0.0, RZ = -1.3;   // 소파 앞(소파~옷장 사이 빈 바닥)
    var rugTex = this._herringboneFab('#D7CDBC', '96,84,68');
    rugTex.wrapS = rugTex.wrapT = T.RepeatWrapping; rugTex.repeat.set(8, 8);
    var rugBump = this._rugBump(); rugBump.repeat.set(8, 8);
    var rug = new T.Mesh(new T.CircleGeometry(1.7, 64),
      new T.MeshStandardMaterial({ map: rugTex, bumpMap: rugBump, bumpScale: 0.01, color: 0xffffff, roughness: 1.0, metalness: 0.0 }));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.0, 0.8, 1.0);
    rug.position.set(RX, 0.015, RZ);
    rug.receiveShadow = true;
    scene.add(rug);
    // 골드 보더
    var border = new T.Mesh(new T.RingGeometry(1.62, 1.7, 64),
      new T.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5, metalness: 0.6 }));
    border.rotation.x = -Math.PI / 2; border.scale.set(1.0, 0.8, 1.0);
    border.position.set(RX, 0.02, RZ);
    scene.add(border);

    // 러그 중앙 merryon 블랙 심볼 로고 — cut() 으로 동일출처(GitHub Pages=로컬, 운영=cafe24).
    // crossOrigin 미설정(표시만 필요, 픽셀 read 안 함) → CORS 헤더 없어도 로드 성공.
    var logoUrl = cut('up', '블랙 심볼.png');
    var ldr = new T.TextureLoader();
    ldr.load(logoUrl, function (tex) {
      tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
      var asp = (tex.image && tex.image.width / tex.image.height) || 1;
      var lw = 0.95, lh = lw / asp;
      var lp = new T.Mesh(new T.PlaneGeometry(lw, lh),
        new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.9, metalness: 0.0, depthWrite: false }));
      lp.rotation.x = -Math.PI / 2; lp.rotation.z = 0;   // 바닥에 눕히기(추가 180° 회전 → 정방향)
      lp.position.set(RX, 0.028, RZ); lp.renderOrder = 3;
      scene.add(lp);
    }, undefined, function () { });

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
    if (this._lite) { this.composer = null; return; }   // 라이트: 포스트프로세싱 생략(plain render)
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

    // SSAO 제거 — 알파컷 의류 가장자리에 PC에서만 울퉁불퉁 헤일로 생겨서(모바일=SSAO 없음) 끔
    // if (!this.isMobile) { var ssao = new AD.SSAOPass(...); ssao.kernelRadius=0.12; ...; composer.addPass(ssao); }

    var bloom = new AD.UnrealBloomPass(new T.Vector2(w, h), 0.7, 0.6, 0.9);
    bloom.threshold = 0.92; bloom.strength = this.isMobile ? 0.15 : 0.2; bloom.radius = 0.5;
    composer.addPass(bloom);
    this.bloom = bloom;

    // Bokeh(DoF) 제거 — 전체화면 블러 패스 비용 대비 효과 미미(성능)

    var smaa = new AD.SMAAPass(w, h);
    composer.addPass(smaa);

    // 핀터레스트 컬러그레이드 — 핑크베이지 화밸 + 스플릿톤(핑크 쉐도우/크림 하이라이트) + 필름 페이드/그레인
    var GradeShader = {
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uRes: { value: new T.Vector2(w, h) },
        uWarm: { value: new T.Vector3(1.065, 1.0, 0.965) },   // 핑크베이지 화이트밸런스
        uSat: { value: 0.84 },                                // 필름 느낌 채도↓
        uContrast: { value: 0.09 },                           // 페이드 필름(대비 약)
        uVig: { value: 0.83 },
        uGrain: { value: 0.032 },                             // 그레인↑(필름)
        uSplitS: { value: new T.Vector3(0.050, 0.018, 0.030) },  // 쉐도우 핑크
        uSplitH: { value: new T.Vector3(0.038, 0.024, 0.004) },  // 하이라이트 크림
        uLift: { value: 0.05 }                                // 블랙 페이드(웜)
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;',
        'uniform vec3 uWarm; uniform float uSat; uniform float uContrast; uniform float uVig; uniform float uGrain;',
        'uniform vec3 uSplitS; uniform vec3 uSplitH; uniform float uLift;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
        '  c *= uWarm;',                                              // 핑크베이지 화이트밸런스
        '  float l = dot(c, vec3(0.299,0.587,0.114));',
        '  c = mix(vec3(l), c, uSat);',                              // 채도↓
        '  c = mix(c, c*c*(3.0-2.0*c), uContrast);',                // 부드러운 대비
        '  c += uSplitS*(1.0-l) + uSplitH*l;',                      // 스플릿톤(핑크 쉐도우+크림 하이라이트)
        '  c = mix(c, vec3(1.0,0.93,0.88), uLift*(1.0-smoothstep(0.0,0.38,l)));',  // 블랙 페이드(필름)
        '  vec2 q = vUv - 0.5;',
        '  float vig = smoothstep(0.95, 0.32, length(q)*1.28);',
        '  c *= mix(uVig, 1.0, vig);',                              // 비네팅
        '  float g = fract(sin(dot(vUv*uRes + uTime, vec2(12.9898,78.233))) * 43758.5453);',
        '  c += (g - 0.5) * uGrain;',                               // 필름 그레인
        '  gl_FragColor = vec4(max(c, 0.0), 1.0);',
        '}'
      ].join('\n')
    };
    // OutputPass(톤매핑+sRGB) 먼저 → 그 다음 그레이드(디스플레이 공간 0..1에서 안전하게 적용)
    composer.addPass(new AD.OutputPass());

    var grade = new AD.ShaderPass(GradeShader);
    composer.addPass(grade);
    this.gradePass = grade;

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
    this.cam = { theta: 0, phi: 1.373, phiInit: 1.373, radius: 3.4, targetTheta: 0, targetPhi: 1.373 };   // 초기 상하각(하향 틸트 ~11°)
    this.pointer = { x: 0, y: 0 };          // -1..1 (호버 패럴랙스, 좌우만)
    this.drag = { active: false, lastX: 0, lastY: 0, theta: 0 };
    this.lastInteract = -10;
    this.gyro = { active: false, tilt: 0, betaNeutral: null };   // 상하(phi)는 기기 틸트로만

    var DEG = Math.PI / 180;
    // 좌우(theta) 360° 무제한 = 드래그/스크롤만. 상하(phi) = 기기 틸트만(데스크탑은 초기각 고정).
    this.LIMIT = { theta: Infinity, hover: 6 * DEG, phiMin: 1.15, phiMax: 1.66 };

    function rect() { return el.getBoundingClientRect(); }

    el.addEventListener('pointermove', function (e) {
      if (self._propEdit) return;   // 소품 편집 모드: 오빗 정지
      var r = rect();
      self.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      self.pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (self.drag.active) {
        var dx = e.clientX - self.drag.lastX;
        var dy = e.clientY - self.drag.lastY;
        self.drag.lastX = e.clientX; self.drag.lastY = e.clientY;
        self.drag.theta += dx * 0.005;   // 좌우(theta)만 — 세로 드래그는 상하에 영향 없음
        self.drag.theta = Math.max(-self.LIMIT.theta, Math.min(self.LIMIT.theta, self.drag.theta));
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) dragMoved = true;
        self.lastInteract = self.elapsed;
      } else {
        self.lastInteract = self.elapsed;
      }
    });
    el.addEventListener('pointerdown', function (e) {
      if (self._propEdit) return;   // 소품 편집 모드: 오빗 비활성(소품 드래그가 처리)
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
      if (self._propEdit || !e.touches.length) return;
      tStartX = e.touches[0].clientX; tTheta = self.drag.theta;
      self.lastInteract = self.elapsed;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (self._propEdit || !e.touches.length) return;
      var dx = e.touches[0].clientX - tStartX;
      self.drag.theta = Math.max(-self.LIMIT.theta, Math.min(self.LIMIT.theta, tTheta + dx * 0.006));
      self.lastInteract = self.elapsed;
    }, { passive: true });

    /* DeviceOrientation beta(앞뒤 틸트) → 상하(phi). 처음 값을 중립으로 잡고 델타만 사용. */
    function onOrient(e) {
      if (e.beta == null) return;
      self.gyro.active = true;
      if (self.gyro.betaNeutral == null) self.gyro.betaNeutral = e.beta;
      var d = Math.max(-40, Math.min(40, e.beta - self.gyro.betaNeutral));
      self.gyro.tilt = (d / 40) * 0.28;   // 뒤로 기울이면 위로, 앞으로 기울이면 아래로(±~16°)
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
    if (this.gradePass) this.gradePass.uniforms.uRes.value.set(w, h);
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
      var start = new T.Vector3(0, 1.58, 3.3);   // 인트로 시작 높이도 10%↓
      var camPos = new T.Vector3().lerpVectors(start, settle, this._ease(p));
      this.camera.position.copy(camPos);
      this.camera.lookAt(this.target);

      // fog density (옅게 시작 → 거의 걷힘)
      this.scene.fog.density = 0.09 + (0.022 - 0.09) * this._ease(p);
      // 샹들리에 0 → 1.2 (은은하게)
      var inten = 2.1 * this._ease(p);
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
        // 카메라를 향하되 ±26°로 제한 → 넓은 평면이 옆 옷을 관통하지 않게(뚫림 방지)
        var yaw = Math.atan2(cp.x - wp.x, cp.z - wp.z);
        yaw = Math.max(-0.45, Math.min(0.45, yaw));
        bb.rotation.y = yaw + (bb.userData.tilt || 0);
      }
    }

    /* ---- 루프 앰비언트 ---- */
    this._updateAmbient(t);

    /* ---- CubeCamera 반사 (프레임 분산) ---- */
    if (!this.isMobile && !this._lite && this.cubeMirrors.length) {
      var idx = this._frame % (this.cubeMirrors.length * 3);
      if (idx < this.cubeMirrors.length) {
        var cm = this.cubeMirrors[idx];
        cm.mesh.visible = false;
        cm.cam.update(this.renderer, this.scene);
        cm.mesh.visible = true;
      }
    }

    if (this.gradePass) this.gradePass.uniforms.uTime.value = this.elapsed;
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

    // 좌우(theta): 드래그/스크롤 + 마우스 호버 패럴랙스만(자이로는 좌우에 영향 없음)
    var base = this.drag.theta;
    var hover = this.pointer.x * this.LIMIT.hover;
    this.cam.targetTheta = Math.max(-this.LIMIT.theta, Math.min(this.LIMIT.theta, base + hover));
    // 상하(phi): 기기 틸트(자이로)로만 — 자이로 없으면 초기각 고정
    var phi = this.cam.phiInit + (this.gyro.active ? this.gyro.tilt : 0);
    this.cam.targetPhi = Math.max(this.LIMIT.phiMin, Math.min(this.LIMIT.phiMax, phi));

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
