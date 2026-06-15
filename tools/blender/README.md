# 의류 3D 에셋 파이프라인 (Blender → GLB)

merryon 옷장 씬(`wardrobe-site.js`)에 거는 의류는 Blender 천 시뮬레이션으로 제작한다.

## 제작 방식
- **마네킹**: UV 구체를 토르소로 변형(가슴/허리 테이퍼) + 목/팔 실린더, 전부 Collision.
- **옷**: 앞·뒤 2D 패턴(grid)을 만들고 어깨/옆선을 **sewing spring**으로 봉제,
  마네킹 위에 드레이프(Cloth 시뮬레이션, 90프레임 베이크). Marvelous Designer 방식.
- **소매**: long / short / none. 팔 위에 천 튜브를 드레이프해 진동(armhole)에 겹쳐 핀 고정.
- **마감(정석 봉제)**: 넥라인 바인딩 · 어깨 봉제선 · 암홀 링 · 소매 커프스 ·
  옆선(앞뒤판) 봉제 · 밑단 헴. 옆선/밑단은 베이크 후 변형 정점을 읽어 그린다.
- **옷걸이**: 어깨에서 봉으로 올라가는 골드 와이어 + 후크(torus)를 옷마다 부착.
- **팔레트**: 블랙 / 네이비 / 밝은 베이지 / 크림 / 로즈 핑크 (총 13벌).

## 실행
```bash
# bpy 4.2 (python 3.11) 필요. CC0 패브릭 텍스처는 /tmp/tex/fabric256/ (256px).
python3.11 hq_garments.py 0   # 그룹 0 (옷 0~3)  → hq_0.png(미리보기) + hq_0.glb
python3.11 hq_garments.py 1   # 그룹 1 (옷 4~7)
python3.11 hq_garments.py 2   # 그룹 2 (옷 8~11)
python3.11 hq_garments.py 3   # 그룹 3 (옷 12, 핑크)
```

## 웹 최적화
GLB 는 텍스처 256px + Draco 압축으로 그룹당 ~200KB.
```bash
gltf-pipeline -i hq_0.glb -o hq_0_c.glb -d
```
결과물을 `assets/garments/hq_0..3.glb` 로 커밋. 런타임에 `wardrobe-site.js`
의 `_loadGarmentGLBs` 가 불러와 x 좌표로 옷별 클러스터링 후 봉에 분배한다.

`sleeve_test.py long|short` 는 소매 1벌 단독 검증용.
