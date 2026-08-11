import csv
import io
import logging
import re
from typing import Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.taxon import Taxon
from app.models.plant import Plant
from app.models.enums import Rank, PlantingPlace
from app.models.category import Category
from app.services.ai_service import generate_plant_details
from app.services.cloudinary_service import upload_image_from_url

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_taxon(
    db: AsyncSession,
    name: str,
    rank: Rank,
    parent_id: Optional[str],
) -> Taxon:
    stmt = select(Taxon).where(
        Taxon.name == name,
        Taxon.rank == rank,
        Taxon.parent_id == parent_id,
    )
    result = await db.execute(stmt)
    taxon = result.scalars().first()
    if not taxon:
        taxon = Taxon(name=name, rank=rank, parent_id=parent_id)
        db.add(taxon)
        await db.flush()
    return taxon


async def _find_existing_species_taxon(db: AsyncSession, row: dict) -> Optional[Taxon]:
    hierarchy_ranks = [
        Rank.KINGDOM,
        Rank.DIVISION,
        Rank.CLASS,
        Rank.ORDER,
        Rank.FAMILY,
        Rank.GENUS,
    ]
    parent_id = None
    for rank in hierarchy_ranks:
        name = row.get(rank.value.lower(), "")
        if not name:
            if rank == Rank.KINGDOM:
                return None
            continue
        stmt = select(Taxon).where(
            Taxon.name == name,
            Taxon.rank == rank,
            Taxon.parent_id == parent_id,
        )
        res = await db.execute(stmt)
        taxon = res.scalars().first()
        if not taxon:
            return None
        parent_id = taxon.id
        
    species_name = row.get("species", "")
    if not species_name:
        return None
    stmt = select(Taxon).where(
        Taxon.name == species_name,
        Taxon.rank == Rank.SPECIES,
        Taxon.parent_id == parent_id,
    )
    res = await db.execute(stmt)
    return res.scalars().first()


async def find_duplicates_in_rows(db: AsyncSession, rows: list) -> list:
    duplicates = []
    for idx, row in enumerate(rows, start=1):
        species_taxon = await _find_existing_species_taxon(db, row)
        existing_plant = None
        if species_taxon:
            plant_res = await db.execute(select(Plant).where(Plant.taxon_id == species_taxon.id))
            existing_plant = plant_res.scalars().first()
            
        if not existing_plant:
            scientific_name = row.get("scientific_name", "")
            if scientific_name:
                plant_res = await db.execute(select(Plant).where(func.lower(Plant.scientific_name) == scientific_name.lower()))
                existing_plant = plant_res.scalars().first()
                
        if not existing_plant:
            common_name = row.get("common_name", "")
            if common_name:
                plant_res = await db.execute(select(Plant).where(func.lower(Plant.common_name) == common_name.lower()))
                existing_plant = plant_res.scalars().first()
                
        if existing_plant:
            duplicates.append({
                "row_index": idx - 1,  # 0-indexed for frontend array matching
                "common_name": row.get("common_name", "") or existing_plant.common_name,
                "scientific_name": row.get("scientific_name", "") or row.get("species", "") or existing_plant.scientific_name,
                "existing_plant_id": str(existing_plant.id)
            })
    return duplicates


def _clean_url(raw: Optional[str]) -> Optional[str]:
    """Extract the first valid https URL from a cell value.
    Handles AI-generated Markdown links like [url](url), bare URLs,
    and cells where two URLs were accidentally merged together."""
    if not raw:
        return None
    # Pull every https:// URL out of the cell (ignores surrounding markdown / text)
    urls = re.findall(r'https://[^\s\)\]\,\'"]+', raw)
    return urls[0] if urls else None


async def _cloudinary_url(raw_url: Optional[str]) -> Optional[str]:
    """Upload a remote URL to Cloudinary and return the CDN URL.
    Returns None silently if upload fails so a missing image never breaks the import."""
    clean = _clean_url(raw_url)
    if not clean:
        return None
    try:
        return await upload_image_from_url(clean, folder="plants")
    except Exception as exc:
        logger.warning("Cloudinary upload failed for %s: %s", clean, exc)
        return None


