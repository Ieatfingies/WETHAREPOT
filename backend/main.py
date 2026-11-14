from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.core.config import SETTINGS


def create_app() -> FastAPI:
    SETTINGS.runs_base_dir.mkdir(parents=True, exist_ok=True)
    application = FastAPI(
        title=SETTINGS.title,
        version=SETTINGS.version,
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