from fastapi import APIRouter, HTTPException, BackgroundTasks
from loguru import logger
from db.client import supabase
from algorithms.gap_detector import build_graph
from pipeline.embeddings import generate_course_embeddings
import numpy as np

router = APIRouter()


@router.post("/embeddings/generate/{course_id}")
def generate_embeddings(course_id: str, background_tasks: BackgroundTasks):
    """
    Dispara el pipeline de embeddings para un curso.
    Corre en background para no bloquear la respuesta.
    """
    background_tasks.add_task(_run_embedding_pipeline, course_id)
    return {
        "message": f"Pipeline de embeddings iniciado para curso {course_id}",
        "status":  "running",
    }


def _run_embedding_pipeline(course_id: str):
    """Genera embeddings para todos los nodos de un curso."""
    logger.info(f"Iniciando pipeline de embeddings para curso: {course_id}")

    nodes_res = (
        supabase.table("concept_nodes")
        .select("*")
        .eq("course_id", course_id)
        .execute()
    )
    edges_res = (
        supabase.table("concept_edges")
        .select("*")
        .eq("course_id", course_id)
        .execute()
    )

    nodes = nodes_res.data
    edges = edges_res.data

    if not nodes:
        logger.error(f"No se encontraron nodos para curso: {course_id}")
        return

    G     = build_graph(nodes, edges)
    fused = generate_course_embeddings(G, nodes)

    logger.success(f"Embeddings generados: {len(fused)} nodos para curso {course_id}")


@router.get("/embeddings/similar/{course_id}/{node_id}")
def get_similar_nodes(course_id: str, node_id: str, k: int = 5):
    """
    Devuelve los k nodos más similares basándose en embeddings coseno.
    """
    nodes_res = (
        supabase.table("concept_nodes")
        .select("*")
        .eq("course_id", course_id)
        .execute()
    )
    edges_res = (
        supabase.table("concept_edges")
        .select("*")
        .eq("course_id", course_id)
        .execute()
    )

    nodes = nodes_res.data
    edges = edges_res.data

    if not nodes:
        raise HTTPException(status_code=404, detail="Curso no encontrado")

    G     = build_graph(nodes, edges)
    fused = generate_course_embeddings(G, nodes)

    if node_id not in fused:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    query_vec = fused[node_id]
    node_map  = {n["id"]: n for n in nodes}

    similarities = []
    for other_id, other_vec in fused.items():
        if other_id == node_id:
            continue
        cosine_sim = float(np.dot(query_vec, other_vec))
        similarities.append({
            "node_id":    other_id,
            "label":      node_map[other_id]["label"],
            "similarity": round(cosine_sim, 4),
            "difficulty": node_map[other_id]["difficulty"],
        })

    similarities.sort(key=lambda x: x["similarity"], reverse=True)

    return {
        "query_node":    node_map[node_id]["label"],
        "similar_nodes": similarities[:k],
    }