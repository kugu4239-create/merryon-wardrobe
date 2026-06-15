# MERRYON · Virtual Powder Room & Wardrobe (3D Hero)

merryon.co.kr 메인 페이지 배경을 채우는 **풀스크린 3D 가상 파우더룸 + 옷장** 씬입니다.
Three.js r165 로 구축했으며, 옷장 안 의류는 **실제 merryon.co.kr 상품 사진**을 텍스처로
매핑하고 카메라/기기 틸트에 따라 깊이별로 **패럴랙스**됩니다.

## 파일

| 파일 | 용도 |
|------|------|
| `wardrobe-site.js` | 메인 스크립트(IIFE). Cafe24 스킨에 업로드. |
| `snippet.html` | 메인 템플릿 `</body>` 직전에 넣을 `<script>` 2줄. |
| `main_card1.css.snippet` | `main_card1.css` 에 추가할 CSS. |
| `demo.html` | 로컬 테스트용(실제 Cafe24 구조 재현). |

## Cafe24 적용 (3단계)

1. **JS 업로드** — `[디자인 관리 > 파일 업로더]` 로 `wardrobe-site.js` 를 스킨 루트에 업로드.
   업로드 경로에 맞춰 `snippet.html` 의 `src="/wardrobe-site.js"` 만 수정.
2. **HTML 2줄 추가** — 메인 페이지 템플릿 `</body>` 직전에 `snippet.html` 내용 붙여넣기.
   기존 `.main_image_1_wrapper → .main_image_1_background_link → .main_image_1_background
   → .main_image_1_overlay` 구조는 **수정하지 않습니다.**
3. **CSS 추가** — `main_card1.css.snippet` 내용을 `main_card1.css` 끝에 추가.

스크립트는 `document.querySelector('.main_image_1_background')` 안에 `<canvas>` 를
자동 삽입하고, 컨테이너 크기 기준으로 렌더 사이즈를 잡습니다.

## 로컬 테스트

```bash
cd wardrobe-site
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080/demo.html
```

> 상품 이미지는 `//merryon.co.kr/web/product/medium/...` (스토어와 동일 도메인)을
> 참조합니다. 배포 환경(merryon.co.kr)에서는 same-origin 이라 CORS 문제가 없습니다.
> 로컬 데모에서는 일부 이미지가 핫링크 차단될 수 있으나, 실패 시 브랜드 팔레트 색
> 폴백으로 자연스럽게 대체됩니다.

## 구현 요약

- **공간** 14×9×13m 파우더룸 · 헤링본 파케이 바닥(데스크탑 `Reflector` 실시간 반사)
  · 크림 패브릭 벽 + 금장 몰딩(베이스보드/체어레일/크라운) + 웨인스코팅 패널
  · 로제트 메달리온 천장.
- **샹들리에** 골드 암 + 크리스탈 32개, `UnrealBloomPass` 로 빛번짐.
- **창문** 쉬폰 커튼 wave morph + `DirectionalLight`/`LightProbe` 따뜻한 자연광.
- **가구** 오픈 아르무아(내부 `SpotLight`) · 바니티(대리석 상판·골드 레그·아치 거울
  `CubeCamera` 반사·`transmission` 향수병 5개) · 풀렝스 플로어 미러(`CubeCamera`)
  · 핑크 벨벳 오스만(`sheen` 최대) · 로즈우드 페데스탈 + 꽃다발 · 모자 박스 스택
  · 더스티 로즈 오발 러그.
- **의류 12벌** 실제 상품 사진 패널 + 골드 와이어 행거. 깊이 스태거로 패럴랙스 깊이감.
- **파이프라인** `RenderPass → SSAO → UnrealBloom → Bokeh → SMAA → Output`,
  `RoomEnvironment` PMREM envMap(외부 HDR 파일 불필요).
- **인트로** 천장 샹들리에 클로즈업 → 사선 하강 → 메인 뷰 안착(≈2.5s),
  fog 0.12→0.026, 샹들리에 0→2.5 페이드인. 이후 ±35° 자동 오실레이션.
- **인터랙션** 마우스 호버 패럴랙스(±25°) / 드래그 오빗(±130°) ·
  모바일 터치 스와이프 · `DeviceOrientationEvent`(iOS 13+ 권한 처리) ·
  4.5s 무조작 시 자동 오실레이션 복귀.
- **성능** `devicePixelRatio` ≤ 2, 모바일은 SSAO·Bokeh·Reflector·CubeCamera 비활성 +
  쉐도우맵 축소, 캔버스 텍스처 ≤ 512.

## 기술 메모

- 호스트 HTML 에 importmap 을 넣을 필요가 없도록, `wardrobe-site.js` 가 실행 시
  importmap 을 주입한 뒤 `three` / `three/addons/*` 를 **동적 import** 합니다.
  덕분에 Cafe24 템플릿에는 CDN `three.min.js` 와 본 스크립트 **2줄만** 추가하면 됩니다.
- envMap 은 외부 HDR 의존을 없애기 위해 `RoomEnvironment` + `PMREMGenerator` 를
  사용합니다(스튜디오 톤). HDRI 파일을 직접 쓰려면 `RGBELoader` 로 교체 가능합니다.
- 의류 매핑은 `PRODUCTS` 배열에서 관리합니다. 시즌마다 `src`(상품 medium 썸네일 경로)와
  `tint`(로드 실패 폴백색)만 교체하면 됩니다.
