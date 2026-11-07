import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter

from app.core.config import get_settings


def storage_root() -> Path:
    root = Path(get_settings().storage_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_file(relative: str, content: bytes) -> str:
    path = storage_root() / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return relative


def resolve(relative: str) -> Path:
    path = (storage_root() / relative).resolve()
    if storage_root() not in path.parents:
        raise ValueError("Invalid file path")
    return path


def split_labels(pdfs: list[bytes], count: int) -> list[bytes]:
    """Return one PDF per package. A combined PDF with one page per package is split page by page;
    otherwise every package gets the whole file."""
    if len(pdfs) == count:
        return pdfs
    pages = []
    for pdf in pdfs:
        reader = PdfReader(io.BytesIO(pdf))
        for page in reader.pages:
            writer = PdfWriter()
            writer.add_page(page)
            buf = io.BytesIO()
            writer.write(buf)
            pages.append(buf.getvalue())
    if len(pages) == count:
        return pages
    merged = merge(pdfs)
    return [merged] * count


def merge(pdfs: list[bytes]) -> bytes:
    writer = PdfWriter()
    for pdf in pdfs:
        writer.append(io.BytesIO(pdf))
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def merge_files(relatives: list[str]) -> bytes:
    seen, contents = set(), []
    for rel in relatives:
        if rel in seen:
            continue
        seen.add(rel)
        contents.append(resolve(rel).read_bytes())
    return merge(contents)