# ---------------------------------------------------------------------------
# Pre-processing
# ---------------------------------------------------------------------------

def _sanitize_csv_text(text: str) -> str:
    """Fix common AI formatting mistakes in raw CSV text *before* parsing.

    The most frequent problem: AI outputs image URLs as a Markdown hyperlink
    with both URLs merged into one unquoted cell, e.g.
        [https://...?width=400,https://...?width=1000](https://...?width=400,...)

    The unquoted commas inside [...] and (...) make the CSV parser produce
    extra phantom columns and misalign every subsequent field.  We replace
    the whole construct with just the first plain URL found inside it.
    """
    # Pattern: [anything](anything) where 'anything' contains https URLs.
    # Replace with only the first https URL found in the whole match.
    def _pick_first_url(m: re.Match) -> str:
        urls = re.findall(r'https://[^\s\)\]\,\'"]+', m.group(0))
        return urls[0] if urls else ""

    sanitized = re.sub(r'\[https?://[^\]]*\]\(https?://[^\)]*\)', _pick_first_url, text)
    return sanitized


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

STANDARD_HEADER = (
    "kingdom,division,class,order,family,genus,species,common_name,"
    "scientific_name,category,planting_place,description,common_diseases,"
    "care_water,care_sunlight,care_soil,care_maintenance,icon_url,image_url"
)

ALL_FIELDS = [
    "kingdom", "division", "class", "order", "family", "genus", "species",
    "common_name", "scientific_name", "category", "planting_place",
    "description", "common_diseases",
    "care_water", "care_sunlight", "care_soil", "care_maintenance",
    "icon_url", "image_url",
]


def preview_csv(file_content: bytes) -> Dict[str, Any]:
    """Parse the CSV and return a full-fidelity preview without touching the DB.

    Returns a dict with:
      - rows: list of dicts (one per data row, ALL fields)
      - total: total number of data rows
      - errors: list of parse-level problems (missing required columns, etc.)
    """
    decoded = file_content.decode("utf-8")
    decoded = _sanitize_csv_text(decoded)

    # Auto-detect missing header
    peek_reader = csv.reader(io.StringIO(decoded))
    first_row = next(peek_reader, [])
    first_row_lower = [c.strip().lower() for c in first_row]
    required = ["kingdom", "species", "common_name"]

    if not all(r in first_row_lower for r in required):
        decoded = STANDARD_HEADER + "\n" + decoded

    csv_reader = csv.DictReader(io.StringIO(decoded))
    headers = [h.strip().lower() for h in csv_reader.fieldnames or []]
    missing = [r for r in required if r not in headers]
    if missing:
        return {
            "rows": [],
            "total": 0,
            "errors": [f"Missing required columns: {', '.join(missing)}"],
        }

    # Collect all fields
    rows = []
    for row in csv_reader:
        clean = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items()}
        full_row = {f: clean.get(f, "") for f in ALL_FIELDS}
        rows.append(full_row)

    return {
        "rows": rows,
        "total": len(rows),
        "errors": [],
    }



