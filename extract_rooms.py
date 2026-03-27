"""
구조도 이미지에서 OpenCV로 방 폴리곤을 자동 추출하는 스크립트.

Usage:
  python extract_rooms.py <image_path> \
    --roi "21동:350,850,1650,1350" \
    --roi "22동:1450,350,1950,1200" \
    --roi "23동:280,100,1900,500" \
    --output rooms_L1.json --debug

  --roi "라벨:x1,y1,x2,y2" 형태로 추출할 영역을 지정.
  Claude가 구조도 이미지를 읽고 건물 본체 영역만 ROI로 지정하여
  개요도/범례 등 불필요한 영역을 제외함.
"""

import cv2
import numpy as np
import json
import sys
import os
import math
import argparse


def parse_roi(roi_str: str):
    """'라벨:x1,y1,x2,y2' 형태의 ROI 문자열을 파싱."""
    if ':' in roi_str:
        label, coords = roi_str.split(':', 1)
    else:
        label = None
        coords = roi_str
    parts = [int(x.strip()) for x in coords.split(',')]
    if len(parts) != 4:
        raise ValueError(f"ROI must be x1,y1,x2,y2 (got {coords})")
    x1, y1, x2, y2 = parts
    return {"label": label, "x1": min(x1, x2), "y1": min(y1, y2), "x2": max(x1, x2), "y2": max(y1, y2)}


def create_roi_mask(h: int, w: int, rois: list):
    """ROI 영역만 흰색인 마스크 생성."""
    mask = np.zeros((h, w), dtype=np.uint8)
    for roi in rois:
        mask[roi["y1"]:roi["y2"], roi["x1"]:roi["x2"]] = 255
    return mask


def load_and_preprocess(image_path: str, debug_dir: str = None):
    """이미지 로드 및 전처리: 노란색 피난경로 제거, 그레이스케일 변환."""
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot load image: {image_path}")

    h, w = img.shape[:2]
    print(f"Image size: {w}x{h}")

    # HSV 변환 — 색상 노이즈 제거 (피난경로, 마커 등)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    yellow_mask = cv2.inRange(hsv, (15, 80, 150), (35, 255, 255))
    red_mask1 = cv2.inRange(hsv, (0, 80, 150), (10, 255, 255))
    red_mask2 = cv2.inRange(hsv, (160, 80, 150), (180, 255, 255))
    blue_mask = cv2.inRange(hsv, (100, 80, 150), (130, 255, 255))
    green_mask = cv2.inRange(hsv, (35, 80, 100), (85, 255, 255))

    color_mask = yellow_mask | red_mask1 | red_mask2 | blue_mask | green_mask

    clean = img.copy()
    clean[color_mask > 0] = [255, 255, 255]

    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, "01_color_removed.png"), clean)

    gray = cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY)

    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, "02_gray.png"), gray)

    return img, gray, h, w


def detect_walls(gray: np.ndarray, roi_mask: np.ndarray = None, debug_dir: str = None):
    """벽 선 감지: 이진화 + 모폴로지. ROI 마스크 적용."""
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 8
    )

    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, "03_binary.png"), binary)

    # ROI 마스크 적용 — ROI 밖은 벽으로 처리 (검정=벽 없음이 아니라 흰색=벽으로)
    if roi_mask is not None:
        # ROI 밖을 0으로 (벽 없음) — 나중에 반전하면 ROI 밖은 검정(방 아님)이 됨
        binary = cv2.bitwise_and(binary, roi_mask)

    # 모폴로지: closing으로 문 간격 채우기
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close, iterations=2)

    # 작은 노이즈 제거
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open, iterations=1)

    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, "04_walls.png"), cleaned)

    return cleaned


def find_room_wing(cx: int, cy: int, rois: list):
    """방 중심점이 어느 ROI(동)에 속하는지 판별."""
    for roi in rois:
        if roi["x1"] <= cx <= roi["x2"] and roi["y1"] <= cy <= roi["y2"]:
            return roi.get("label")
    return None


