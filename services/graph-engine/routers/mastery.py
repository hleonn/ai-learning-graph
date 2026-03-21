from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from db.client import supabase
from algorithms.bkt import update_mastery, mastery_level
from algorithms.gap_detector import build_graph, compute_pagerank, detect_gaps

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class LearningEvent(BaseModel):
    user_id:   str
    node_id:   str
    correct:   bool
    course_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/event")
def record_event(event: LearningEvent):
    """
    Registra un evento de aprendizaje y actualiza el mastery score
    del estudiante usando BKT.
    """
    logger.info(f"Evento: user={event.user_id[:8]} node={event.node_id[:8]} correct={event.correct}")

    # ── 1. Obtener mastery actual del estudiante para este nodo ───────────────
    mastery_res = (
        supabase.table("student_mastery")
        .select("*")
        .eq("user_id", event.user_id)
        .eq("node_id", event.node_id)
        .execute()
    )

    current_score = 0.0
    attempts      = 0
    existing      = mastery_res.data[0] if mastery_res.data else None

    if existing:
        current_score = existing["mastery_score"]
        attempts      = existing["attempts"]

    # ── 2. Calcular nuevo score con BKT ───────────────────────────────────────
    new_score = update_mastery(current_score, event.correct)
    attempts += 1

    # ── 3. Guardar o actualizar mastery ───────────────────────────────────────
    mastery_data = {
        "user_id":       event.user_id,
        "node_id":       event.node_id,
        "mastery_score": new_score,
        "attempts":      attempts,
        "last_seen":     "now()",
        "updated_at":    "now()",
    }

    if existing:
        supabase.table("student_mastery").update(mastery_data).eq("id", existing["id"]).execute()
    else:
        supabase.table("student_mastery").insert(mastery_data).execute()

    # ── 4. Registrar en learning_events ──────────────────────────────────────
    supabase.table("learning_events").insert({
        "user_id":    event.user_id,
        "node_id":    event.node_id,
        "event_type": "passed" if event.correct else "failed",
        "score":      new_score,
    }).execute()

    return {
        "node_id":       event.node_id,
        "previous_score": round(current_score, 4),
        "new_score":      round(new_score, 4),
        "attempts":       attempts,
        "level":          mastery_level(new_score),
    }


@router.get("/student/{user_id}/course/{course_id}")
def get_student_mastery(user_id: str, course_id: str):
    """
    Devuelve el mastery score del estudiante para cada nodo del curso.
    """
    logger.info(f"Mastery request: user={user_id[:8]} course={course_id[:8]}")

    # ── 1. Obtener todos los nodos del curso ──────────────────────────────────
    nodes_res = (
        supabase.table("concept_nodes")
        .select("id, label, difficulty")
        .eq("course_id", course_id)
        .execute()
    )
    nodes = nodes_res.data

    # ── 2. Obtener mastery scores del estudiante ──────────────────────────────
    node_ids = [n["id"] for n in nodes]
    mastery_res = (
        supabase.table("student_mastery")
        .select("node_id, mastery_score, attempts, last_seen")
        .eq("user_id", user_id)
        .in_("node_id", node_ids)
        .execute()
    )

    # Mapa node_id → mastery data
    mastery_map = {m["node_id"]: m for m in mastery_res.data}

    # ── 3. Construir respuesta ────────────────────────────────────────────────
    result = []
    total_score = 0.0

    for node in nodes:
        m     = mastery_map.get(node["id"])
        score = m["mastery_score"] if m else 0.0
        total_score += score

        result.append({
            "node_id":       node["id"],
            "label":         node["label"],
            "difficulty":    node["difficulty"],
            "mastery_score": round(score, 4),
            "attempts":      m["attempts"] if m else 0,
            "last_seen":     m["last_seen"] if m else None,
            "level":         mastery_level(score),
        })

    avg_mastery = total_score / len(nodes) if nodes else 0.0

    return {
        "user_id":     user_id,
        "course_id":   course_id,
        "nodes":       result,
        "summary": {
            "total_nodes":   len(nodes),
            "avg_mastery":   round(avg_mastery, 4),
            "mastered":      sum(1 for r in result if r["level"] == "mastered"),
            "learning":      sum(1 for r in result if r["level"] == "learning"),
            "struggling":    sum(1 for r in result if r["level"] == "struggling"),
            "not_started":   sum(1 for r in result if r["level"] == "not_started"),
        }
    }


@router.get("/gaps/student/{user_id}/course/{course_id}")
def get_gaps(user_id: str, course_id: str):
    """
    Detecta los gaps de conocimiento del estudiante en un curso.
    Devuelve los conceptos más críticos que están bloqueando el aprendizaje.
    """
    logger.info(f"Gap detection: user={user_id[:8]} course={course_id[:8]}")

    # ── 1. Obtener nodos y edges ──────────────────────────────────────────────
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

    # ── 2. Obtener mastery scores del estudiante ──────────────────────────────
    node_ids = [n["id"] for n in nodes]
    mastery_res = (
        supabase.table("student_mastery")
        .select("node_id, mastery_score")
        .eq("user_id", user_id)
        .in_("node_id", node_ids)
        .execute()
    )

    mastery_scores = {m["node_id"]: m["mastery_score"] for m in mastery_res.data}

    # ── 3. Construir grafo y detectar gaps ────────────────────────────────────
    G        = build_graph(nodes, edges)
    pagerank = compute_pagerank(G)
    gaps     = detect_gaps(G, mastery_scores, pagerank)

    return {
        "user_id":   user_id,
        "course_id": course_id,
        "gaps":      gaps,
        "summary": {
            "total_gaps":    len(gaps),
            "critical_gaps": sum(1 for g in gaps if g["severity"] > 0.01),
        }
    }