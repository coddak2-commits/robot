from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import auth, params, jobs, overrides, promotions, deviations, settings as settings_api, users, admin_ops, dashboard
from app.utils.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="FR3-WMS Backend",
    version="0.2.0",
    description="갭 기반 용접 파라미터 시스템 API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(params.router)
app.include_router(jobs.router)
app.include_router(overrides.router)
app.include_router(promotions.router)
app.include_router(deviations.router)
app.include_router(settings_api.router)
app.include_router(admin_ops.router)
app.include_router(dashboard.router)


@app.get("/")
def root():
    return {"service": "FR3-WMS Backend", "version": "0.2.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True,
    )
