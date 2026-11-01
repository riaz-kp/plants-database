"""Fills in short AI-written descriptions for taxa that don't have one."""
import asyncio
import logging
from typing import Callable, Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.enums import Rank
from app.models.taxon import Taxon
from app.services.ai_service import generate_taxon_descriptions

logger = logging.getLogger(__name__)

# What AI-autofilled taxa used to get instead of a description
LEGACY_PLACEHOLDER = "Auto-generated via AI autofill."
BATCH_SIZE = 30
RANK_ORDER = list(Rank)


def needs_description(description: Optional[str]) -> bool:
    return not description or not description.strip() or description.strip() == LEGACY_PLACEHOLDER


def _missing_description_clause():
    return or_(
        Taxon.description.is_(None),
        func.trim(Taxon.description) == "",
        func.trim(Taxon.description) == LEGACY_PLACEHOLDER,
    )


async def count_missing_descriptions(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(Taxon).where(_missing_description_clause()))
    return result.scalar_one()


async def fill_missing_descriptions(
    db: AsyncSession,
    limit: Optional[int] = None,
    dry_run: bool = False,
    on_batch: Optional[Callable[[list[tuple[str, str, Optional[str]]], int, int], None]] = None,
) -> int:
    """Write descriptions for every taxon without one; returns how many were saved.

    Broader ranks go first. A description edited in the meantime is never overwritten.
    `limit` counts distinct rank + name pairs. on_batch(results, done, total) gets
    (rank, name, description) for each of them in the batch.
    """
    rows = (await db.execute(
        select(Taxon.id, Taxon.name, Taxon.rank, Taxon.parent_id, Taxon.description)
    )).all()
    by_id = {row.id: row for row in rows}

    def lineage(row) -> str:
        names = []
        parent_id = row.parent_id
        while parent_id and parent_id in by_id and len(names) < 10:
            names.append(by_id[parent_id].name)
            parent_id = by_id[parent_id].parent_id
        return " › ".join(reversed(names))

    pending = sorted(
        (row for row in rows if needs_description(row.description)),
        key=lambda row: (RANK_ORDER.index(row.rank), lineage(row), row.name.lower()),
    )
    # The tree holds the same taxon under synonym parents (e.g. Liliopsida under both
    # Magnoliophyta and Tracheophyta), so describe each taxon once and reuse it.
    # Species are mostly stored as bare epithets ("indica"), so their genus is part of the key.
    def same_taxon_key(row) -> tuple:
        key = (row.rank, row.name.strip().lower())
        if row.rank == Rank.SPECIES:
            parent = by_id.get(row.parent_id)
            key += ((parent.name.strip().lower() if parent else ""),)
        return key

    groups: dict[tuple, list] = {}
    for row in pending:
        groups.setdefault(same_taxon_key(row), []).append(row)
    unique = list(groups.values())
    if limit is not None:
        unique = unique[:limit]

    saved = 0
    failures_in_a_row = 0
    for start in range(0, len(unique), BATCH_SIZE):
        batch = unique[start:start + BATCH_SIZE]
        try:
            descriptions = await generate_taxon_descriptions([
                {"rank": rows_[0].rank.value, "name": rows_[0].name, "lineage": lineage(rows_[0])} for rows_ in batch
            ])
            failures_in_a_row = 0
        except Exception:
            logger.exception("Generating taxon descriptions failed for a batch of %d", len(batch))
            failures_in_a_row += 1
            if failures_in_a_row >= 3:
                raise
            continue

        if not dry_run:
            for same_taxa, description in zip(batch, descriptions):
                if not description:
                    continue
                result = await db.execute(
                    update(Taxon)
                    .where(Taxon.id.in_([row.id for row in same_taxa]), _missing_description_clause())
                    .values(description=description)
                )
                saved += result.rowcount
            await db.commit()

        if on_batch:
            on_batch(
                [(rows_[0].rank.value, rows_[0].name, d) for rows_, d in zip(batch, descriptions)],
                start + len(batch),
                len(unique),
            )
    return saved


_fill_lock = asyncio.Lock()
_fill_requested_again = False


async def fill_missing_descriptions_in_background() -> None:
    """Fill every missing description in its own session (for FastAPI BackgroundTasks).

    Only one run at a time; a request made during a run triggers one more pass afterwards,
    so taxa created mid-run are picked up too.
    """
    global _fill_requested_again
    if _fill_lock.locked():
        _fill_requested_again = True
        return
    async with _fill_lock:
        while True:
            _fill_requested_again = False
            try:
                async with AsyncSessionLocal() as db:
                    saved = await fill_missing_descriptions(db)
                logger.info("Filled %d taxon descriptions", saved)
            except Exception:
                logger.exception("Filling taxon descriptions failed")
                return
            if not _fill_requested_again:
                return


def fill_running() -> bool:
    return _fill_lock.locked()
