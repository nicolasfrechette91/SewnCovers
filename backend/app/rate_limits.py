"""Per-network request limits for credential and anonymous write endpoints.

Each limit is a token bucket expressed as "N per period": up to N requests at
once, then one more each ``period / N``. The state is one timestamp per key and
rule (the generic cell rate algorithm), held in process memory. That is enough
on Render's single free instance: it only sleeps after 15 minutes without any
traffic, so an ongoing burst keeps its counters, and a restart merely forgets
budgets that would refill anyway. Keys whose buckets are full again are
evicted, and the number of keys is capped.

Clients are keyed by network (IPv4 address or IPv6 /64), so people behind one
NAT or carrier gateway share a budget; the limits are sized so that sharing
stays unnoticeable for normal use.
"""

from __future__ import annotations

import math
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, field
from threading import Lock
from typing import Annotated

from fastapi import Depends, Request

from app.client_ip import network_key
from app.errors import APIProblem, ErrorCode

MAX_TRACKED_KEYS = 20_000
SWEEP_INTERVAL_SECONDS = 60.0


@dataclass(frozen=True, slots=True)
class RateLimit:
    limit: int
    period_seconds: float

    @property
    def interval(self) -> float:
        return self.period_seconds / self.limit


class RateLimiter:
    """Bounded, thread-safe limiter enforcing every rule for each key."""

    def __init__(
        self,
        name: str,
        rules: tuple[RateLimit, ...],
        *,
        clock: Callable[[], float] = time.monotonic,
        max_keys: int = MAX_TRACKED_KEYS,
    ) -> None:
        if not rules:
            raise ValueError("a rate limiter needs at least one rule")
        self.name = name
        self.rules = rules
        self._clock = clock
        self._max_keys = max_keys
        # key -> theoretical arrival time per rule; ordered oldest-touched first.
        self._state: OrderedDict[str, tuple[float, ...]] = OrderedDict()
        self._lock = Lock()
        self._next_sweep = clock() + SWEEP_INTERVAL_SECONDS

    def hit(self, key: str) -> int | None:
        """Record one request; return seconds to wait if it is over a limit."""
        now = self._clock()
        with self._lock:
            if now >= self._next_sweep:
                self._sweep(now)
            current = self._state.get(key)
            arrivals: list[float] = []
            wait = 0.0
            for position, rule in enumerate(self.rules):
                previous = current[position] if current is not None else now
                arrival = max(previous, now) + rule.interval
                wait = max(wait, arrival - rule.period_seconds - now)
                arrivals.append(arrival)
            if wait > 0:
                return max(1, math.ceil(wait))
            self._state[key] = tuple(arrivals)
            self._state.move_to_end(key)
            while len(self._state) > self._max_keys:
                self._state.popitem(last=False)
            return None

    def reset(self) -> None:
        with self._lock:
            self._state.clear()

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._state)

    def _sweep(self, now: float) -> None:
        # A key whose every bucket has refilled carries no information.
        for key in [key for key, value in self._state.items() if max(value) <= now]:
            del self._state[key]
        self._next_sweep = now + SWEEP_INTERVAL_SECONDS


@dataclass(slots=True)
class RateLimitPolicy:
    """The limiters one application instance enforces."""

    login: RateLimiter = field(
        default_factory=lambda: RateLimiter("login", (RateLimit(20, 600),))
    )
    register: RateLimiter = field(
        default_factory=lambda: RateLimiter(
            "register", (RateLimit(5, 3_600), RateLimit(20, 86_400))
        )
    )
    designs: RateLimiter = field(
        default_factory=lambda: RateLimiter(
            "designs", (RateLimit(20, 600), RateLimit(200, 86_400))
        )
    )


def wait_phrase(seconds: int) -> str:
    """Describe a Retry-After value for people, rounding up to whole minutes."""
    if seconds < 60:
        return "a few seconds" if seconds <= 5 else f"{seconds} seconds"
    minutes = math.ceil(seconds / 60)
    if minutes < 60:
        return "1 minute" if minutes == 1 else f"{minutes} minutes"
    hours = math.ceil(minutes / 60)
    return "1 hour" if hours == 1 else f"{hours} hours"


def too_many_requests(code: ErrorCode, message: str, retry_after: int) -> APIProblem:
    return APIProblem(
        429,
        code,
        f"{message} Try again in {wait_phrase(retry_after)}.",
        ("request",),
        headers={"Retry-After": str(retry_after)},
    )


def _limit(name: str, code: ErrorCode, message: str) -> Callable[[Request], None]:
    def enforce(request: Request) -> None:
        policy: RateLimitPolicy = request.app.state.rate_limits
        limiter: RateLimiter = getattr(policy, name)
        host = request.client.host if request.client is not None else None
        retry_after = limiter.hit(network_key(host))
        if retry_after is not None:
            raise too_many_requests(code, message, retry_after)

    return enforce


LoginRateLimit = Annotated[
    None,
    Depends(
        _limit(
            "login",
            "credential_throttled",
            "Too many sign-in attempts from your network.",
        )
    ),
]
RegisterRateLimit = Annotated[
    None,
    Depends(
        _limit(
            "register",
            "credential_throttled",
            "Too many accounts were created from your network.",
        )
    ),
]
DesignRateLimit = Annotated[
    None,
    Depends(
        _limit(
            "designs",
            "rate_limited",
            "Too many designs were saved from your network.",
        )
    ),
]
