"""Process-wide accessor for the live PositioningTracker.

Lets modules outside server.py (compass, advisor) read the current whale
positioning snapshot without taking a dependency on the FastAPI app's
lifespan closure.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .positioning import PositioningTracker

_tracker: Optional["PositioningTracker"] = None


def set_positioning_tracker(t: Optional["PositioningTracker"]) -> None:
    global _tracker
    _tracker = t


def get_positioning_tracker() -> Optional["PositioningTracker"]:
    return _tracker
