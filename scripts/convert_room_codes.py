"""Convert 코드-방이름.xlsx to room_codes.json for the graph editor auto-lookup."""

import json
import os
import openpyxl

XLSX_PATH = os.path.join(os.path.dirname(__file__), '..', '코드-방이름.xlsx')
OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), '..', '2.5d_indoor_navigation_frontend_v2',
    'public', 'geojson', 'room_codes.json',
)

def main():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
    ws = wb.active

    lookup = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        code = row[0]       # 코드(spaceCd)
        name = row[5]       # 공간명
        name_en = row[6]    # 공간명(영문)
        room_type = row[7]  # room_type

        if not code:
            continue

        code = str(code).strip()
        lookup[code] = {
            'name': str(name).strip() if name else '',
            'name_en': str(name_en).strip() if name_en else '',
            'room_type': str(room_type).strip() if room_type else '',
        }

    wb.close()

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(lookup, f, ensure_ascii=False, indent=2)

    print(f'Wrote {len(lookup)} entries to {OUTPUT_PATH}')

if __name__ == '__main__':
    main()
