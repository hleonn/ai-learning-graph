from fastapi import APIRouter
from datetime import datetime
from db.client import supabase

router = APIRouter()


@router.get("/health")
def health_check():
    """
    Verifica que el servidor está vivo y que
    la conexión a Supabase funciona.
    """
    supabase_status = "connected" if supabase else "disconnected"

    return {
        "status": "ok",
        "service": "graph-engine",
        "timestamp": datetime.utcnow().isoformat(),
        "supabase": supabase_status,
    }