async def _process_single_row(
    db: AsyncSession,
    row: Dict[str, Any],
    row_idx: int,
    results: Dict[str, Any],
    hierarchy_ranks,
    ignore_duplicates: bool = False,
) -> None:
    """Shared logic: build taxonomy, AI-fill, upload images, create Plant."""
    try:
        # 1. Taxonomy hierarchy
        parent_id = None
        for rank in hierarchy_ranks:
            name = row.get(rank.value.lower(), "")
            if not name:
                if rank == Rank.KINGDOM:
                    raise ValueError("Kingdom is mandatory")
                continue
            taxon = await _get_or_create_taxon(db, name, rank, parent_id)
            parent_id = taxon.id

        species_name = row.get("species", "")
        if not species_name:
            raise ValueError("Species name mandatory")
        species_taxon = await _get_or_create_taxon(db, species_name, Rank.SPECIES, parent_id)

        # 2. Duplicate check
        if not ignore_duplicates:
            existing = (
                await db.execute(select(Plant).where(Plant.taxon_id == species_taxon.id))
            ).scalars().first()
            if existing:
                return  # skip silently

        # 3. Text fields
        common_name = row.get("common_name", "")
        if not common_name:
            raise ValueError("Common name mandatory")

        scientific_name = row.get("scientific_name", "") or None
        description     = row.get("description", "")     or None
        common_diseases = row.get("common_diseases", "") or None

        care_water       = row.get("care_water", "")       or None
        care_sunlight    = row.get("care_sunlight", "")    or None
        care_soil        = row.get("care_soil", "")        or None
        care_maintenance = row.get("care_maintenance", "") or None

        csv_icon_url  = row.get("icon_url", "")  or None
        csv_image_url = row.get("image_url", "") or None

        # 4. AI autofill for missing fields
        ai_icon_url = ai_image_url = None
        needs_ai = not all([
            description, common_diseases,
            care_water, care_sunlight, care_soil, care_maintenance,
            csv_icon_url, csv_image_url,
        ])
        if needs_ai:
            try:
                cat_stmt = select(Category.name)
                cat_res = await db.execute(cat_stmt)
                valid_categories = list(cat_res.scalars().all())
                ai = await generate_plant_details(
                    common_name=common_name,
                    scientific_name=scientific_name or species_name,
                    valid_categories=valid_categories,
                )
                if not description and ai.description:
                    description = ai.description
                if not common_diseases and ai.common_diseases:
                    common_diseases = ai.common_diseases
                ai_care = ai.care_data or {}
                if not care_water and ai_care.get("water"):
                    care_water = ai_care["water"]
                if not care_sunlight and ai_care.get("sunlight"):
                    care_sunlight = ai_care["sunlight"]
                if not care_soil and ai_care.get("soil"):
                    care_soil = ai_care["soil"]
                if not care_maintenance and ai_care.get("maintenance"):
                    care_maintenance = ai_care["maintenance"]
                ai_icon_url  = ai.icon_url  or None
                ai_image_url = ai.image_url or None
            except Exception as ai_err:
                logger.warning("Row %d: AI autofill failed for '%s': %s", row_idx, common_name, ai_err)

        # 5. Cloudinary upload
        icon_url  = await _cloudinary_url(csv_icon_url  or ai_icon_url)
        image_url = await _cloudinary_url(csv_image_url or ai_image_url)

        # 6. Category
        category_str = (row.get("category", "") or "Other").title()
        cat_result = await db.execute(
            select(Category).filter(func.lower(Category.name) == category_str.lower())
        )
        cat_obj = cat_result.scalars().first()
        if not cat_obj:
            cat_obj = Category(name=category_str)
            db.add(cat_obj)
            await db.flush()
        category = cat_obj.name

        # 7. Planting place
        place_str = (row.get("planting_place", "") or "Indoor & Outdoor").strip()
        if "&" not in place_str:
            place_str = place_str.title()
        try:
            planting_place = PlantingPlace(place_str)
        except ValueError:
            planting_place = PlantingPlace.BOTH

        # 8. Care data
        care_data = None
        if any([care_water, care_sunlight, care_soil, care_maintenance]):
            care_data = {
                "water":       care_water       or None,
                "sunlight":    care_sunlight    or None,
                "soil":        care_soil        or None,
                "maintenance": care_maintenance or None,
            }

        # 9. Create plant
        plant = Plant(
            taxon_id=species_taxon.id,
            common_name=common_name,
            scientific_name=scientific_name,
            category=category,
            planting_place=planting_place,
            description=description,
            common_diseases=common_diseases,
            care_data=care_data,
            icon_url=icon_url,
            image_url=image_url,
        )
        db.add(plant)
        results["success"] += 1

    except Exception as exc:
        results["failed"] += 1
        results["errors"].append(f"Row {row_idx}: {exc}")


async def process_rows_import(db: AsyncSession, rows: list, ignore_duplicates: bool = False) -> Dict[str, Any]:
    """Import plants from a pre-edited list of row dicts (from the frontend editor)."""
    hierarchy_ranks = [
        Rank.KINGDOM, Rank.DIVISION, Rank.CLASS,
        Rank.ORDER, Rank.FAMILY, Rank.GENUS,
    ]
    if not ignore_duplicates:
        duplicates = await find_duplicates_in_rows(db, rows)
        if duplicates:
            return {
                "has_duplicates": True,
                "duplicates": duplicates
            }

    results: Dict[str, Any] = {"success": 0, "failed": 0, "errors": []}
    for idx, row in enumerate(rows, start=1):
        await _process_single_row(db, row, idx, results, hierarchy_ranks, ignore_duplicates=ignore_duplicates)
    await db.commit()
    return results


