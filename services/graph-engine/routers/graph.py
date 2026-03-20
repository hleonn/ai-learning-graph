from fastapi import APIRouter, HTTPException
from loguru import logger
from db.client import supabase

router = APIRouter()


@router.get("/")
def graph_root():
    return {"message": "Graph router activo"}


@router.get("/{course_id}")
def get_graph(course_id: str):
    """
    Devuelve todos los nodos y edges de un curso.
    El frontend usa esto para renderizar el grafo en Cytoscape.js
    """
    logger.info(f"Solicitando grafo para course_id: {course_id}")

    # ── 1. Verificar que el curso existe ──────────────────────────────────────
    course_res = (
        supabase.table("courses")
        .select("*")
        .eq("id", course_id)
        .execute()
    )

    if not course_res.data:
        raise HTTPException(status_code=404, detail=f"Curso {course_id} no encontrado")

    course = course_res.data[0]

    # ── 2. Obtener nodos ──────────────────────────────────────────────────────
    nodes_res = (
        supabase.table("concept_nodes")
        .select("*")
        .eq("course_id", course_id)
        .execute()
    )

    # ── 3. Obtener edges ──────────────────────────────────────────────────────
    edges_res = (
        supabase.table("concept_edges")
        .select("*")
        .eq("course_id", course_id)
        .execute()
    )

    nodes = nodes_res.data
    edges = edges_res.data

    logger.info(f"Grafo encontrado: {len(nodes)} nodos, {len(edges)} edges")

    # ── 4. Formatear para Cytoscape.js ────────────────────────────────────────
    # Cytoscape espera: { nodes: [{data: {...}}], edges: [{data: {...}}] }
    cytoscape_nodes = [
        {
            "data": {
                "id":          node["id"],
                "label":       node["label"],
                "description": node["description"],
                "difficulty":  node["difficulty"],
            },
            "position": {
                "x": node["position_x"],
                "y": node["position_y"],
            }
        }
        for node in nodes
    ]

    cytoscape_edges = [
        {
            "data": {
                "id":       edge["id"],
                "source":   edge["source_id"],
                "target":   edge["target_id"],
                "strength": edge["prerequisite_strength"],
                "type":     edge["edge_type"],
            }
        }
        for edge in edges
    ]

    return {
        "course": {
            "id":    course["id"],
            "title": course["title"],
            "domain": course["domain"],
        },
        "nodes": cytoscape_nodes,
        "edges": cytoscape_edges,
        "summary": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
    }