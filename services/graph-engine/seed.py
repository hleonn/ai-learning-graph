import os
import sys
from dotenv import load_dotenv
from supabase import create_client
from loguru import logger

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ── Datos del curso genérico ──────────────────────────────────────────────────

COURSE = {
    "title": "Programming Basics",
    "description": "Fundamentos de programación — curso genérico para validar el sistema",
    "domain": "generic",
}

NODES = [
    {"label": "Variables",    "description": "Declarar y asignar valores a variables", "difficulty": 1, "position_x": 100, "position_y": 100},
    {"label": "Functions",    "description": "Definir y llamar funciones, parámetros y retorno", "difficulty": 2, "position_x": 300, "position_y": 100},
    {"label": "Conditionals", "description": "if/else, operadores lógicos, flujo de control", "difficulty": 2, "position_x": 100, "position_y": 250},
    {"label": "Loops",        "description": "for, while, iteración sobre colecciones", "difficulty": 2, "position_x": 300, "position_y": 250},
    {"label": "Arrays",       "description": "Listas y arreglos, índices, slicing", "difficulty": 3, "position_x": 200, "position_y": 400},
    {"label": "Objects",      "description": "Diccionarios y objetos, clave-valor", "difficulty": 3, "position_x": 400, "position_y": 400},
    {"label": "Classes",      "description": "Programación orientada a objetos, herencia", "difficulty": 4, "position_x": 300, "position_y": 550},
    {"label": "Recursion",    "description": "Funciones recursivas, casos base y recursivos", "difficulty": 5, "position_x": 500, "position_y": 550},
]

# source_label → target_label, strength, type
# Significa: para aprender target, primero debes saber source
EDGES = [
    ("Variables",    "Functions",    0.90, "prerequisite"),
    ("Variables",    "Conditionals", 0.85, "prerequisite"),
    ("Variables",    "Loops",        0.85, "prerequisite"),
    ("Functions",    "Loops",        0.70, "related"),
    ("Conditionals", "Loops",        0.75, "prerequisite"),
    ("Loops",        "Arrays",       0.80, "prerequisite"),
    ("Variables",    "Arrays",       0.80, "prerequisite"),
    ("Arrays",       "Objects",      0.70, "related"),
    ("Functions",    "Objects",      0.75, "prerequisite"),
    ("Objects",      "Classes",      0.90, "prerequisite"),
    ("Functions",    "Classes",      0.85, "prerequisite"),
    ("Functions",    "Recursion",    0.95, "prerequisite"),
    ("Arrays",       "Recursion",    0.70, "related"),
]


def run():
    logger.info("Iniciando seed script...")

    # ── 1. Crear curso ────────────────────────────────────────────────────────
    logger.info(f"Creando curso: {COURSE['title']}")
    course_res = supabase.table("courses").insert(COURSE).execute()
    course_id = course_res.data[0]["id"]
    logger.info(f"Curso creado con ID: {course_id}")

    # ── 2. Crear nodos ────────────────────────────────────────────────────────
    logger.info(f"Creando {len(NODES)} nodos...")
    nodes_data = [{**node, "course_id": course_id} for node in NODES]
    nodes_res = supabase.table("concept_nodes").insert(nodes_data).execute()

    # Mapa label → id para construir edges
    label_to_id = {node["label"]: node["id"] for node in nodes_res.data}
    logger.info(f"Nodos creados: {list(label_to_id.keys())}")

    # ── 3. Crear edges ────────────────────────────────────────────────────────
    logger.info(f"Creando {len(EDGES)} edges...")
    edges_data = [
        {
            "course_id":             course_id,
            "source_id":             label_to_id[src],
            "target_id":             label_to_id[tgt],
            "prerequisite_strength": strength,
            "edge_type":             edge_type,
        }
        for src, tgt, strength, edge_type in EDGES
    ]
    supabase.table("concept_edges").insert(edges_data).execute()
    logger.info("Edges creados")

    # ── Resumen ───────────────────────────────────────────────────────────────
    logger.success("=" * 50)
    logger.success("Seed completado exitosamente")
    logger.success(f"  Curso ID : {course_id}")
    logger.success(f"  Nodos    : {len(NODES)}")
    logger.success(f"  Edges    : {len(EDGES)}")
    logger.success("=" * 50)
    logger.info(f"Guarda este Course ID para pruebas: {course_id}")


if __name__ == "__main__":
    run()