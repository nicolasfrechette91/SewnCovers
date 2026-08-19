"""Fail-closed image moderation providers with bounded public audit output."""

from __future__ import annotations

import base64
import hashlib
import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.settings import Settings, get_settings


class ModerationUnavailable(RuntimeError):
    """Provider absence or failure; callers must never convert this to approval."""


@dataclass(frozen=True, slots=True)
class ModerationResult:
    approved: bool
    provider: str
    model: str
    request_id_hash: str | None = None


class ImageModerationProvider(ABC):
    @abstractmethod
    def moderate(self, image: bytes, content_type: str) -> ModerationResult: ...


class UnavailableModerationProvider(ImageModerationProvider):
    def moderate(self, image: bytes, content_type: str) -> ModerationResult:
        del image, content_type
        raise ModerationUnavailable("moderation_unconfigured")


class DeterministicModerationProvider(ImageModerationProvider):
    def __init__(self, *, approved: bool) -> None:
        self._approved = approved

    def moderate(self, image: bytes, content_type: str) -> ModerationResult:
        del image, content_type
        return ModerationResult(
            approved=self._approved,
            provider="development",
            model="deterministic-v1",
        )


class OpenAIModerationProvider(ImageModerationProvider):
    """Official POST /v1/moderations image-input adapter; no user metadata sent."""

    endpoint = "https://api.openai.com/v1/moderations"

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def moderate(self, image: bytes, content_type: str) -> ModerationResult:
        payload = json.dumps(
            {
                "model": self._model,
                "input": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:"
                            f"{content_type};base64,{base64.b64encode(image).decode('ascii')}"
                        },
                    }
                ],
            },
            separators=(",", ":"),
        ).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=payload,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = json.loads(response.read(256_000))
        except (OSError, urllib.error.URLError, json.JSONDecodeError, ValueError):
            raise ModerationUnavailable("moderation_provider_failed") from None
        try:
            flagged = body["results"][0]["flagged"]
            response_model = body["model"]
            request_id = body.get("id")
            if not isinstance(flagged, bool) or not isinstance(response_model, str):
                raise TypeError
        except (KeyError, IndexError, TypeError):
            raise ModerationUnavailable("moderation_response_invalid") from None
        request_id_hash = (
            hashlib.sha256(request_id.encode("utf-8")).hexdigest()
            if isinstance(request_id, str)
            else None
        )
        return ModerationResult(
            approved=not flagged,
            provider="openai",
            model=response_model[:80],
            request_id_hash=request_id_hash,
        )


def get_moderation_provider(
    settings: Settings | None = None,
) -> ImageModerationProvider:
    configured = settings or get_settings()
    if configured.moderation_provider == "development-approve":
        if configured.environment not in {"development", "test"}:
            raise ModerationUnavailable("unsafe_moderation_configuration")
        return DeterministicModerationProvider(approved=True)
    if configured.moderation_provider == "development-reject":
        if configured.environment not in {"development", "test"}:
            raise ModerationUnavailable("unsafe_moderation_configuration")
        return DeterministicModerationProvider(approved=False)
    if configured.moderation_provider == "openai" and configured.openai_api_key:
        return OpenAIModerationProvider(
            configured.openai_api_key.get_secret_value(),
            configured.openai_moderation_model,
        )
    return UnavailableModerationProvider()
