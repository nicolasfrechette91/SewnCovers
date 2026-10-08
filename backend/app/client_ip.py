"""Resolve the connecting client's address behind Render's proxy.

The socket peer is always Render's proxy. Render's proxies append to
``X-Forwarded-For`` and keep whatever entries the client sent, so the
connecting client is a fixed distance from the right: the third entry. In
production that one entry replaces the socket peer; nothing else in the header
is trusted, because a client can put anything before it. Outside production no
trusted proxy writes the header, so it is ignored and the socket peer is used.

``CLIENT_IP_HEADER`` and ``CLIENT_IP_INDEX`` change the source without a code
change if the platform's proxies change (see docs/deployment.md).
"""

from __future__ import annotations

import ipaddress

from starlette.types import ASGIApp, Receive, Scope, Send

from app.settings import ClientIpHeader


def _parse_address(value: str) -> str | None:
    candidate = value.strip()
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1 : candidate.index("]")]
    try:
        address = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return str(address)


def forwarded_client(
    header_values: list[str], header: ClientIpHeader, index: int
) -> tuple[str | None, int]:
    """Return the trusted client address and how many entries the header had.

    Repeated headers are joined as one list, as proxies treat them. A missing,
    too-short, or malformed value yields ``None`` so the caller keeps the peer.
    """
    if header == "none" or not header_values:
        return None, 0
    entries = [item for value in header_values for item in value.split(",")]
    if header == "cf-connecting-ip":
        entries = entries[:1] if len(entries) == 1 else []
    if not entries or index >= len(entries) or -index > len(entries):
        return None, len(entries)
    return _parse_address(entries[index]), len(entries)


def network_key(host: str | None) -> str:
    """Return the rate-limit key for an address: IPv4 /32 or IPv6 /64.

    One machine can rotate through every address in an IPv6 /64, so limits
    keyed on single IPv6 addresses would be trivially bypassed.
    """
    if host is None:
        return "unknown"
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host[:64]
    if address.version == 4:
        return str(address)
    return str(ipaddress.ip_network(f"{address}/64", strict=False))


class ClientAddressMiddleware:
    """Replace the socket peer with the configured trusted client address."""

    def __init__(self, app: ASGIApp, *, header: ClientIpHeader, index: int) -> None:
        self.app = app
        self.header = header
        self.index = index
        self._header_name = header.encode("latin-1")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in {"http", "websocket"} and self.header != "none":
            values = [
                value.decode("latin-1")
                for name, value in scope.get("headers") or []
                if name == self._header_name
            ]
            host, entries = forwarded_client(values, self.header, self.index)
            state = scope.setdefault("state", {})
            if self.header == "x-forwarded-for":
                state["forwarded_entries"] = entries
            if host is not None:
                scope["client"] = (host, 0)
        await self.app(scope, receive, send)