def extract_room_contours(wall_mask: np.ndarray, rois: list, min_area: int = 500, max_area: int = None, debug_dir: str = None):
    """벽 마스크에서 방 컨투어 추출."""
    h, w = wall_mask.shape[:2]
    if max_area is None:
        max_area = h * w * 0.3

    # 벽을 반전하여 방 내부가 흰색이 되게
    rooms_mask = cv2.bitwise_not(wall_mask)

    # ROI 마스크 적용 — ROI 밖은 방이 아님
    if rois:
        roi_mask = create_roi_mask(h, w, rois)
        rooms_mask = cv2.bitwise_and(rooms_mask, roi_mask)

    # 외곽 테두리를 검정으로
    border = 5
    rooms_mask[:border, :] = 0
    rooms_mask[-border:, :] = 0
    rooms_mask[:, :border] = 0
    rooms_mask[:, -border:] = 0

    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, "05_rooms_mask.png"), rooms_mask)

    contours, hierarchy = cv2.findContours(rooms_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    rooms = []
    for i, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        if area < min_area or area > max_area:
            continue

        # 폴리곤 근사화
        epsilon = 0.01 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        points = approx.reshape(-1, 2).tolist()

        M = cv2.moments(contour)
        if M["m00"] == 0:
            continue
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])

        wing = find_room_wing(cx, cy, rois) if rois else None

        room = {
            "id": i,
            "area_px": area,
            "center_px": [cx, cy],
            "polygon_px": points,
            "num_vertices": len(points),
        }
        if wing:
            room["wing"] = wing

        rooms.append(room)

    print(f"Found {len(rooms)} room contours (min_area={min_area}, max_area={int(max_area)})")

    if rois:
        wing_counts = {}
        for r in rooms:
            w_name = r.get("wing", "unknown")
            wing_counts[w_name] = wing_counts.get(w_name, 0) + 1
        for w_name, count in sorted(wing_counts.items()):
            print(f"  {w_name}: {count} rooms")

    if debug_dir:
        # 원본 이미지 위에 ROI와 방을 오버레이
        debug_img = np.zeros((h, w, 3), dtype=np.uint8)
        # ROI 영역을 어두운 색으로 표시
        for roi in rois:
            cv2.rectangle(debug_img, (roi["x1"], roi["y1"]), (roi["x2"], roi["y2"]),
                         (40, 40, 40), -1)
        for room in rooms:
            pts = np.array(room["polygon_px"], dtype=np.int32)
            color = (
                np.random.randint(80, 255),
                np.random.randint(80, 255),
                np.random.randint(80, 255),
            )
            cv2.fillPoly(debug_img, [pts], color)
            cv2.polylines(debug_img, [pts], True, (255, 255, 255), 1)
            label = room.get("ref", str(room["id"]))
            cv2.putText(debug_img, label, tuple(room["center_px"]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
        cv2.imwrite(os.path.join(debug_dir, "06_rooms_detected.png"), debug_img)

    return rooms


def run_ocr(image: np.ndarray, rooms: list, rois: list, debug_dir: str = None):
    """EasyOCR로 각 방 내부 텍스트(방 번호) 읽기. ROI 영역만 스캔."""
    try:
        import easyocr
        reader = easyocr.Reader(['ko', 'en'], gpu=False, verbose=False)
    except Exception as e:
        print(f"EasyOCR not available: {e}. Skipping OCR.")
        return rooms

    print("Running OCR...")

    # ROI 영역만 OCR 수행
    all_results = []
    if rois:
        for roi in rois:
            crop = image[roi["y1"]:roi["y2"], roi["x1"]:roi["x2"]]
            results = reader.readtext(crop)
            # 좌표를 원본 이미지 기준으로 변환
            for (bbox, text, confidence) in results:
                shifted_bbox = [[pt[0] + roi["x1"], pt[1] + roi["y1"]] for pt in bbox]
                all_results.append((shifted_bbox, text, confidence))
    else:
        all_results = reader.readtext(image)

    for (bbox, text, confidence) in all_results:
        if confidence < 0.3:
            continue
        pts = np.array(bbox)
        tx = int(pts[:, 0].mean())
        ty = int(pts[:, 1].mean())

        clean_text = text.strip().replace(" ", "")
        if not any(c.isdigit() for c in clean_text):
            continue

        best_room = None
        best_dist = float('inf')
        for room in rooms:
            cx, cy = room["center_px"]
            dist = math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2)
            pts_arr = np.array(room["polygon_px"], dtype=np.int32)
            inside = cv2.pointPolygonTest(pts_arr, (float(tx), float(ty)), False)
            if inside >= 0 and dist < best_dist:
                best_dist = dist
                best_room = room

        if best_room is not None:
            best_room["ref"] = clean_text
            best_room["ocr_confidence"] = confidence

    labeled = sum(1 for r in rooms if "ref" in r)
    print(f"OCR labeled {labeled}/{len(rooms)} rooms")

    return rooms


def main():
    parser = argparse.ArgumentParser(description="구조도 이미지에서 방 폴리곤 추출")
    parser.add_argument("image", help="구조도 이미지 경로")
    parser.add_argument("--output", default="rooms_extracted.json", help="출력 JSON 경로")
    parser.add_argument("--roi", action="append", default=[],
                        help="추출 영역: '라벨:x1,y1,x2,y2' (여러 개 가능)")
    parser.add_argument("--min-area", type=int, default=500, help="최소 방 면적 (px)")
    parser.add_argument("--max-area", type=int, default=None, help="최대 방 면적 (px)")
    parser.add_argument("--debug", action="store_true", help="디버그 이미지 저장")
    parser.add_argument("--no-ocr", action="store_true", help="OCR 생략")
    args = parser.parse_args()

    # ROI 파싱
    rois = [parse_roi(r) for r in args.roi]
    if rois:
        print(f"ROI regions ({len(rois)}):")
        for roi in rois:
            label = roi['label'] or '(unlabeled)'
            print(f"  {label}: ({roi['x1']},{roi['y1']}) - ({roi['x2']},{roi['y2']})")
    else:
        print("No ROI specified — processing entire image")

    debug_dir = None
    if args.debug:
        debug_dir = "extract_debug"
        os.makedirs(debug_dir, exist_ok=True)
        print(f"Debug images → {debug_dir}/")

    # Step 1: Load and preprocess
    print(f"\nLoading: {args.image}")
    img, gray, h, w = load_and_preprocess(args.image, debug_dir)

    # Step 2: Create ROI mask
    roi_mask = create_roi_mask(h, w, rois) if rois else None

    if debug_dir and roi_mask is not None:
        roi_vis = cv2.cvtColor(roi_mask, cv2.COLOR_GRAY2BGR)
        cv2.imwrite(os.path.join(debug_dir, "02b_roi_mask.png"), roi_vis)

    # Step 3: Detect walls
    print("Detecting walls...")
    walls = detect_walls(gray, roi_mask, debug_dir)

    # Step 4: Extract room contours
    print("Extracting room contours...")
    rooms = extract_room_contours(walls, rois, min_area=args.min_area, max_area=args.max_area, debug_dir=debug_dir)

    # Step 5: OCR
    if not args.no_ocr:
        rooms = run_ocr(img, rooms, rois, debug_dir)

    # Save results
    result = {
        "source_image": args.image,
        "image_size": [w, h],
        "rois": [{"label": r.get("label"), "bounds": [r["x1"], r["y1"], r["x2"], r["y2"]]} for r in rois],
        "num_rooms": len(rooms),
        "rooms": rooms,
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(rooms)} rooms → {args.output}")
    if debug_dir:
        print(f"Debug images → {debug_dir}/")


if __name__ == "__main__":
    main()
