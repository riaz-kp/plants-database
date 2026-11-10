"""Bulk import into a project: match a pasted list of plant names against the
catalog, and import CSV rows straight into a project."""
import logging
import re
import unicodedata
import uuid
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Rank
from app.models.plant import Plant
from app.models.project import ProjectPlant
from app.services.import_service import _process_single_row, find_duplicates_in_rows

logger = logging.getLogger(__name__)

HIERARCHY_RANKS = [Rank.KINGDOM, Rank.DIVISION, Rank.CLASS, Rank.ORDER, Rank.FAMILY, Rank.GENUS]

MAX_SUGGESTIONS = 3
# 0.75 let through 'spider plant' -> 'soccer plant'; typos like 'bougenvillea' still score ~0.88
SUGGESTION_CUTOFF = 0.8


# ---------------------------------------------------------------------------
# Name matching
# ---------------------------------------------------------------------------

def normalize_name(value: Optional[str]) -> str:
    """Lowercase, drop accents and punctuation, collapse spaces.
    'Hibiscus rosa-sinensis' and 'hibiscus  Rosa Sinensis.' both become 'hibiscus rosa sinensis'."""
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def name_variants(raw: Optional[str]) -> List[str]:
    """Every normalized form a name can be looked up by.

    'Areca Palm (Dypsis lutescens)' -> the whole name, 'areca palm', 'dypsis lutescens'.
    Catalog common names often hold several aliases, e.g. 'Orange Hibiscus;Chinese Hibiscus'
    or 'Soochi mulla/ Juhi jasmine', so each alias counts too.
    """
    if not raw:
        return []
    parts = [raw, re.sub(r"\([^)]*\)", " ", raw), *re.findall(r"\(([^)]*)\)", raw)]
    for part in list(parts):
        parts.extend(re.split(r"[;/|,]", part))
    seen: Dict[str, None] = {}
    for part in parts:
        key = normalize_name(part)
        if key:
            seen.setdefault(key, None)
    return list(seen)


def _brief(plant: Plant) -> Dict[str, Any]:
    return {
        "id": plant.id,
        "common_name": (plant.common_name or "").strip(),
        "scientific_name": plant.scientific_name,
        "category": plant.category,
        "icon_url": plant.icon_url,
    }


@lru_cache(maxsize=200_000)
def _words_close(a: str, b: str) -> bool:
    """Same word, or the same longer word with a typo ('bougenvillea' / 'bougainvillea')."""
    if a == b:
        return True
    if len(a) < 4 or len(b) < 4:
        return False
    matcher = SequenceMatcher(None, a, b)
    return matcher.real_quick_ratio() >= 0.8 and matcher.ratio() >= 0.8


def _all_words_in(small: tuple, big: tuple) -> bool:
    return all(any(_words_close(w, b) for b in big) for w in small)


def _similarity(query: str, key: str) -> float:
    """How close a typed name is to a catalog name, 0..1 (0 when not close).
    A name whose words all appear in the other ('monstera' vs 'monstera deliciosa',
    'bougenvillea' vs 'white bougainvillea') counts as close even when the lengths differ."""
    q_words, k_words = tuple(query.split()), tuple(key.split())
    contained = any(len(w) >= 4 for w in q_words) and (
        _all_words_in(q_words, k_words) or _all_words_in(k_words, q_words)
    )
    matcher = SequenceMatcher(None, query, key)
    # The quick upper bounds skip most of the catalog without the full comparison
    if matcher.real_quick_ratio() < SUGGESTION_CUTOFF or matcher.quick_ratio() < SUGGESTION_CUTOFF:
        ratio = 0.0
    else:
        ratio = matcher.ratio()
    if contained:
        # Rank word matches among themselves by how close the whole names are
        return max(ratio, SUGGESTION_CUTOFF + 0.1 * matcher.ratio())
    return ratio


