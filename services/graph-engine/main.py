from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from routers import health, graph, mastery, ai, bootcamp

app = FastAPI(
    title="AI Learning Graph — Graph Engine",
    description="Algoritmos de grafos, BKT mastery scoring y gap detection",
    version="0.1.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Permitir tanto desarrollo como producción
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "https://ai-learning-graph.vercel.app",
    "https://mygateway.up.railway.app",
    "https://ai-learning-graph-production.up.railway.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router,   tags=["Health"])
app.include_router(graph.router,    prefix="/graph",   tags=["Graph"])
app.include_router(mastery.router,  prefix="/mastery", tags=["Mastery"])
app.include_router(ai.router,       prefix="/ai",      tags=["AI"])
app.include_router(bootcamp.router)

@app.on_event("startup")
async def startup():
    logger.info("Graph Engine arrancando...")
    logger.info(f"CORS permitido para: {ALLOWED_ORIGINS}")
    logger.info("Docs disponibles en: /docs")
