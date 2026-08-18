"""Small deterministic process-local protection for credential endpoints."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock

ATTEMPT_LIMIT = 5
WINDOW_SECONDS = 300


class AuthenticationThrottledError(RuntimeError):
    """A credential key exhausted its bounded rolling window."""

    def __init__(self, retry_after: int) -> None:
        self.retry_after = max(1, retry_after)
        super().__init__("authentication attempts are temporarily limited")


class AuthenticationThrottle:
    """Bounded in-memory limiter; deterministic clocks are injectable in tests."""

    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.monotonic,
        attempt_limit: int = ATTEMPT_LIMIT,
        window_seconds: int = WINDOW_SECONDS,
    ) -> None:
        self._clock = clock
        self._attempt_limit = attempt_limit
        self._window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check_and_record(self, key: str) -> None:
        now = self._clock()
        cutoff = now - self._window_seconds
        with self._lock:
            attempts = self._attempts[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= self._attempt_limit:
                retry_after = int(self._window_seconds - (now - attempts[0])) + 1
                raise AuthenticationThrottledError(retry_after)
            attempts.append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


authentication_throttle = AuthenticationThrottle()
