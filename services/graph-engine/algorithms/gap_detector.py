"""
Gap Detector
-------------
Detecta qué conceptos están bloqueando el aprendizaje de un estudiante.

Un "gap" es un nodo donde:
  1. El mastery score es bajo (< umbral)
  2. Y ese nodo tiene descendientes que el estudiante necesita aprender

La severidad combina:
  - Qué tan bajo está el mastery
  - Qué tan importante es el nodo (PageRank)
  - Cuántos nodos bloquea
"""

import networkx as nx
from loguru import logger


def build_graph(nodes: list[dict], edges: list[dict]) -> nx.DiGraph:
    """
    Construye un grafo dirigido NetworkX desde los datos de Supabase.

    Args:
        nodes: lista de concept_nodes desde la DB
        edges: lista de concept_edges desde la DB

    Returns:
        nx.DiGraph con nodos y edges cargados
    """
    G = nx.DiGraph()

    for node in nodes:
        G.add_node(
            node["id"],
            label=node["label"],
            difficulty=node["difficulty"],
        )

    for edge in edges:
        G.add_edge(
            edge["source_id"],
            edge["target_id"],
            weight=edge["prerequisite_strength"],
            edge_type=edge["edge_type"],
        )

    logger.debug(f"Grafo construido: {G.number_of_nodes()} nodos, {G.number_of_edges()} edges")
    return G


def compute_pagerank(G: nx.DiGraph) -> dict[str, float]:
    """
    Calcula PageRank para cada nodo del grafo.
    Nodos con PageRank alto son más fundamentales (más conceptos dependen de ellos).

    Returns:
        dict {node_id: pagerank_score}
    """
    if G.number_of_nodes() == 0:
        return {}

    pagerank = nx.pagerank(G, alpha=0.85, weight="weight")
    logger.debug(f"PageRank calculado para {len(pagerank)} nodos")
    return pagerank


def topological_order(G: nx.DiGraph) -> list[str]:
    """
    Devuelve los nodos en orden topológico (orden correcto para aprender).
    El primer nodo no tiene prerequisites — es por donde empezar.

    Returns:
        lista de node_ids en orden de aprendizaje
    """
    if not nx.is_directed_acyclic_graph(G):
        logger.warning("El grafo tiene ciclos — no se puede ordenar topológicamente")
        return list(G.nodes())

    order = list(nx.topological_sort(G))
    logger.debug(f"Orden topológico: {len(order)} nodos")
    return order


def detect_gaps(
    G: nx.DiGraph,
    mastery_scores: dict[str, float],
    pagerank: dict[str, float],
    mastery_threshold: float = 0.6,
) -> list[dict]:
    """
    Detecta gaps en el conocimiento del estudiante.

    Args:
        G:                 grafo de conocimiento
        mastery_scores:    dict {node_id: mastery_score} del estudiante
        pagerank:          dict {node_id: pagerank_score}
        mastery_threshold: score mínimo para considerar un concepto dominado

    Returns:
        lista de gaps ordenados por severidad descendente
    """
    gaps = []

    for node_id in G.nodes():
        score = mastery_scores.get(node_id, 0.0)

        # Solo es gap si el mastery está por debajo del umbral
        if score >= mastery_threshold:
            continue

        # Cuántos nodos descendientes bloquea este gap
        descendants  = nx.descendants(G, node_id)
        blocked_count = len(descendants)

        # Importancia del nodo en el grafo
        pr = pagerank.get(node_id, 0.0)

        # Fórmula de severidad:
        # severidad = (1 - mastery) * pagerank_weight * (1 + blocked_nodes)
        severity = (1 - score) * pr * (1 + blocked_count)

        gaps.append({
            "node_id":      node_id,
            "label":        G.nodes[node_id].get("label", ""),
            "mastery_score": round(score, 4),
            "severity":     round(severity, 6),
            "blocked_count": blocked_count,
            "pagerank":     round(pr, 6),
        })

    # Ordenar por severidad descendente — el gap más crítico primero
    gaps.sort(key=lambda x: x["severity"], reverse=True)

    logger.info(f"Gaps detectados: {len(gaps)} de {G.number_of_nodes()} nodos")
    return gaps