"""FastAPI entrypoint. Serves the API only; Next.js is a separate process."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import admin_bootstrap, geoip
from .api import admin, auth, download, earnings, files, public
from .config import settings
from .db import close, pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()
    await admin_bootstrap.ensure_admin_account()
    yield
    await geoip.close()
    await close()


app = FastAPI(title="Tele Upload API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.site_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(files.router)
app.include_router(download.router)
app.include_router(earnings.router)
app.include_router(public.router)
app.include_router(admin.router)


@app.get("/healthz")
async def healthz() -> dict:
    db = await pool()
    await db.fetchval("SELECT 1")
    return {"ok": True}
