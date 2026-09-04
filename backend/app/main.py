import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.accounts.store import store
from app.admin import mount_admin
from app.api.auth import router as auth_router
from app.api.commerce import router as commerce_router
from app.api.operator import router as operator_router
from app.api.stylize import router as stylize_router
from app.api.crm import router as crm_router
from app.api.track import router as track_router
from app.api.tv import router as tv_router
from app.api.zoo import router as zoo_router
from app.persistence.db import init_schema, ping_database
from app.persistence.import_json import import_accounts_json, import_commerce_json
from app.settings import get_settings

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("virtual_zoo")


def _legacy_json_paths() -> tuple[Path, Path]:
    accounts = (
        Path(settings.accounts_path)
        if settings.accounts_path.strip()
        else Path("/app/.data/accounts.json")
    )
    commerce = (
        Path(settings.commerce_path)
        if settings.commerce_path.strip()
        else accounts.with_name("commerce.json")
    )
    return accounts, commerce


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_schema()
    accounts_path, commerce_path = _legacy_json_paths()
    imported = import_accounts_json(accounts_path)
    import_commerce_json(commerce_path)
    from app.persistence.db import seed_packs
    from app.persistence.db import session as db_session

    with db_session() as db:
        seed_packs(db)
    logger.info("database ready parents=%s imported=%s", store.count_parents(), imported)
    yield


app = FastAPI(
    title="Virtual Zoo API",
    version="0.1.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(SessionMiddleware, secret_key=settings.admin_secret_key)

cors_origins = [
    origin.strip()
    for origin in settings.cors_origins.split(",")
    if origin.strip()
]
if settings.environment == "development":
    cors_origins.extend(
        [
            "http://localhost:5178",
            "http://127.0.0.1:5178",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5175",
            "http://127.0.0.1:5175",
        ]
    )
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

app.include_router(auth_router)
app.include_router(zoo_router)
app.include_router(stylize_router)
app.include_router(tv_router)
app.include_router(commerce_router)
app.include_router(operator_router)
app.include_router(track_router)
app.include_router(crm_router)
mount_admin(app)


@app.get("/health", tags=["system"])
async def health():
    try:
        ping_database()
    except Exception:
        logger.exception("database ping failed")
        return JSONResponse(
            {"status": "error", "environment": settings.environment, "database": "error"},
            status_code=503,
        )
    return {"status": "ok", "environment": settings.environment, "database": "ok"}
