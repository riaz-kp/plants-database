"""Fills in short AI-written descriptions for taxa that don't have one."""
import asyncio
import json
import logging
from typing import Callable, Optional

from fastapi import HTTPException
from openai import APIConnectionError, APIStatusError, RateLimitError
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


class DescriptionFillError(Exception):
    """Some batches couldn't be written. `saved` descriptions were still saved; `cause` is the last failure."""

    def __init__(self, saved: int, failed: int, cause: Exception):
        super().__init__(f"{failed} taxa could not be described ({saved} saved): {cause!r}")
        self.saved = saved
        self.failed = failed
        self.cause = cause


class EmptyReplyError(Exception):
    """The AI answered, but with no usable descriptions."""


def describe_fill_error(exc: Exception) -> str:
    """A short, user-facing reason a fill run failed."""
    cause = exc.cause if isinstance(exc, DescriptionFillError) else exc
    if isinstance(cause, RateLimitError):
        reason = "The AI service's rate limit was reached. Try again in a few minutes."
    elif isinstance(cause, APIStatusError):
        reason = f"The AI service returned an error ({cause.status_code})."
    elif isinstance(cause, APIConnectionError):
        reason = "Couldn't reach the AI service. Check the internet connection."
    elif isinstance(cause, HTTPException):
        reason = str(cause.detail)
    elif isinstance(cause, (json.JSONDecodeError, EmptyReplyError)):
        reason = "The AI's reply couldn't be read."
    else:
        reason = f"Something went wrong ({type(cause).__name__})."
    if isinstance(exc, DescriptionFillError) and exc.saved:
        reason = f"Saved {exc.saved}, but some failed. {reason}"
    return reason


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
    A batch that fails is skipped and the rest still run; afterwards DescriptionFillError
    is raised (or straight away after three failed batches in a row).
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
    failed = 0
    last_error: Optional[Exception] = None
    failures_in_a_row = 0
    for start in range(0, len(unique), BATCH_SIZE):
        batch = unique[start:start + BATCH_SIZE]
        try:
            descriptions = await generate_taxon_descriptions([
                {"rank": rows_[0].rank.value, "name": rows_[0].name, "lineage": lineage(rows_[0])} for rows_ in batch
            ])
            if not any(descriptions):
                raise EmptyReplyError("no descriptions in the AI reply")
            failures_in_a_row = 0
        except Exception as exc:
            logger.exception("Generating taxon descriptions failed for a batch of %d", len(batch))
            failed += len(batch)
            last_error = exc
            failures_in_a_row += 1
            if failures_in_a_row >= 3:
                raise DescriptionFillError(saved, len(unique) - start, exc) from exc
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
    if last_error is not None:
        raise DescriptionFillError(saved, failed, last_error) from last_error
    return saved


_fill_lock = asyncio.Lock()
_fill_requested_again = False
_last_error: Optional[str] = None


async def fill_missing_descriptions_in_background() -> None:
    """Fill every missing description in its own session (for FastAPI BackgroundTasks).

    Only one run at a time; a request made during a run triggers one more pass afterwards,
    so taxa created mid-run are picked up too. If a run fails, last_fill_error() says why.
    """
    global _fill_requested_again, _last_error
    if _fill_lock.locked():
        _fill_requested_again = True
        return
    async with _fill_lock:
        while True:
            _fill_requested_again = False
            _last_error = None
            try:
                async with AsyncSessionLocal() as db:
                    saved = await fill_missing_descriptions(db)
                logger.info("Filled %d taxon descriptions", saved)
            except Exception as exc:
                logger.exception("Filling taxon descriptions failed")
                _last_error = describe_fill_error(exc)
                return
            if not _fill_requested_again:
                return


def fill_running() -> bool:
    return _fill_lock.locked()


def last_fill_error() -> Optional[str]:
    """Why the last background run failed, or None if it succeeded (or none has run)."""
    return _last_error
