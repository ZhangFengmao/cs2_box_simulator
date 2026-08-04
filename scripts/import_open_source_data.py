"""Build the browser collection bundle from this project's canonical JSON.

The collection snapshot is intentionally committed under assets/collections so
the web demo and its build tools remain self-contained.
"""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COLLECTIONS_DIR = ROOT / "assets" / "collections"
SOURCE = COLLECTIONS_DIR / "collections.json"
DESTINATION = COLLECTIONS_DIR / "collections-data.js"
EXPECTED_CASES = ("recoil", "dreams", "revolution", "fever")


def validate_collection_data(data: object) -> list[dict]:
    if not isinstance(data, list) or len(data) != len(EXPECTED_CASES):
        raise ValueError(f"collections.json must contain exactly {len(EXPECTED_CASES)} cases")

    case_ids = tuple(case.get("id") for case in data if isinstance(case, dict))
    if case_ids != EXPECTED_CASES:
        raise ValueError(f"expected case order {EXPECTED_CASES}, got {case_ids}")

    for case in data:
        if not isinstance(case.get("name"), str) or not isinstance(case.get("image"), str):
            raise ValueError(f"invalid case metadata for {case.get('id', 'unknown')}")
        items = case.get("items")
        if not isinstance(items, list) or not items:
            raise ValueError(f"case {case['id']} has no items")
        for item in items:
            required = ("weapon", "skin", "name", "rarity", "image")
            if not isinstance(item, dict) or any(key not in item for key in required):
                raise ValueError(f"case {case['id']} contains an invalid item")
            if not isinstance(item["rarity"], int) or not 0 <= item["rarity"] <= 4:
                raise ValueError(f"invalid rarity in case {case['id']}")
            image_path = item["image"]
            if not isinstance(image_path, str) or not image_path.startswith("assets/"):
                raise ValueError(f"invalid local image path in case {case['id']}")
            if not (ROOT / image_path).is_file():
                raise ValueError(f"missing image: {image_path}")
    return data


def main() -> None:
    data = validate_collection_data(json.loads(SOURCE.read_text(encoding="utf-8")))
    DESTINATION.write_text(
        "window.COLLECTIONS_DATA = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    item_count = sum(len(case["items"]) for case in data)
    print(f"Built {DESTINATION.relative_to(ROOT)}: {len(data)} cases, {item_count} items")


if __name__ == "__main__":
    main()
