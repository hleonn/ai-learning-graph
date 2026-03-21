from fastapi import APIRouter, HTTPException
from loguru import logger
from db.client import supabase
from algorithms.gap_detector import build_graph, compute_pagerank, topological_order

router = APIRouter()


@router.get("/")
def graph_root():
    return {"message": "Graph router activo"}


@router.get("/{course_id}")
def get_graph(course_id: str):
    """
    Devuelve todos los nodos y edges de un curso
    incluyendo PageRank y orden topológico.
    """
    logger.info(f"Solicitando grafo para course_id: {course_id}")

    # ── 1. Verificar curso ────────────────────────────────────────────────────
    course_res = (
        supabase.table("courses")
        .select("*")
        .eq("id", course_id)
        .execute()
    )
    if not course_res.data:
        raise HTTPException(status_code=404, detail=f"Curso {course_id} no encontrado")

    course = course_res.data[0]

    # ── 2. Obtener nodos y edges ──────────────────────────────────────────────
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

    # ── 3. Algoritmos de grafos ───────────────────────────────────────────────
    G        = build_graph(nodes, edges)
    pagerank = compute_pagerank(G)
    topo     = topological_order(G)

    # Índice de posición en orden topológico
    topo_index = {node_id: i for i, node_id in enumerate(topo)}

    # ── 4. Formatear respuesta ────────────────────────────────────────────────
    cytoscape_nodes = [
        {
            "data": {
                "id":          node["id"],
                "label":       node["label"],
                "description": node["description"],
                "difficulty":  node["difficulty"],
                "pagerank":    round(pagerank.get(node["id"], 0.0), 4),
                "topo_order":  topo_index.get(node["id"], -1),
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
            "total_nodes":     len(nodes),
            "total_edges":     len(edges),
            "topological_order": topo,
        }
    }
