from fastapi import APIRouter, HTTPException, BackgroundTasks
from loguru import logger
from db.client import supabase
from algorithms.gap_detector import build_graph, compute_pagerank
from algorithms.bkt import mastery_level
from pipeline.embeddings import generate_course_embeddings
from pipeline.recommender import recommend_path
import numpy as np

router = APIRouter()


@router.post("/embeddings/generate/{course_id}")
def generate_embeddings(course_id: str, background_tasks: BackgroundTasks):
    """Dispara el pipeline de embeddings para un curso en background."""
    background_tasks.add_task(_run_embedding_pipeline, course_id)
    return {
        "message": f"Pipeline de embeddings iniciado para curso {course_id}",
        "status":  "running",
    }


def _run_embedding_pipeline(course_id: str):
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
    """Devuelve los k nodos más similares basándose en embeddings coseno."""
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


@router.get("/recommend/{user_id}/{course_id}")
def get_recommendations(user_id: str, course_id: str, k: int = 5):
    """
    Devuelve una ruta de aprendizaje personalizada para el estudiante.
    Combina: prerequisitos cumplidos + mastery gaps + PageRank + embeddings
    """
    logger.info(f"Recomendación: user={user_id[:8]} course={course_id[:8]}")

    # ── 1. Obtener datos del curso ────────────────────────────────────────────
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

    # ── 2. Obtener mastery del estudiante ─────────────────────────────────────
    node_ids = [n["id"] for n in nodes]
    mastery_res = (
        supabase.table("student_mastery")
        .select("node_id, mastery_score")
        .eq("user_id", user_id)
        .in_("node_id", node_ids)
        .execute()
    )
    mastery_scores = {
        m["node_id"]: m["mastery_score"]
        for m in mastery_res.data
    }

    # ── 3. Obtener eventos recientes ──────────────────────────────────────────
    events_res = (
        supabase.table("learning_events")
        .select("node_id")
        .eq("user_id", user_id)
        .in_("node_id", node_ids)
        .order("created_at", desc=True)
        .limit(3)
        .execute()
    )
    recently_studied = list({e["node_id"] for e in events_res.data})

    # ── 4. Construir grafo y calcular métricas ────────────────────────────────
    G          = build_graph(nodes, edges)
    pagerank   = compute_pagerank(G)
    embeddings = generate_course_embeddings(G, nodes)
    node_labels = {n["id"]: n["label"] for n in nodes}

    # ── 5. Generar recomendaciones ────────────────────────────────────────────
    recommendations = recommend_path(
        G                = G,
        mastery_scores   = mastery_scores,
        pagerank         = pagerank,
        embeddings       = embeddings,
        node_labels      = node_labels,
        recently_studied = recently_studied,
        k                = k,
    )

    return {
        "user_id":         user_id,
        "course_id":       course_id,
        "recommendations": recommendations,
        "context": {
            "recently_studied": recently_studied,
            "total_nodes":      len(nodes),
            "mastered_nodes":   sum(1 for s in mastery_scores.values() if s >= 0.8),
        }
    }