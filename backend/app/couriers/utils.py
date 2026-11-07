from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def parse_datetime(value: str | None, time_value: str | None = None) -> datetime:
    """Parse the date formats couriers send; times without a zone are taken as IST."""
    if not value:
        return datetime.now(IST)
    text = value.strip()
    if time_value:
        text = f"{text[:10]}T{time_value.strip()}"
    for parser in (
        lambda s: datetime.fromisoformat(s.replace("Z", "+00:00")),
        lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M:%S"),
        lambda s: datetime.strptime(s, "%d%m%Y%H%M%S"),
        lambda s: datetime.strptime(s, "%d-%m-%Y %H:%M:%S"),
    ):
        try:
            parsed = parser(text)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=IST)
        except ValueError:
            continue
    return datetime.now(IST)


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None
