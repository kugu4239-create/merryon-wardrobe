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
      import('three/addons/postprocessing/OutputPass.js')
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
        OutputPass: mods[11].OutputPass
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
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
    this.renderer = renderer;

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

    var camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 8, 0.001);
    this.camera = camera;
    this.target = new T.Vector3(0, 2.4, -1.5);

    AD.RectAreaLightUniformsLib.init();

    /* --- 환경맵 (RoomEnvironment, 외부 파일 불필요) --------------------- */
    var pmrem = new T.PMREMGenerator(renderer);
    var envTex = pmrem.fromScene(new AD.RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    this.envTex = envTex;

    /* --- 구성 ----------------------------------------------------------- */
    this.crystals = [];
    this.flowers = [];
    this.cubeMirrors = [];
    this.garmentGroup = null;

    this._buildLights();
    this._buildRoom();
    this._buildCeilingAndChandelier();
    this._buildWindowAndCurtain();
    this._buildArmoire();
    this._buildVanity();
    this._buildFloorMirror();
    this._buildOttoman();
    this._buildPedestalFlowers();
    this._buildHatBoxes();
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
    c.width = c.height = Math.min(size, 512);
    draw(c.getContext('2d'), c.width);
    var tex = new this.T.CanvasTexture(c);
    tex.colorSpace = this.T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  P._hex = function (n) { var s = n.toString(16); return '#' + '000000'.slice(s.length) + s; };

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
    var T = this.T, scene = this.scene;

    var amb = new T.AmbientLight(0xFFF5E8, 0.5);
    scene.add(amb);

    // 샹들리에 포인트 라이트 × 2 (인트로에서 0 → 2.5 페이드인)
    this.chandLights = [];
    var p1 = new T.PointLight(0xFFE8CC, 0.0, 26, 2);
    p1.position.set(-0.6, 6.6, -1.0);
    var p2 = new T.PointLight(0xFFE8CC, 0.0, 26, 2);
    p2.position.set(0.6, 6.6, -1.0);
    if (!this.isMobile) {
      p1.castShadow = p2.castShadow = true;
      p1.shadow.mapSize.set(1024, 1024); p2.shadow.mapSize.set(1024, 1024);
      p1.shadow.bias = p2.shadow.bias = -0.0006;
    }
    scene.add(p1, p2);
    this.chandLights.push(p1, p2);

    // 창문 자연광 (오른쪽 벽)
    var win = new T.RectAreaLight(0xE8F4FF, 3.0, 3.2, 4.2);
    win.position.set(6.7, 4.2, 1.5);
    win.lookAt(0, 3, 0);
    scene.add(win);

    var dir = new T.DirectionalLight(0xFFF0DC, 1.1);
    dir.position.set(9, 7, 4);
    dir.target.position.set(-1, 2, -2);
    if (!this.isMobile) {
      dir.castShadow = true;
      var sm = this.isMobile ? 512 : 2048;
      dir.shadow.mapSize.set(sm, sm);
      dir.shadow.camera.left = -10; dir.shadow.camera.right = 10;
      dir.shadow.camera.top = 10; dir.shadow.camera.bottom = -10;
      dir.shadow.camera.near = 1; dir.shadow.camera.far = 30;
      dir.shadow.bias = -0.0004;
    }
    scene.add(dir, dir.target);
    this.sunLight = dir;

    // LightProbe (부드러운 환경 채움)
    var probe = new T.LightProbe();
    probe.sh.coefficients[0].setScalar(0.6);
    scene.add(probe);

    // 바니티 미러 위
    var vm = new T.RectAreaLight(0xFFD4CC, 1.5, 1.6, 1.2);
    vm.position.set(-5.0, 3.6, -2.2);
    vm.lookAt(-5.0, 1.5, 0);
    scene.add(vm);

    // 옷장 내부 스포트
    var sp = new T.SpotLight(0xFFF5E8, 0.8, 16, Math.PI / 4.5, 0.5, 1.4);
    sp.position.set(0, 6.2, -2.0);
    sp.target.position.set(0, 2.2, -5.2);
    scene.add(sp, sp.target);
    this.armoireSpot = sp;
  };

  /* ----------------------------------------------------------------------- *
   * 룸 셸 (바닥/벽/몰딩/웨인스코팅)
   * ----------------------------------------------------------------------- */
  P._buildRoom = function () {
    var T = this.T, scene = this.scene, AD = this.AD;
    var W = 14, H = 9, D = 13;
    this.ROOM = { W: W, H: H, D: D };

    var goldMat = new T.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.2 });
    this.goldMat = goldMat;
    var goldLightMat = new T.MeshStandardMaterial({ color: PALETTE.goldLight, metalness: 0.9, roughness: 0.35 });

    /* 바닥: Reflector(데스크탑) + 헤링본 반투명 오버레이 */
    var floorTex = this._herringbone();
    floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
    floorTex.repeat.set(7, 7);
    var floorBump = this._woodBump(); floorBump.repeat.set(7, 7);

    if (!this.isMobile) {
      var reflector = new AD.Reflector(new T.PlaneGeometry(W, D), {
        textureWidth: 1024, textureHeight: 1024,
        color: 0x6f6356, clipBias: 0.003
      });
      reflector.rotation.x = -Math.PI / 2;
      reflector.position.y = 0.0;
      scene.add(reflector);
      this.reflector = reflector;

      var overlay = new T.Mesh(new T.PlaneGeometry(W, D),
        new T.MeshStandardMaterial({ map: floorTex, bumpMap: floorBump, bumpScale: 0.008, transparent: true, opacity: 0.84, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.6 }));
      overlay.rotation.x = -Math.PI / 2;
      overlay.position.y = 0.012;
      overlay.receiveShadow = true;
      scene.add(overlay);
    } else {
      var floor = new T.Mesh(new T.PlaneGeometry(W, D),
        new T.MeshStandardMaterial({ map: floorTex, bumpMap: floorBump, bumpScale: 0.008, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.8 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
    }

    /* 벽 */
    var wallTex = this._fabricWall();
    wallTex.wrapS = wallTex.wrapT = T.RepeatWrapping;
    wallTex.repeat.set(4, 3);
    var wallBump = this._velvetBump(); wallBump.repeat.set(16, 12);
    var wallMat = new T.MeshStandardMaterial({ map: wallTex, bumpMap: wallBump, bumpScale: 0.004, color: PALETTE.ivory, roughness: 0.95, metalness: 0.0 });

    function wall(w, h, x, y, z, ry) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
      scene.add(m); return m;
    }
    wall(W, H, 0, H / 2, -D / 2, 0);                 // 뒷벽
    wall(D, H, -W / 2, H / 2, 0, Math.PI / 2);       // 좌벽
    wall(D, H, W / 2, H / 2, 0, -Math.PI / 2);       // 우벽

    /* 몰딩: 베이스보드 / 체어레일 / 크라운 — 뒷·좌·우 벽 */
    var self = this;
    function moldRun(width, x, z, ry, y, depth, height) {
      var g = new T.BoxGeometry(width, height, depth);
      var m = new T.Mesh(g, goldLightMat);
      m.position.set(x, y, z); m.rotation.y = ry;
      m.castShadow = false; m.receiveShadow = true;
      scene.add(m);
    }
    var runs = [
      { w: W, x: 0, z: -D / 2 + 0.06, ry: 0 },
      { w: D, x: -W / 2 + 0.06, z: 0, ry: Math.PI / 2 },
      { w: D, x: W / 2 - 0.06, z: 0, ry: Math.PI / 2 }
    ];
    runs.forEach(function (r) {
      moldRun(r.w, r.x, r.z, r.ry, 0.18, 0.16, 0.36);   // 베이스보드
      moldRun(r.w, r.x, r.z, r.ry, 2.6, 0.10, 0.12);    // 체어레일
      moldRun(r.w, r.x, r.z, r.ry, H - 0.35, 0.22, 0.5); // 크라운
    });

    /* 웨인스코팅 패널 (뒷벽) — 얕은 프레임 박스 */
    var panelMat = new T.MeshStandardMaterial({ color: PALETTE.offwhite, roughness: 0.85, metalness: 0.0 });
    var frameMat = goldLightMat;
    var pCount = 5, pw = 1.7, ph = 1.7, gap = (W - pCount * pw) / (pCount + 1);
    for (var i = 0; i < pCount; i++) {
      var px = -W / 2 + gap + pw / 2 + i * (pw + gap);
      // 뒷벽 좌우 가장자리에만 (중앙 옷장 영역 제외)
      if (px > -3 && px < 3) continue;
      var panel = new T.Mesh(new T.BoxGeometry(pw, ph, 0.05), panelMat);
      panel.position.set(px, 1.35, -D / 2 + 0.05);
      scene.add(panel);
      var fr = new T.Mesh(new T.BoxGeometry(pw + 0.12, ph + 0.12, 0.03), frameMat);
      fr.position.set(px, 1.35, -D / 2 + 0.03);
      scene.add(fr);
    }
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

    // 로제트 메달리온
    var medMat = new T.MeshStandardMaterial({ color: PALETTE.offwhite, roughness: 0.9 });
    var med = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 0.12, 48), medMat);
    med.position.set(0, H - 0.06, -1.0);
    scene.add(med);
    for (var r = 0; r < 3; r++) {
      var ring = new T.Mesh(new T.TorusGeometry(0.5 + r * 0.42, 0.05, 12, 48), medMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, H - 0.10, -1.0);
      scene.add(ring);
    }

    /* 샹들리에 */
    var chand = new T.Group();
    chand.position.set(0, H - 0.2, -1.0);
    scene.add(chand);
    this.chandelier = chand;

    var gold = this.goldMat;
    var stem = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.2, 12), gold);
    stem.position.y = -0.6; chand.add(stem);

    var hub = new T.Mesh(new T.SphereGeometry(0.22, 20, 16), gold);
    hub.position.y = -1.2; chand.add(hub);

    // 크리스탈 머티리얼 (밝게 빛나 Bloom 유발)
    var crystalMat = new T.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.0, roughness: 0.02,
      transmission: 1.0, thickness: 0.4, ior: 1.6,
      transparent: true, opacity: 0.9,
      emissive: 0xFFE8CC, emissiveIntensity: 0.35,
      envMapIntensity: 1.6
    });
    this.crystalMat = crystalMat;

    var crystalGeo = new T.OctahedronGeometry(0.11, 0);
    var dropGeo = new T.ConeGeometry(0.05, 0.18, 6);

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
    var core = new T.Mesh(new T.SphereGeometry(0.16, 16, 12),
      new T.MeshBasicMaterial({ color: 0xFFF1D8 }));
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

    // 창틀
    var frameMat = this.goldMat;
    var fr = new T.Mesh(new T.BoxGeometry(0.2, 5.2, 4.6), frameMat);
    fr.position.set(wx, 4.2, 1.5);
    scene.add(fr);
    // 창 유리 (빛나는 패널)
    var glass = new T.Mesh(new T.PlaneGeometry(4.0, 4.6),
      new T.MeshBasicMaterial({ color: 0xEAF5FF }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(wx - 0.11, 4.2, 1.5);
    scene.add(glass);
    this.windowGlass = glass;
    // 멀리언
    for (var m = -1; m <= 1; m++) {
      var bar = new T.Mesh(new T.BoxGeometry(0.06, 5.0, 0.08), frameMat);
      bar.position.set(wx - 0.12, 4.2, 1.5 + m * 1.3); scene.add(bar);
    }
    var hbar = new T.Mesh(new T.BoxGeometry(0.06, 0.08, 4.4), frameMat);
    hbar.position.set(wx - 0.12, 4.2, 1.5); scene.add(hbar);

    // 쉬폰 커튼 — 세그먼트 plane, 정점 wave morph
    var cg = new T.PlaneGeometry(4.6, 5.4, 24, 12);
    var cmat = new T.MeshPhysicalMaterial({
      color: PALETTE.offwhite, roughness: 0.6, transmission: 0.6,
      thickness: 0.2, transparent: true, opacity: 0.55, side: T.DoubleSide,
      sheen: 1.0, sheenColor: new T.Color(0xFFF4E8)
    });
    var curtain = new T.Mesh(cg, cmat);
    curtain.rotation.y = -Math.PI / 2;
    curtain.position.set(wx - 0.25, 4.0, 1.5);
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
    var AW = 5.0, AH = 7.0, AD_ = 0.9;
    var zBack = -D / 2 + 0.1;

    var lacquer = new T.MeshPhysicalMaterial({ color: PALETTE.cream, roughness: 0.35, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
    var goldEdge = this.goldMat;

    var arm = new T.Group();
    arm.position.set(0, 0, zBack);
    scene.add(arm);

    // 내부 후면 패널
    var back = new T.Mesh(new T.BoxGeometry(AW, AH, 0.1), new T.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.7 }));
    back.position.set(0, AH / 2, 0.02); arm.add(back);

    // 좌우 측면 + 상하
    function slab(w, h, d, x, y, z) {
      var s = new T.Mesh(new T.BoxGeometry(w, h, d), lacquer);
      s.position.set(x, y, z); s.castShadow = true; s.receiveShadow = true; arm.add(s); return s;
    }
    slab(0.18, AH, AD_, -AW / 2, AH / 2, AD_ / 2);
    slab(0.18, AH, AD_, AW / 2, AH / 2, AD_ / 2);
    slab(AW + 0.36, 0.2, AD_, 0, AH, AD_ / 2);
    slab(AW + 0.36, 0.3, AD_, 0, 0.15, AD_ / 2);
    // 중앙 선반(상단)
    slab(AW, 0.08, AD_ * 0.9, 0, AH * 0.62, AD_ / 2);

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

    // 의류 패널 배치
    var group = new T.Group();
    arm.add(group);
    this.garmentGroup = group;

    var loader = new T.TextureLoader();
    loader.crossOrigin = 'anonymous';
    var n = PRODUCTS.length;
    var spanW = AW - 0.7;
    var cardW = 0.62, cardH = 1.55;
    var topY = AH * 0.78 - 0.12;

    for (var i = 0; i < n; i++) {
      var prod = PRODUCTS[i];
      var fx = -spanW / 2 + (spanW) * (i / (n - 1));
      // 깊이 스태거 → 패럴랙스 깊이감
      var fz = AD_ * 0.5 + (i % 3) * 0.06;

      var gc = new T.Group();
      gc.position.set(fx, topY, fz);
      group.add(gc);

      // 골드 와이어 행거
      this._buildHanger(gc, T);

      // 의류 사진 패널 (살짝 곡면)
      var planeGeo = new T.PlaneGeometry(cardW, cardH, 6, 1);
      var pos = planeGeo.attributes.position;
      for (var v = 0; v < pos.count; v++) {
        var xx = pos.getX(v);
        pos.setZ(v, -Math.abs(xx) * 0.12);   // 가운데가 앞으로 살짝 곡
      }
      pos.needsUpdate = true; planeGeo.computeVertexNormals();

      var mat = new T.MeshPhysicalMaterial({
        color: 0xffffff, roughness: prod.rough, metalness: 0.0,
        sheen: prod.sheen, sheenRoughness: 0.5,
        sheenColor: new T.Color(0xffffff),
        side: T.DoubleSide, envMapIntensity: 0.7
      });
      // 폴백 색 우선 적용
      mat.color.setHex(prod.tint);

      var panel = new T.Mesh(planeGeo, mat);
      panel.position.set(0, -cardH / 2 - 0.18, 0);
      panel.castShadow = true;
      gc.add(panel);

      (function (material) {
        loader.load(prod.src,
          function (tex) {
            tex.colorSpace = T.SRGBColorSpace;
            tex.anisotropy = 4;
            material.map = tex;
            material.color.setHex(0xffffff);
            material.needsUpdate = true;
          },
          undefined,
          function () { /* 실패 시 tint 유지 */ }
        );
      })(mat);
    }
  };

  P._buildHanger = function (parent, T) {
    var gold = this.goldMat;
    var hook = new T.Mesh(new T.TorusGeometry(0.06, 0.012, 8, 16, Math.PI), gold);
    hook.position.y = 0.07; parent.add(hook);
    var neck = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.1, 8), gold);
    neck.position.y = 0.0; parent.add(neck);
    // 어깨 삼각 와이어
    var shape = new T.Shape();
    shape.moveTo(0, 0); shape.lineTo(-0.33, -0.16); shape.lineTo(0.33, -0.16); shape.lineTo(0, 0);
    var bar = new T.Mesh(new T.TubeGeometry(
      new T.CatmullRomCurve3([
        new T.Vector3(-0.33, -0.16, 0), new T.Vector3(0, -0.02, 0), new T.Vector3(0.33, -0.16, 0)
      ]), 12, 0.012, 6, false), gold);
    parent.add(bar);
    var crossbar = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.66, 8), gold);
    crossbar.rotation.z = Math.PI / 2; crossbar.position.y = -0.16; parent.add(crossbar);
  };

  /* ----------------------------------------------------------------------- *
   * 바니티 (아치 거울 + 대리석 상판 + 골드 레그 + 향수병 + 꽃)
   * ----------------------------------------------------------------------- */
  P._buildVanity = function () {
    var T = this.T, scene = this.scene;
    var bx = -5.4, bz = -2.4;

    var marbleTex = this._marbleTex();
    var marbleMat = new T.MeshPhysicalMaterial({ map: marbleTex, bumpMap: this._marbleBump(), bumpScale: 0.02, color: PALETTE.marble, roughness: 0.18, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
    var gold = this.goldMat;

    var top = new T.Mesh(new T.BoxGeometry(2.2, 0.12, 1.1), marbleMat);
    top.position.set(bx, 1.5, bz); top.castShadow = true; top.receiveShadow = true;
    scene.add(top);

    // 테이퍼드 골드 레그 ×4
    var legPos = [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]];
    legPos.forEach(function (lp) {
      var leg = new T.Mesh(new T.CylinderGeometry(0.04, 0.07, 1.44, 12), gold);
      leg.position.set(bx + lp[0], 0.74, bz + lp[1]); leg.castShadow = true;
      scene.add(leg);
    });

    // 아치형 거울 프레임 + CubeCamera 반사
    var arch = new T.Shape();
    arch.moveTo(-0.8, 0); arch.lineTo(-0.8, 1.4);
    arch.absarc(0, 1.4, 0.8, Math.PI, 0, true);
    arch.lineTo(0.8, 0); arch.lineTo(-0.8, 0);
    var frameMat = gold;
    var frameMesh = new T.Mesh(new T.ExtrudeGeometry(arch, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }), frameMat);
    frameMesh.position.set(bx, 1.6, bz - 0.5);
    scene.add(frameMesh);

    this._addCubeMirror(bx, 2.6, bz - 0.45, 1.4, 2.0, 0, 0.78);

    // 향수병 5개 (transmission glass)
    var glassMat = new T.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.05,
      transmission: 1.0, thickness: 0.5, ior: 1.5,
      transparent: true, envMapIntensity: 1.4
    });
    var tints = [PALETTE.blush, PALETTE.lavender, PALETTE.goldLight, 0xEAD7E0, PALETTE.sage];
    for (var i = 0; i < 5; i++) {
      var bottleMat = glassMat.clone();
      bottleMat.color = new T.Color(tints[i]).lerp(new T.Color(0xffffff), 0.4);
      var bh = 0.22 + (i % 3) * 0.08;
      var body = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, bh, 16), bottleMat);
      var ox = bx - 0.7 + i * 0.34, oz = bz - 0.1 + (i % 2) * 0.12;
      body.position.set(ox, 1.56 + bh / 2, oz); body.castShadow = true;
      scene.add(body);
      var cap = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.08, 12), gold);
      cap.position.set(ox, 1.56 + bh + 0.04, oz);
      scene.add(cap);
    }

    // 바니티 위 작은 꽃
    this._addFlowerCluster(bx + 0.85, 1.62, bz + 0.05, 0.5, PALETTE.blush);
  };

  /* CubeCamera 실시간 반사 거울 평면 */
  P._addCubeMirror = function (x, y, z, w, h, ry, scale) {
    var T = this.T, scene = this.scene;
    if (this.isMobile) {
      // 모바일: 정적 env 반사
      var m = new T.Mesh(new T.PlaneGeometry(w, h),
        new T.MeshStandardMaterial({ color: 0xf3eee6, metalness: 1.0, roughness: 0.08, envMapIntensity: 1.5 }));
      m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
      return;
    }
    var rt = new T.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
    var cubeCam = new T.CubeCamera(0.1, 50, rt);
    cubeCam.position.set(x, y, z);
    scene.add(cubeCam);
    var mat = new T.MeshStandardMaterial({ envMap: rt.texture, metalness: 1.0, roughness: 0.04, color: 0xffffff });
    var mirror = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    mirror.position.set(x, y, z); mirror.rotation.y = ry;
    scene.add(mirror);
    this.cubeMirrors.push({ cam: cubeCam, mesh: mirror });
  };

  /* ----------------------------------------------------------------------- *
   * 풀렝스 플로어 미러 (우측, 아치 골드 프레임)
   * ----------------------------------------------------------------------- */
  P._buildFloorMirror = function () {
    var T = this.T, scene = this.scene;
    var mx = 5.2, mz = -1.6;
    var gold = this.goldMat;

    var arch = new T.Shape();
    arch.moveTo(-1.0, 0); arch.lineTo(-1.0, 2.4);
    arch.absarc(0, 2.4, 1.0, Math.PI, 0, true);
    arch.lineTo(1.0, 0); arch.lineTo(-1.0, 0);
    var frame = new T.Mesh(new T.ExtrudeGeometry(arch, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 3 }), gold);
    frame.position.set(mx, 0.1, mz);
    frame.rotation.y = -0.5;
    frame.castShadow = true;
    scene.add(frame);

    var off = new T.Vector3(Math.sin(-0.5) * 0.1, 0, Math.cos(-0.5) * 0.1);
    this._addCubeMirror(mx - off.x, 1.9, mz - off.z + 0.1, 1.9, 3.0, -0.5, 1.0);
  };

  /* ----------------------------------------------------------------------- *
   * 핑크 벨벳 오스만 (중앙, sheen 최대)
   * ----------------------------------------------------------------------- */
  P._buildOttoman = function () {
    var T = this.T, scene = this.scene;
    var velvetTex = this._velvetTex('#F3D2D0');
    velvetTex.wrapS = velvetTex.wrapT = T.RepeatWrapping; velvetTex.repeat.set(3, 1);
    var velvet = new T.MeshPhysicalMaterial({
      map: velvetTex, bumpMap: this._velvetBump(), bumpScale: 0.006,
      color: 0xffffff, roughness: 0.85, metalness: 0.0,
      sheen: 1.0, sheenRoughness: 0.25,
      sheenColor: new T.Color(0xFFC9D6), clearcoat: 0.0, envMapIntensity: 0.5
    });
    var grp = new T.Group();
    grp.position.set(0, 0, 1.6);
    scene.add(grp);

    var seat = new T.Mesh(new T.CylinderGeometry(1.1, 1.15, 0.55, 40), velvet);
    seat.position.y = 0.62; seat.castShadow = true; seat.receiveShadow = true; grp.add(seat);
    // 텁트(tufted) 버튼
    var btnMat = new T.MeshStandardMaterial({ color: PALETTE.deeprose, roughness: 0.7 });
    var btn = new T.Mesh(new T.SphereGeometry(0.06, 12, 10), btnMat);
    btn.position.set(0, 0.9, 0); grp.add(btn);
    // 골드 다리
    var gold = this.goldMat;
    for (var a = 0; a < 6; a++) {
      var ang = (a / 6) * Math.PI * 2;
      var leg = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 0.4, 10), gold);
      leg.position.set(Math.cos(ang) * 0.95, 0.2, Math.sin(ang) * 0.95);
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
    var rugTex = this._rugTex('#CFA9A6');
    rugTex.wrapS = rugTex.wrapT = T.RepeatWrapping; rugTex.repeat.set(8, 8);
    var rugBump = this._rugBump(); rugBump.repeat.set(8, 8);
    var rug = new T.Mesh(new T.CircleGeometry(3.2, 64),
      new T.MeshStandardMaterial({ map: rugTex, bumpMap: rugBump, bumpScale: 0.015, color: 0xffffff, roughness: 1.0, metalness: 0.0 }));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.0, 0.72, 1.0);
    rug.position.set(0, 0.02, 1.2);
    rug.receiveShadow = true;
    scene.add(rug);
    // 골드 보더
    var border = new T.Mesh(new T.RingGeometry(3.0, 3.18, 64),
      new T.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5, metalness: 0.6 }));
    border.rotation.x = -Math.PI / 2; border.scale.set(1.0, 0.72, 1.0);
    border.position.set(0, 0.025, 1.2);
    scene.add(border);
  };

  /* ----------------------------------------------------------------------- *
   * 포스트프로세싱 파이프라인
   *   RenderPass → SSAO → UnrealBloom → Bokeh → SMAA → Output
   * ----------------------------------------------------------------------- */
  P._setupComposer = function () {
    var T = this.T, AD = this.AD;
    var w = Math.max(1, this.container.clientWidth || window.innerWidth);
    var h = Math.max(1, this.container.clientHeight || window.innerHeight);

    var composer = new AD.EffectComposer(this.renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    composer.setSize(w, h);

    composer.addPass(new AD.RenderPass(this.scene, this.camera));

    if (!this.isMobile) {
      var ssao = new AD.SSAOPass(this.scene, this.camera, w, h);
      ssao.kernelRadius = 0.6; ssao.minDistance = 0.002; ssao.maxDistance = 0.1;
      composer.addPass(ssao);
      this.ssao = ssao;
    }

    var bloom = new AD.UnrealBloomPass(new T.Vector2(w, h), 0.7, 0.6, 0.85);
    bloom.threshold = 0.85; bloom.strength = this.isMobile ? 0.5 : 0.75; bloom.radius = 0.6;
    composer.addPass(bloom);
    this.bloom = bloom;

    if (!this.isMobile) {
      var bokeh = new AD.BokehPass(this.scene, this.camera, { focus: 6.0, aperture: 0.0009, maxblur: 0.008, width: w, height: h });
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

    // 카메라 구면 파라미터
    this.cam = { theta: 0, phi: 1.12, radius: 5.8, targetTheta: 0, targetPhi: 1.12 };
    this.pointer = { x: 0, y: 0 };          // -1..1 (호버 패럴랙스)
    this.drag = { active: false, lastX: 0, lastY: 0, theta: 0 };
    this.lastInteract = -10;
    this.gyro = { active: false, gamma: 0 };

    var DEG = Math.PI / 180;
    this.LIMIT = { theta: 130 * DEG, hover: 25 * DEG, phiMin: 0.9, phiMax: 1.3 };

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
        self.lastInteract = self.elapsed;
      } else {
        self.lastInteract = self.elapsed;
      }
    });
    el.addEventListener('pointerdown', function (e) {
      self.drag.active = true; self.drag.lastX = e.clientX; self.drag.lastY = e.clientY;
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
      var p = t / 2.5;
      if (p >= 1) { p = 1; this.introDone = true; }
      // 키프레임: (0,8,0) → (2,4,3)@1.2s → 메인뷰
      var camPos = new T.Vector3();
      var settle = this._spherical(this.cam.theta, this.cam.phi, this.cam.radius);
      if (p < 0.48) {
        var k = this._ease(p / 0.48);
        camPos.lerpVectors(new T.Vector3(0, 8, 0.001), new T.Vector3(2, 4, 3), k);
      } else {
        var k2 = this._ease((p - 0.48) / 0.52);
        camPos.lerpVectors(new T.Vector3(2, 4, 3), settle, k2);
      }
      this.camera.position.copy(camPos);
      this.camera.lookAt(this.target);

      // fog density 0.12 → 0.026
      this.scene.fog.density = 0.12 + (0.026 - 0.12) * this._ease(p);
      // 샹들리에 0 → 2.5
      var inten = 2.5 * this._ease(p);
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
    var idle = t - this.lastInteract;
    var DEG = Math.PI / 180;

    // 4.5초 무조작 → 자동 오실레이션 (±35°, 8초 주기 ease-in-out)
    if (idle > 4.5) {
      var osc = Math.sin((t * Math.PI * 2) / 8);
      // ease-in-out 형태로 정점 부드럽게
      osc = osc * (0.5 + 0.5 * Math.abs(osc)) / 1.0;
      this.cam.targetTheta = osc * 35 * DEG;
      this.cam.targetPhi += (1.12 - this.cam.targetPhi) * 0.02;
    } else {
      // 사용자 입력 기반
      var base = this.drag.theta;
      if (this.gyro.active) base += (this.gyro.gamma / 45) * 60 * DEG;
      var hover = this.pointer.x * this.LIMIT.hover;   // ±25° 호버 패럴랙스
      this.cam.targetTheta = Math.max(-this.LIMIT.theta, Math.min(this.LIMIT.theta, base + hover));
      this.cam.targetPhi += (-this.pointer.y * 0.12) * 0.06;
      this.cam.targetPhi = Math.max(this.LIMIT.phiMin, Math.min(this.LIMIT.phiMax, this.cam.targetPhi));
    }

    // radius 살짝 호흡
    this.cam.radius = 5.8 + Math.sin(t * 0.3) * 0.12;

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
