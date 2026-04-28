from __future__ import annotations

import time
from collections import defaultdict


class StaleDataChecker:
    def __init__(self, max_age_seconds: int = 10) -> None:
        self.max_age = max_age_seconds
        self._last_update: dict[str, float] = defaultdict(float)

    def update(self, symbol: str) -> None:
        self._last_update[symbol] = time.monotonic()

    def is_stale(self, symbol: str) -> bool:
        last = self._last_update.get(symbol)
        if last is None or last == 0:
            return True
        return (time.monotonic() - last) > self.max_age

    def age_seconds(self, symbol: str) -> float:
        last = self._last_update.get(symbol)
        if last is None or last == 0:
            return float("inf")
        return time.monotonic() - last