async def process_csv_import(db: AsyncSession, file_content: bytes) -> Dict[str, Any]:
    """
    Process CSV content to import plants and build the taxonomy hierarchy.

    For every row the service:
      1. Builds / reuses the full taxonomy chain from the CSV columns.
      2. Calls the same AI autofill used by the normal form to fill in any
         fields that are blank in the CSV (description, diseases, care, images).
      3. Uploads icon_url / image_url to Cloudinary (whether they came from
         the CSV or the AI) — exactly like the normal plant-creation flow.
      4. Creates the Plant record.  Duplicate species rows are skipped.

    If the CSV has no header row (i.e. the first row contains data, not column
    names), the standard header is automatically prepended.
    """
    decoded_file = file_content.decode("utf-8")

    # ── Step 0: sanitize raw text before the CSV parser ever sees it ────────
    decoded_file = _sanitize_csv_text(decoded_file)

    # ── Auto-detect missing header ──────────────────────────────────────────
    peek_reader = csv.reader(io.StringIO(decoded_file))
    first_row = next(peek_reader, [])
    first_row_lower = [c.strip().lower() for c in first_row]
    required = ["kingdom", "species", "common_name"]

    if not all(r in first_row_lower for r in required):
        logger.info("CSV header not detected; injecting standard header automatically.")
        decoded_file = STANDARD_HEADER + "\n" + decoded_file

    csv_reader = csv.DictReader(io.StringIO(decoded_file))

    # Normalise headers (after potential injection)
    headers = [h.strip().lower() for h in csv_reader.fieldnames or []]
    missing = [r for r in required if r not in headers]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    results: Dict[str, Any] = {"success": 0, "failed": 0, "errors": []}

    hierarchy_ranks = [
        Rank.KINGDOM,
        Rank.DIVISION,
        Rank.CLASS,
        Rank.ORDER,
        Rank.FAMILY,
        Rank.GENUS,
    ]

    row_idx = 0
    for row in csv_reader:
        row_idx += 1
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items()}

        try:
            # ------------------------------------------------------------------
            # 1. Build taxonomy hierarchy
            # ------------------------------------------------------------------
            parent_id = None
            for rank in hierarchy_ranks:
                name = row.get(rank.value.lower(), "")
                if not name:
                    if rank == Rank.KINGDOM:
                        raise ValueError("Kingdom is mandatory")
                    continue
                taxon = await _get_or_create_taxon(db, name, rank, parent_id)
                parent_id = taxon.id

            # Species taxon
            species_name = row.get("species", "")
            if not species_name:
                raise ValueError("Species name mandatory")
            species_taxon = await _get_or_create_taxon(
                db, species_name, Rank.SPECIES, parent_id
            )

            # ------------------------------------------------------------------
            # 2. Check for duplicate
            # ------------------------------------------------------------------
            existing = (
                await db.execute(select(Plant).where(Plant.taxon_id == species_taxon.id))
            ).scalars().first()
            if existing:
                # Skip silently — same behaviour as before
                continue

            # ------------------------------------------------------------------
            # 3. Read all text fields from CSV
            # ------------------------------------------------------------------
            common_name = row.get("common_name", "")
            if not common_name:
                raise ValueError("Common name mandatory")

            scientific_name = row.get("scientific_name", "") or None
            description    = row.get("description", "")    or None
            common_diseases = row.get("common_diseases", "") or None

            care_water       = row.get("care_water", "")       or None
            care_sunlight    = row.get("care_sunlight", "")    or None
            care_soil        = row.get("care_soil", "")        or None
            care_maintenance = row.get("care_maintenance", "") or None

            csv_icon_url  = row.get("icon_url", "")  or None
            csv_image_url = row.get("image_url", "") or None

            # ------------------------------------------------------------------
            # 4. AI autofill — runs only when fields are missing from CSV,
            #    exactly as the normal form does.
            # ------------------------------------------------------------------
            ai_icon_url  = None
            ai_image_url = None

            needs_ai = not all([
                description, common_diseases,
                care_water, care_sunlight, care_soil, care_maintenance,
                csv_icon_url, csv_image_url,
            ])

            if needs_ai:
                try:
                    # Fetch valid categories to make AI prompt dynamic
                    cat_stmt = select(Category.name)
                    cat_res = await db.execute(cat_stmt)
                    valid_categories = [c for c in cat_res.scalars().all()]
                    
                    ai = await generate_plant_details(
                        common_name=common_name,
                        scientific_name=scientific_name or species_name,
                        valid_categories=valid_categories
                    )

                    # Fill in only what the CSV left blank
                    if not description and ai.description:
                        description = ai.description
                    if not common_diseases and ai.common_diseases:
                        common_diseases = ai.common_diseases

                    ai_care = ai.care_data or {}
                    if not care_water and ai_care.get("water"):
                        care_water = ai_care["water"]
                    if not care_sunlight and ai_care.get("sunlight"):
                        care_sunlight = ai_care["sunlight"]
                    if not care_soil and ai_care.get("soil"):
                        care_soil = ai_care["soil"]
                    if not care_maintenance and ai_care.get("maintenance"):
                        care_maintenance = ai_care["maintenance"]

                    # Collect AI image URLs to upload later
                    ai_icon_url  = ai.icon_url  or None
                    ai_image_url = ai.image_url or None

                except Exception as ai_err:
                    # AI failure should not block the import — log and continue
                    logger.warning(
                        "Row %d: AI autofill failed for '%s': %s",
                        row_idx, common_name, ai_err,
                    )

            # ------------------------------------------------------------------
            # 5. Upload images to Cloudinary
            #    Priority: CSV URL > AI URL (same as normal form)
            # ------------------------------------------------------------------
            raw_icon  = csv_icon_url  or ai_icon_url
            raw_image = csv_image_url or ai_image_url

            icon_url  = await _cloudinary_url(raw_icon)
            image_url = await _cloudinary_url(raw_image)

            # ------------------------------------------------------------------
            # 6. Resolve category
            # ------------------------------------------------------------------
            category_str = (row.get("category", "") or "Other").title()
            cat_result = await db.execute(
                select(Category).filter(
                    func.lower(Category.name) == category_str.lower()
                )
            )
            cat_obj = cat_result.scalars().first()
            if not cat_obj:
                cat_obj = Category(name=category_str)
                db.add(cat_obj)
                await db.flush()
            category = cat_obj.name

            # ------------------------------------------------------------------
            # 7. Resolve planting place
            # ------------------------------------------------------------------
            place_str = (row.get("planting_place", "") or "Indoor & Outdoor").strip()
            # Normalise "Indoor & Outdoor" vs "Indoor And Outdoor"
            if "&" not in place_str:
                place_str = place_str.title()
            try:
                planting_place = PlantingPlace(place_str)
            except ValueError:
                planting_place = PlantingPlace.BOTH

            # ------------------------------------------------------------------
            # 8. Build care_data JSON (same shape as AI autofill)
            # ------------------------------------------------------------------
            care_data = None
            if any([care_water, care_sunlight, care_soil, care_maintenance]):
                care_data = {
                    "water":       care_water       or None,
                    "sunlight":    care_sunlight    or None,
                    "soil":        care_soil        or None,
                    "maintenance": care_maintenance or None,
                }

            # ------------------------------------------------------------------
            # 9. Create plant
            # ------------------------------------------------------------------
            plant = Plant(
                taxon_id=species_taxon.id,
                common_name=common_name,
                scientific_name=scientific_name,
                category=category,
                planting_place=planting_place,
                description=description,
                common_diseases=common_diseases,
                care_data=care_data,
                icon_url=icon_url,
                image_url=image_url,
            )
            db.add(plant)
            results["success"] += 1

        except Exception as exc:
            results["failed"] += 1
            results["errors"].append(f"Row {row_idx}: {exc}")
            continue

    await db.commit()
    return results
