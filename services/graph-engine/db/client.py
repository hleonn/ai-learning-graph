import os
from supabase import create_client, Client
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError(
            "SUPABASE_URL y SUPABASE_SERVICE_KEY deben estar en .env"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# Cliente global reutilizable
supabase: Client | None = None

try:
    supabase = get_supabase()
    logger.info("Conexión a Supabase establecida")
except TypeError as e:
    # Workaround para bug 'proxy' en supabase-py + httpx
    logger.warning(f"Reintentando conexión Supabase sin proxy: {e}")
    try:
        import httpx
        from supabase.client import ClientOptions
        options = ClientOptions()
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY, options)
        logger.info("Conexión a Supabase establecida (fallback)")
    except Exception as e2:
        logger.error(f"Error conectando a Supabase: {e2}")
except Exception as e:
    logger.error(f"Error conectando a Supabase: {e}")