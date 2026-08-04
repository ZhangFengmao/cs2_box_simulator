"""Replace demo artwork with local copies of CS2 inventory images.

The manifest comes from ByMykel/CSGO-API. It exposes the Chinese names and
inventory-image URLs for each case, weapon, knife, and glove. Runtime code does
not access the network; this script downloads and commits local PNG snapshots.
"""

from __future__ import annotations

import argparse
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
COLLECTIONS_PATH = ROOT / "assets" / "collections" / "collections.json"
ASSET_ROOT = ROOT / "assets" / "items"
MANIFEST_URL = (
    "https://raw.githubusercontent.com/ByMykel/CSGO-API/"
    "main/public/api/zh-CN/crates.json"
)
CASE_NAMES = {
    "recoil": "反冲武器箱",
    "dreams": "梦魇武器箱",
    "revolution": "变革武器箱",
    "fever": "热潮武器箱",
    "cobblestone": "2014年 ESL One 科隆锦标赛古堡激战纪念包",
}
DISPLAY_NAMES = {"cobblestone": "古堡激战纪念包"}
RARITY_BY_ID = {
    "rarity_common_weapon": 0,
    "rarity_uncommon_weapon": 1,
    "rarity_rare_weapon": 2,
    "rarity_mythical_weapon": 3,
    "rarity_legendary_weapon": 4,
    "rarity_ancient_weapon": 5,
}
PHASE_LABELS = {
    "Ruby": "红宝石",
    "Sapphire": "蓝宝石",
    "Black Pearl": "黑珍珠",
    "Phase 1": "阶段 1",
    "Phase 2": "阶段 2",
    "Phase 3": "阶段 3",
    "Phase 4": "阶段 4",
}


def normalize_name(value: str) -> str:
    """Normalize harmless display differences such as spaces and ★ position."""

    value = value.replace("★", "").replace("（", "(").replace("）", ")")
    value = re.sub(r"[()\s]", "", value)
    value = value.casefold()
    value = value.replace("m4a1消音型", "m4a1消音版")
    return value


def read_manifest(path: Path | None) -> list[dict]:
    if path:
        return json.loads(path.read_text(encoding="utf-8"))
    request = Request(MANIFEST_URL, headers={"User-Agent": "cs2_box_simulator/1.0"})
    with urlopen(request, timeout=180) as response:
        return json.load(response)


def pair_items(local_items: list[dict], remote_items: list[dict]) -> list[tuple[dict, dict]]:
    remote_by_id = {remote_item["id"]: remote_item for remote_item in remote_items}
    remote_by_name: dict[str, deque[dict]] = defaultdict(deque)
    for remote_item in remote_items:
        remote_by_name[normalize_name(remote_item["name"])].append(remote_item)

    pairs = []
    for local_item in local_items:
        source_id = local_item.get("sourceId")
        if source_id in remote_by_id:
            pairs.append((local_item, remote_by_id[source_id]))
            continue
        local_name = f"{local_item['weapon']} | {local_item['skin']}"
        candidates = remote_by_name[normalize_name(local_name)]
        if not candidates:
            raise ValueError(f"No official image match for {local_name}")
        pairs.append((local_item, candidates.popleft()))
    return pairs


def build_item(remote_item: dict, rarity: int) -> dict:
    parts = remote_item["name"].split(" | ", 1)
    weapon = parts[0].replace("（★）", "").strip()
    skin = parts[1] if len(parts) == 2 else "原版"
    if rarity == 6:
        weapon = f"★ {weapon}"
        phase = remote_item.get("phase")
        if phase:
            skin = f"{skin} · {PHASE_LABELS.get(phase, phase)}"
    return {
        "weapon": weapon,
        "skin": skin,
        "name": f"{weapon} | {skin}",
        "rarity": rarity,
        "image": "",
        "sourceId": remote_item["id"],
    }


def build_collection(case_id: str, remote_case: dict) -> dict:
    items = [
        build_item(item, RARITY_BY_ID[item["rarity"]["id"]])
        for item in remote_case.get("contains", [])
    ]
    items += [build_item(item, 6) for item in remote_case.get("contains_rare", [])]
    return {
        "id": case_id,
        "name": DISPLAY_NAMES.get(case_id, CASE_NAMES[case_id]),
        "image": "",
        "rarityVersion": 2,
        "items": items,
    }


def migrate_collection_rarities(collection: dict) -> None:
    """Move the original five tiers into the shared seven-tier scale."""

    if collection.get("rarityVersion") == 2:
        return
    for item in collection.get("items", []):
        old_rarity = item["rarity"]
        item["rarity"] = 6 if old_rarity == 4 else old_rarity + 2
    collection["rarityVersion"] = 2


def download_png(job: tuple[str, Path], force: bool) -> Path:
    url, destination = job
    if destination.is_file() and destination.stat().st_size > 1024 and not force:
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            request = Request(url, headers={"User-Agent": "cs2_box_simulator/1.0"})
            with urlopen(request, timeout=90) as response:
                content = response.read()
            if not content.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError(f"Unexpected image format from {url}")
            temporary = destination.with_suffix(".tmp")
            temporary.write_bytes(content)
            temporary.replace(destination)
            return destination
        except Exception as error:  # Network failures are retried with backoff.
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to download {url}") from last_error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, help="Use an already-downloaded crates.json")
    parser.add_argument("--force", action="store_true", help="Download existing images again")
    args = parser.parse_args()

    remote_crates = read_manifest(args.manifest)
    remote_by_name = {crate.get("name"): crate for crate in remote_crates}
    collections = json.loads(COLLECTIONS_PATH.read_text(encoding="utf-8"))
    for collection in collections:
        migrate_collection_rarities(collection)
    collections_by_id = {collection["id"]: collection for collection in collections}
    for case_id, case_name in CASE_NAMES.items():
        if case_id not in collections_by_id:
            remote_case = remote_by_name.get(case_name)
            if not remote_case:
                raise ValueError(f"Missing case in CSGO-API: {case_name}")
            collection = build_collection(case_id, remote_case)
            collections.append(collection)
            collections_by_id[case_id] = collection
    jobs: list[tuple[str, Path]] = []

    for collection in collections:
        case_id = collection["id"]
        remote_case = remote_by_name.get(CASE_NAMES[case_id])
        if not remote_case:
            raise ValueError(f"Missing case in CSGO-API: {CASE_NAMES[case_id]}")

        case_relative = Path("assets") / "items" / case_id / "case.png"
        collection["image"] = case_relative.as_posix()
        jobs.append((remote_case["image"], ROOT / case_relative))

        regular = [item for item in collection["items"] if item["rarity"] != 6]
        special = [item for item in collection["items"] if item["rarity"] == 6]
        pairs = pair_items(regular, remote_case.get("contains", []))
        pairs += pair_items(special, remote_case.get("contains_rare", []))

        for index, (local_item, remote_item) in enumerate(pairs):
            relative = Path("assets") / "items" / case_id / f"{index:02d}.png"
            local_item["image"] = relative.as_posix()
            jobs.append((remote_item["image"], ROOT / relative))

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda job: download_png(job, args.force), jobs))

    COLLECTIONS_PATH.write_text(
        json.dumps(collections, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "import_open_source_data.py")],
        check=True,
    )
    print(f"Updated {len(jobs)} local CS2 inventory images in {ASSET_ROOT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
