from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def graph_root():
    return {"message": "Graph router activo — endpoints próximamente"}