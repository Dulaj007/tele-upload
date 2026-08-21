"""Dashboard file listing. Read-only: uploads happen in the bot, by design."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..db import pool
from .auth import current_user

router = APIRouter(prefix="/files", tags=["files"])


class FileRow(BaseModel):
    slug: str
    name: str
    stored_name: str
    size_bytes: int
    kind: str
    download_count: int
    created_at: str
    share_url: str


class FileList(BaseModel):
    handle: str
    total: int
    files: list[FileRow]


@router.get("", response_model=FileList)
async def list_files(user: dict = Depends(current_user)) -> FileList:
    db = await pool()
    rows = await db.fetch(
        """SELECT slug, original_name, stored_name, size_bytes, kind,
                  download_count, created_at
           FROM files WHERE owner_id = $1 AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 200""",
        user["id"],
    )
    return FileList(
        handle=user["handle"],
        total=len(rows),
        files=[
            FileRow(
                slug=r["slug"], name=r["original_name"], stored_name=r["stored_name"],
                size_bytes=r["size_bytes"], kind=r["kind"],
                download_count=r["download_count"],
                created_at=r["created_at"].isoformat(),
                share_url=f"{settings.site_url}/d/{r['slug']}",
            )
            for r in rows
        ],
    )


@router.delete("/{slug}")
async def delete_file(slug: str, user: dict = Depends(current_user)) -> dict:
    """Soft delete. The channel message stays; old links start 404ing honestly."""
    db = await pool()
    updated = await db.execute(
        "UPDATE files SET deleted_at = now() WHERE slug = $1 AND owner_id = $2 AND deleted_at IS NULL",
        slug, user["id"],
    )
    if updated.endswith("0"):
        raise HTTPException(404, "No such file.")
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(current_user)) -> dict:
    return {
        "handle": user["handle"],
        "telegram_username": user["telegram_username"],
        "upload_bot": settings.upload_bot_username,
    }
