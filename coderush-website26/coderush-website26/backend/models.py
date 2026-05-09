from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RestrictedZoneRow(Base):
    __tablename__ = "restricted_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="Restricted")
    polygon_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class DirectiveRow(Base):
    __tablename__ = "directives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ship_id: Mapped[str] = mapped_column(String(32), index=True)
    directive_type: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending accepted escalated expired
    captain_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class DistressRow(Base):
    __tablename__ = "distress_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ship_id: Mapped[str] = mapped_column(String(32), index=True)
    directive_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_text: Mapped[str] = mapped_column(Text)
    structured_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class AlertRow(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    severity_score: Mapped[float] = mapped_column(Float, default=50.0)
    ship_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    secondary_ship_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    zone_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(512))
    body: Mapped[str] = mapped_column(Text)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    cleared: Mapped[bool] = mapped_column(Boolean, default=False)
    predictive: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class FleetSnapshot(Base):
    __tablename__ = "fleet_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts_unix: Mapped[float] = mapped_column(Float, index=True)
    payload_json: Mapped[str] = mapped_column(Text)


class AssistanceRow(Base):
    __tablename__ = "assistance_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True)
    requesting_ship_id: Mapped[str] = mapped_column(String(32))
    target_ship_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    aid_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class AdvisorSuggestionRow(Base):
    __tablename__ = "advisor_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    rationale: Mapped[str] = mapped_column(Text)
    action_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="proposed")

