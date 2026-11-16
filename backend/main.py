from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router, _surrogate_runner
from backend.core.config import SETTINGS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure run storage directory exists
    SETTINGS.runs_base_dir.mkdir(parents=True, exist_ok=True)
    # Pre-warm neural surrogate engine in memory
    try:
        if _surrogate_runner.is_available():
            print("[Backend] Pre-warming Neural Surrogate engine...")
            _surrogate_runner.warmup()
            print("[Backend] Neural Surrogate engine warm and ready.")
    except Exception as e:
        print(f"[Backend] Surrogate warmup warning: {e}")
    yield


def create_app() -> FastAPI:
    SETTINGS.runs_base_dir.mkdir(parents=True, exist_ok=True)
    application = FastAPI(
        title=SETTINGS.title,
        version=SETTINGS.version,
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(router)
    return application


app = create_app()