async def match_plant_names(db: AsyncSession, project_id: uuid.UUID, names: Iterable[str]) -> List[Dict[str, Any]]:
    """For each name: the catalog plant it is ('found'), whether that plant is already in the
    project ('in_project'), or 'missing' with close catalog names as suggestions."""
    # Oldest first, so the same plant is picked every time among identical records
    plants = (await db.execute(select(Plant).order_by(Plant.created_at, Plant.id))).scalars().all()
    in_project = set(
        (await db.execute(select(ProjectPlant.plant_id).where(ProjectPlant.project_id == project_id))).scalars().all()
    )

    def identity(plant: Plant) -> tuple:
        # The catalog holds some plants twice (two "Croton" records, both Codiaeum variegatum);
        # those are one choice, not two that look the same
        return normalize_name(plant.common_name), normalize_name(plant.scientific_name)

    def distinct(candidates: List[Plant]) -> List[Plant]:
        """Drop records identical to an earlier one, keeping the one in the project if any."""
        ordered = sorted(candidates, key=lambda p: p.id not in in_project)  # stable: in-project first
        seen, out = set(), []
        for plant in ordered:
            if identity(plant) not in seen:
                seen.add(identity(plant))
                out.append(plant)
        # Back in their original order, apart from the dropped twins
        kept = {p.id for p in out}
        return [p for p in candidates if p.id in kept]

    # normalized name -> plants, common names before scientific names
    index: Dict[str, List[Plant]] = {}
    for field in ("common_name", "scientific_name"):
        for plant in plants:
            for key in name_variants(getattr(plant, field)):
                bucket = index.setdefault(key, [])
                if plant not in bucket:
                    bucket.append(plant)

    results = []
    for name in names:
        name = (name or "").strip()
        if not name:
            continue

        exact: List[Plant] = []
        for key in name_variants(name):
            for plant in index.get(key, []):
                if plant not in exact:
                    exact.append(plant)

        if exact:
            exact = distinct(exact)
            # A plant already in the project wins, so it isn't added twice under another match
            chosen = next((p for p in exact if p.id in in_project), exact[0])
            results.append({
                "name": name,
                "status": "in_project" if chosen.id in in_project else "found",
                "plant": _brief(chosen),
                "alternatives": [_brief(p) for p in exact if p is not chosen],
                "suggestions": [],
            })
            continue

        query = normalize_name(name)
        scored: Dict[uuid.UUID, tuple] = {}
        for key, bucket in index.items():
            score = _similarity(query, key)
            if score < SUGGESTION_CUTOFF:
                continue
            for plant in bucket:
                if plant.id not in scored or scored[plant.id][0] < score:
                    scored[plant.id] = (score, plant)
        ranked = [p for _, p in sorted(scored.values(), key=lambda item: -item[0])]
        best = distinct(ranked)[:MAX_SUGGESTIONS]
        results.append({
            "name": name,
            "status": "missing",
            "plant": None,
            "alternatives": [],
            "suggestions": [{**_brief(p), "in_project": p.id in in_project} for p in best],
        })
    return results


# ---------------------------------------------------------------------------
# CSV rows -> catalog + project
# ---------------------------------------------------------------------------

async def import_rows_into_project(
    db: AsyncSession, project_id: uuid.UUID, rows: List[Dict[str, str]], skip_ai: bool = False
) -> Dict[str, Any]:
    """Create each row's plant in the catalog (or reuse the catalog plant it duplicates)
    and add it to the project. Plants already in the project keep their BOQ data."""
    in_project = set(
        (await db.execute(select(ProjectPlant.plant_id).where(ProjectPlant.project_id == project_id))).scalars().all()
    )
    duplicates = {d["row_index"]: d for d in await find_duplicates_in_rows(db, rows)}

    result: Dict[str, Any] = {
        "created": 0, "linked": 0, "already_in_project": 0, "failed": 0, "errors": [], "rows": [],
    }

    def link(plant_id: uuid.UUID) -> bool:
        if plant_id in in_project:
            return False
        db.add(ProjectPlant(project_id=project_id, plant_id=plant_id))
        in_project.add(plant_id)
        return True

    for idx, row in enumerate(rows):
        dup = duplicates.get(idx)
        if dup:
            plant_id = uuid.UUID(dup["existing_plant_id"])
            outcome = "linked" if link(plant_id) else "already_in_project"
            result[outcome] += 1
            result["rows"].append({"status": outcome, "plant_id": plant_id})
            continue

        scratch: Dict[str, Any] = {"success": 0, "failed": 0, "errors": []}
        created = await _process_single_row(
            db, row, idx + 1, scratch, HIERARCHY_RANKS, ignore_duplicates=False, skip_ai=skip_ai,
        )
        if created is None:
            result["failed"] += 1
            error = scratch["errors"][0] if scratch["errors"] else f"Row {idx + 1}: not imported"
            result["errors"].append(error)
            result["rows"].append({"status": "failed", "error": re.sub(r"^Row \d+:\s*", "", error)})
            continue

        plant, is_new = created
        if is_new:
            await db.flush()  # gives the new plant its id
            result["created"] += 1
            link(plant.id)
            result["rows"].append({"status": "created", "plant_id": plant.id})
        else:
            outcome = "linked" if link(plant.id) else "already_in_project"
            result[outcome] += 1
            result["rows"].append({"status": outcome, "plant_id": plant.id})

    await db.commit()
    return result
