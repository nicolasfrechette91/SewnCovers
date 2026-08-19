"""Strict raster validation and deterministic metadata-free derivatives."""

from __future__ import annotations

import hashlib
import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_ENCODED_BYTES = 10 * 1024 * 1024
MIN_DIMENSION = 64
MAX_DIMENSION = 4096
MAX_PIXELS = 16_000_000
PROCESSING_VERSION = "tile-v1"
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageValidationError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class Crop:
    left: int
    top: int
    width: int
    height: int


@dataclass(frozen=True, slots=True)
class DerivativeResult:
    kind: str
    data: bytes
    content_type: str
    image_format: str
    width: int
    height: int
    checksum: str


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    original_checksum: str
    decoded_format: str
    decoded_width: int
    decoded_height: int
    derivatives: tuple[DerivativeResult, ...]


def _validate_container(data: bytes) -> None:
    """Reject trailing-payload polyglots before the permissive decoder sees them."""
    if data.startswith(b"\xff\xd8"):
        if not data.endswith(b"\xff\xd9"):
            raise ImageValidationError("malformed_image")
        return
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        if not data.endswith(b"\x00\x00\x00\x00IEND\xaeB`\x82"):
            raise ImageValidationError("malformed_image")
        return
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        if len(data) < 12 or int.from_bytes(data[4:8], "little") + 8 != len(data):
            raise ImageValidationError("malformed_image")
        return
    raise ImageValidationError("unsupported_signature")


def _encode_png(image: Image.Image, kind: str) -> DerivativeResult:
    output = io.BytesIO()
    image.save(output, format="PNG", compress_level=9, optimize=False)
    data = output.getvalue()
    return DerivativeResult(
        kind=kind,
        data=data,
        content_type="image/png",
        image_format="PNG",
        width=image.width,
        height=image.height,
        checksum=hashlib.sha256(data).hexdigest(),
    )


def process_image(
    data: bytes,
    declared_content_type: str,
    *,
    crop: Crop | None = None,
) -> ProcessedImage:
    if not 1 <= len(data) <= MAX_ENCODED_BYTES:
        raise ImageValidationError("encoded_size_invalid")
    _validate_container(data)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                decoded_format = str(probe.format or "").upper()
                if decoded_format not in ALLOWED_FORMATS:
                    raise ImageValidationError("unsupported_format")
                if ALLOWED_FORMATS[decoded_format] != declared_content_type:
                    raise ImageValidationError("content_type_mismatch")
                if getattr(probe, "n_frames", 1) != 1 or getattr(
                    probe, "is_animated", False
                ):
                    raise ImageValidationError("animated_image")
                width, height = probe.size
                if not (
                    MIN_DIMENSION <= width <= MAX_DIMENSION
                    and MIN_DIMENSION <= height <= MAX_DIMENSION
                    and width * height <= MAX_PIXELS
                ):
                    raise ImageValidationError("dimensions_invalid")
                probe.verify()

            with Image.open(io.BytesIO(data)) as source:
                source.load()
                oriented = ImageOps.exif_transpose(source)
                has_alpha = decoded_format in {"PNG", "WEBP"} and (
                    oriented.mode in {"RGBA", "LA"} or "transparency" in oriented.info
                )
                normalized = oriented.convert("RGBA" if has_alpha else "RGB")
                if crop is not None:
                    if (
                        crop.left < 0
                        or crop.top < 0
                        or crop.width < MIN_DIMENSION
                        or crop.height < MIN_DIMENSION
                        or crop.left + crop.width > normalized.width
                        or crop.top + crop.height > normalized.height
                    ):
                        raise ImageValidationError("crop_invalid")
                    normalized = normalized.crop(
                        (
                            crop.left,
                            crop.top,
                            crop.left + crop.width,
                            crop.top + crop.height,
                        )
                    )

                tile = normalized.copy()
                tile.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                thumbnail = normalized.copy()
                thumbnail.thumbnail((256, 256), Image.Resampling.LANCZOS)
                derivatives = (
                    _encode_png(tile, "tile"),
                    _encode_png(thumbnail, "thumbnail"),
                )
    except ImageValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageValidationError("decompression_bomb") from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ImageValidationError("malformed_image") from None

    return ProcessedImage(
        original_checksum=hashlib.sha256(data).hexdigest(),
        decoded_format=decoded_format,
        decoded_width=width,
        decoded_height=height,
        derivatives=derivatives,
    )
