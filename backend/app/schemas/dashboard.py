from datetime import date

from pydantic import BaseModel


class TrendPoint(BaseModel):
    period: date
    counts: dict[str, int]


class ProviderSummary(BaseModel):
    provider_id: int
    provider_name: str
    count: int
    spend: float


class DashboardOut(BaseModel):
    date_from: date
    date_to: date
    bucket: str
    total: int
    status_counts: dict[str, int]
    trend: list[TrendPoint]
    by_provider: list[ProviderSummary]
