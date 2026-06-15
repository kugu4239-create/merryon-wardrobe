# 의류 3D 에셋 파이프라인 (Blender → GLB)

merryon 옷장 씬(`wardrobe-site.js`)에 거는 의류는 Blender 천 시뮬레이션 + 실제 의류 패턴
기법으로 제작한다. 메인 스크립트는 **`wardrobe_garments.py`**.

## 제작 방식 (wardrobe_garments.py)
- **마네킹**: UV 구체 토르소(가슴/허리 테이퍼) + 목/팔 실린더, 전부 Collision.
- **몸판**: 앞·뒤 2D 패턴을 sewing spring 으로 봉제해 드레이프(Cloth, 80프레임 베이크).
- **소매**:
  - 일반 반소매 = **리지드 테이퍼 튜브**(천 시뮬 X → 퍼프 없이 깔끔).
  - 긴팔 = 천 시뮬 드레이프.
  - 민소매 = 없음.
- **PK(폴로) 카라**: 넥라인을 따라 일관된 바깥 법선으로 세운 뒤 어깨로 접힌 턴다운 카라 +
  앞중심 플래킷(단추단) + 골드 단추.
- **밑단 슬릿 스커트**: 한쪽 옆선 아랫부분을 미봉제 → 슬릿. 허리에서 클립 옷걸이로.
- **겉시접 마감(핵심)**: 옆선·밑단·어깨·암홀·커프스·플래킷의 시접을 **바깥으로 눌러 집은
  플랜지(flange) + 윗실 탑스티치**로 표현. 베이크 후 변형 정점을 읽어 정확히 그린다.
- **팔레트**: 블랙 / 네이비 / 밝은 베이지 / 크림 / 로즈 핑크 / 화이트.
- **저폴리**: NX=10, subsurf render_levels=1, 리지드 반소매 → 웹 로드 가능.

## 실행
```bash
# bpy 4.2 (python 3.11), 텍스처 /tmp/tex/fabric256/ (256px, CC0 Fabric070)
python3.11 wardrobe_garments.py 0   # 그룹0(옷0~3) → w2_0.png + w2_0.glb
python3.11 wardrobe_garments.py 1   # 그룹1(옷4~7)
python3.11 wardrobe_garments.py 2   # 그룹2(옷8~11)
```
결과 GLB(`w2_0..2.glb`)를 `assets/garments/` 로 커밋. 런타임에 `wardrobe-site.js`
의 `_loadGarmentGLBs` 가 불러와 각 파트를 가장 가까운 옷 슬롯에 배정 후 봉에 분배한다.

## 참고 스크립트
- `pk_prototype.py` — PK 카라 원피스 1벌 단독 검증용(렌더 미리보기).
- `hq_garments.py`, `sleeve_test.py` — 초기 버전(퍼프 소매·내부 마감). 보관용.
