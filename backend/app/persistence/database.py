"""Lazy SQLAlchemy engine and request-session ownership."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from threading import RLock
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import URL, Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session, sessionmaker

from app.settings import Settings, get_settings

type SessionFactory = sessionmaker[Session]
type EngineOptions = Mapping[str, Any]
type EngineCreator = Callable[[Settings, EngineOptions], Engine]
type SessionFactoryBuilder = Callable[[Engine], SessionFactory]


class DatabaseConfigurationError(RuntimeError):
    """Report unusable database configuration without revealing its value."""


def _configured_url(settings: Settings) -> URL:
    if settings.database_url is None:
        raise DatabaseConfigurationError(
            "DATABASE_URL is required when database functionality is requested"
        )

    secret_url = settings.database_url.get_secret_value()
    try:
        url = make_url(secret_url)
    except ArgumentError:
        raise DatabaseConfigurationError(
            "DATABASE_URL must be a valid SQLAlchemy database URL"
        ) from None

    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")

    return url


def create_database_engine(
    settings: Settings,
    engine_options: EngineOptions | None = None,
) -> Engine:
    """Create a configured engine without checking out a database connection."""
    options = dict(engine_options or {})
    options.setdefault("pool_pre_ping", True)

    try:
        return create_engine(_configured_url(settings), **options)
    except (ArgumentError, ImportError):
        raise DatabaseConfigurationError(
            "DATABASE_URL could not configure the database engine"
        ) from None


def create_session_factory(engine: Engine) -> SessionFactory:
    """Bind typed, non-expiring sessions to one process-owned engine."""
    return sessionmaker(
        bind=engine,
        class_=Session,
        autoflush=False,
        expire_on_commit=False,
    )


class Database:
    """Own one lazily created engine and session factory."""

    def __init__(
        self,
        *,
        settings_provider: Callable[[], Settings] = get_settings,
        engine_creator: EngineCreator = create_database_engine,
        session_factory_builder: SessionFactoryBuilder = create_session_factory,
        engine_options: EngineOptions | None = None,
    ) -> None:
        self._settings_provider = settings_provider
        self._engine_creator = engine_creator
        self._session_factory_builder = session_factory_builder
        self._engine_options = dict(engine_options or {})
        self._engine: Engine | None = None
        self._session_factory: SessionFactory | None = None
        self._lock = RLock()

    @property
    def initialized(self) -> bool:
        """Return whether this owner has created an engine."""
        with self._lock:
            return self._engine is not None

    @property
    def engine(self) -> Engine:
        """Create the process engine only when database work first requests it."""
        with self._lock:
            if self._engine is None:
                self._engine = self._engine_creator(
                    self._settings_provider(),
                    self._engine_options,
                )
            return self._engine

    @property
    def session_factory(self) -> SessionFactory:
        """Create the typed factory only after its engine is requested."""
        with self._lock:
            if self._session_factory is None:
                self._session_factory = self._session_factory_builder(self.engine)
            return self._session_factory

    def open_session(self) -> Session:
        """Open one caller-owned session."""
        return self.session_factory()

    def dispose(self) -> None:
        """Dispose an initialized engine and allow clean recreation."""
        with self._lock:
            engine = self._engine
            self._session_factory = None
            self._engine = None

        if engine is not None:
            engine.dispose()

    def __repr__(self) -> str:
        return f"{type(self).__name__}(initialized={self.initialized})"


_application_database = Database()


def get_database() -> Database:
    """Provide the application-owned database boundary for dependency injection."""
    return _application_database


def dispose_application_database() -> None:
    """Release application-owned pooled connections during process shutdown."""
    _application_database.dispose()


def get_session(
    database: Annotated[Database, Depends(get_database)],
) -> Iterator[Session]:
    """Yield one request session, rolling back failures and always closing it."""
    session = database.open_session()
    try:
        yield session
    except BaseException:
        try:
            session.rollback()
        except Exception:
            pass
        raise
    finally:
        session.close()


DatabaseSession = Annotated[Session, Depends(get_session)]
