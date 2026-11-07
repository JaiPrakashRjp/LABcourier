"""Checks every package still on the move. Run as its own process:

    python -m app.workers.tracking           # loops every TRACKING_POLL_MINUTES
    python -m app.workers.tracking --once    # one pass, e.g. from a scheduler
"""

import argparse
import logging
import time

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services import tracking_service

log = logging.getLogger("tracking")


def run_once() -> int:
    db = SessionLocal()
    try:
        return tracking_service.poll(db)
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    interval = get_settings().tracking_poll_minutes * 60
    while True:
        try:
            log.info("Tracking pass updated %s packages", run_once())
        except Exception:
            log.exception("Tracking pass failed")
        if args.once:
            return
        time.sleep(interval)


if __name__ == "__main__":
    main()
