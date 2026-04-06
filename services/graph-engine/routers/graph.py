from fastapi import APIRouter, HTTPException, Body
from loguru import logger
from db.client import supabase
from algorithms.gap_detector import build_graph, compute_pagerank, topological_order
from pydantic import BaseModel
from typing import List, Optional
import uuid

router = APIRouter()

# Modelos para los requests
class NodeCreate(BaseModel):
    label: str
    description: Optional[str] = ""
    difficulty: int = 1
    position_x: Optional[float] = 0
    position_y: Optional[float] = 0
    phase: Optional[int] = None  #
    topic: Optional[str] = None  #
    bloom_levels: Optional[list] = None  #
    expected_outcomes: Optional[list] = None  #
    skills: Optional[list] = None  #

class EdgeCreate(BaseModel):
    source: str
    target: str
    prerequisite_strength: float = 0.8
    edge_type: str = "prerequisite"


@router.get("/")
def graph_root():
    return {"message": "Graph router activo"}


@router.get("/{course_id}")
def get_graph(course_id: str):
    """Devuelve todos los nodos y edges de un curso"""
    logger.info(f"Solicitando grafo para course_id: {course_id}")

    course_res = supabase.table("courses").select("*").eq("id", course_id).execute()
    if not course_res.data:
        raise HTTPException(status_code=404, detail=f"Curso {course_id} no encontrado")

    course = course_res.data[0]

    nodes_res = supabase.table("concept_nodes").select("*").eq("course_id", course_id).execute()
    edges_res = supabase.table("concept_edges").select("*").eq("course_id", course_id).execute()

    nodes = nodes_res.data
    edges = edges_res.data

    G = build_graph(nodes, edges)
    pagerank = compute_pagerank(G)
    topo = topological_order(G)
    topo_index = {node_id: i for i, node_id in enumerate(topo)}

    cytoscape_nodes = [
        {
            "data": {
                "id": node["id"],
                "label": node["label"],
                "description": node["description"],
                "difficulty": node["difficulty"],
                "pagerank": round(pagerank.get(node["id"], 0.0), 4),
                "topo_order": topo_index.get(node["id"], -1),
            },
            "position": {
                "x": node.get("position_x", 0),
                "y": node.get("position_y", 0),
            }
        }
        for node in nodes
    ]

    cytoscape_edges = [
        {
            "data": {
                "id": edge["id"],
                "source": edge["source_id"],
                "target": edge["target_id"],
                "strength": edge["prerequisite_strength"],
                "type": edge["edge_type"],
            }
        }
        for edge in edges
    ]

    return {
        "course": {
            "id": course["id"],
            "title": course["title"],
            "domain": course["domain"],
        },
        "nodes": cytoscape_nodes,
        "edges": cytoscape_edges,
        "summary": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "topological_order": topo,
        }
    }


@router.post("/{course_id}/nodes")
def create_node(course_id: str, node: NodeCreate):
    """Crear un nuevo nodo en el curso"""
    logger.info(f"Creando nodo en curso {course_id}: {node.label}")

    # Verificar que el curso existe
    course_res = supabase.table("courses").select("id").eq("id", course_id).execute()
    if not course_res.data:
        raise HTTPException(status_code=404, detail=f"Curso {course_id} no encontrado")

    new_node = {
        "id": str(uuid.uuid4()),
        "course_id": course_id,
        "label": node.label,
        "description": node.description,
        "difficulty": node.difficulty,
        "position_x": node.position_x,
        "position_y": node.position_y,
        "phase": node.phase,  #
        "topic": node.topic,  #
        "bloom_levels": node.bloom_levels,  #
        "expected_outcomes": node.expected_outcomes,  #
        "skills": node.skills,  #
    }

    result = supabase.table("concept_nodes").insert(new_node).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear el nodo")

    return result.data[0]


@router.post("/{course_id}/edges")
def create_edge(course_id: str, edge: EdgeCreate):
    """Crear una nueva arista (prerrequisito) en el curso"""
    logger.info(f"Creando arista en curso {course_id}: {edge.source} -> {edge.target}")

    # Verificar que el curso existe
    course_res = supabase.table("courses").select("id").eq("id", course_id).execute()
    if not course_res.data:
        raise HTTPException(status_code=404, detail=f"Curso {course_id} no encontrado")

    # Verificar que los nodos existen
    source_res = supabase.table("concept_nodes").select("id").eq("course_id", course_id).eq("label", edge.source).execute()
    target_res = supabase.table("concept_nodes").select("id").eq("course_id", course_id).eq("label", edge.target).execute()

    if not source_res.data:
        raise HTTPException(status_code=404, detail=f"Nodo origen '{edge.source}' no encontrado")
    if not target_res.data:
        raise HTTPException(status_code=404, detail=f"Nodo destino '{edge.target}' no encontrado")

    new_edge = {
        "id": str(uuid.uuid4()),
        "course_id": course_id,
        "source_id": source_res.data[0]["id"],
        "target_id": target_res.data[0]["id"],
        "prerequisite_strength": edge.prerequisite_strength,
        "edge_type": edge.edge_type,
    }

    result = supabase.table("concept_edges").insert(new_edge).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear la arista")

    return result.data[0]


@router.get("/{course_id}/nodes")
def get_nodes(course_id: str):
    """Obtener todos los nodos de un curso"""
    nodes_res = supabase.table("concept_nodes").select("*").eq("course_id", course_id).execute()
    return {"nodes": nodes_res.data}


@router.get("/{course_id}/edges")
def get_edges(course_id: str):
    """Obtener todas las aristas de un curso"""
    edges_res = supabase.table("concept_edges").select("*").eq("course_id", course_id).execute()
    return {"edges": edges_res.data}


@router.put("/{course_id}/nodes/{node_id}/position")
def update_node_position(course_id: str, node_id: str, position: dict = Body(...)):
    """Actualizar la posición de un nodo"""
    result = supabase.table("concept_nodes").update({
        "position_x": position.get("position_x", 0),
        "position_y": position.get("position_y", 0),
    }).eq("id", node_id).eq("course_id", course_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Node not found")

    return result.data[0]