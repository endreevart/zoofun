from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.stylize import router as stylize_router
from app.settings import get_settings

settings = get_settings()

app = FastAPI(
    title="Virtual Zoo API",
    version="0.1.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url=None,
)

if settings.environment == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5178",
            "http://127.0.0.1:5178",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

app.include_router(stylize_router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
