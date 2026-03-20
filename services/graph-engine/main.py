from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from routers import health, graph, mastery

app = FastAPI(
    title="AI Learning Graph — Graph Engine",
    description="Algoritmos de grafos, BKT mastery scoring y gap detection",
    version="0.1.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Permite que el frontend React (puerto 5173) hable con este servicio
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router, tags=["Health"])
app.include_router(graph.router,  prefix="/graph",   tags=["Graph"])
app.include_router(mastery.router, prefix="/mastery", tags=["Mastery"])


@app.on_event("startup")
async def startup():
    logger.info("Graph Engine arrancando...")
    logger.info("Docs disponibles en: http://localhost:8000/docs")