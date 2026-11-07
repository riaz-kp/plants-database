"""Write AI descriptions for every taxon that has none (or the old autofill placeholder).

Run from backend/:
    venv/bin/python scripts/fill_taxon_descriptions.py --dry-run --limit 20   # preview, saves nothing
    venv/bin/python scripts/fill_taxon_descriptions.py                        # fill them all
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.services.taxon_description_service import (  # noqa: E402
    DescriptionFillError,
    count_missing_descriptions,
    describe_fill_error,
    fill_missing_descriptions,
)


def print_batch(results, done, total):
    for rank, name, description in results:
        print(f"  {rank:<9} {name:<32} {description or '(no description returned)'}")
    print(f"-- {done}/{total}", flush=True)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="generate and print, but don't save")
    parser.add_argument("--limit", type=int, help="only this many taxa")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        print(f"{await count_missing_descriptions(db)} taxa without a description", flush=True)
        try:
            saved = await fill_missing_descriptions(db, limit=args.limit, dry_run=args.dry_run, on_batch=print_batch)
        except DescriptionFillError as exc:
            print(f"Some batches failed: {describe_fill_error(exc)}")
            saved = exc.saved
        if args.dry_run:
            print("Dry run: nothing saved")
        else:
            print(f"Saved {saved} descriptions; {await count_missing_descriptions(db)} still missing")


if __name__ == "__main__":
    asyncio.run(main())
