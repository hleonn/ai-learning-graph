from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def mastery_root():
    return {"message": "Mastery router activo — endpoints próximamente"}