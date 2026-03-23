"""
Learning Path Recommender
--------------------------
Recomienda qué conceptos estudiar siguiente basándose en:

1. Prerequisitos cumplidos — solo recomienda nodos donde
   todos los prerequisitos tienen mastery >= umbral

2. Score de prioridad:
   score = (1 - mastery) * gap_severity * pagerank * embedding_similarity

3. Similitud de embeddings — favorece conceptos relacionados
   a lo que el estudiante estudió recientemente
"""

import numpy as np
import networkx as nx
from loguru import logger


def get_eligible_nodes(
    G: nx.DiGraph,
    mastery_scores: dict[str, float],
    mastery_threshold: float = 0.6,
) -> list[str]:
    """
    Devuelve nodos cuyos prerequisitos están todos dominados.
    Un nodo es elegible si:
      - Su mastery actual es < 1.0 (no está completamente dominado)
      - Todos sus predecesores (prerequisitos) tienen mastery >= threshold
    """
    eligible = []

    for node_id in G.nodes():
        current_mastery = mastery_scores.get(node_id, 0.0)

        # Ya dominado — no recomendar
        if current_mastery >= 0.95:
            continue

        # Verificar que todos los prerequisitos estén dominados
        predecessors = list(G.predecessors(node_id))
        prereqs_met  = all(
            mastery_scores.get(pred_id, 0.0) >= mastery_threshold
            for pred_id in predecessors
        )

        if prereqs_met:
            eligible.append(node_id)

    logger.debug(f"Nodos elegibles: {len(eligible)} de {G.number_of_nodes()}")
    return eligible


def score_nodes(
    node_ids: list[str],
    mastery_scores: dict[str, float],
    pagerank: dict[str, float],
    embeddings: dict[str, np.ndarray],
    recently_studied: list[str] | None = None,
) -> list[dict]:
    """
    Calcula un score de prioridad para cada nodo elegible.

    Args:
        node_ids:         nodos elegibles
        mastery_scores:   mastery actual del estudiante
        pagerank:         importancia del nodo en el grafo
        embeddings:       vectores de embedding por nodo
        recently_studied: IDs de nodos estudiados recientemente

    Returns:
        lista de {node_id, score, components} ordenada por score desc
    """
    # Vector promedio de conceptos estudiados recientemente
    recent_vec = None
    if recently_studied and embeddings:
        recent_vecs = [
            embeddings[nid] for nid in recently_studied
            if nid in embeddings
        ]
        if recent_vecs:
            recent_vec = np.mean(recent_vecs, axis=0)

    scored = []

    for node_id in node_ids:
        mastery  = mastery_scores.get(node_id, 0.0)
        pr       = pagerank.get(node_id, 0.0)

        # Componente de similitud con historial reciente
        sim_score = 0.5  # neutral si no hay historial
        if recent_vec is not None and node_id in embeddings:
            sim_score = float(np.dot(embeddings[node_id], recent_vec))
            sim_score = max(0.0, sim_score)  # clamp a positivo

        # Fórmula de score:
        # - (1 - mastery): prioriza lo que falta aprender
        # - pagerank:      prioriza conceptos fundamentales
        # - sim_score:     prioriza conceptos relacionados al historial
        score = (1 - mastery) * (1 + pr * 10) * (1 + sim_score)

        scored.append({
            "node_id":  node_id,
            "score":    round(score, 4),
            "components": {
                "mastery_gap":   round(1 - mastery, 4),
                "pagerank":      round(pr, 4),
                "similarity":    round(sim_score, 4),
            }
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


def recommend_path(
    G: nx.DiGraph,
    mastery_scores: dict[str, float],
    pagerank: dict[str, float],
    embeddings: dict[str, np.ndarray],
    node_labels: dict[str, str],
    recently_studied: list[str] | None = None,
    k: int = 5,
    mastery_threshold: float = 0.6,
) -> list[dict]:
    """
    Pipeline completo de recomendación.

    Args:
        G:                grafo de conocimiento
        mastery_scores:   {node_id: mastery_score}
        pagerank:         {node_id: pagerank_score}
        embeddings:       {node_id: np.array(256)}
        node_labels:      {node_id: label}
        recently_studied: nodos estudiados recientemente
        k:                número de recomendaciones
        mastery_threshold: umbral para considerar prereq dominado

    Returns:
        lista de k nodos recomendados con score y razón
    """
    # Paso 1: filtrar elegibles
    eligible = get_eligible_nodes(G, mastery_scores, mastery_threshold)

    if not eligible:
        logger.info("No hay nodos elegibles — todos dominados o bloqueados")
        return []

    # Paso 2: calcular scores
    scored = score_nodes(
        eligible, mastery_scores, pagerank, embeddings, recently_studied
    )

    # Paso 3: agregar etiquetas y razón legible
    recommendations = []
    for item in scored[:k]:
        node_id = item["node_id"]
        mastery = mastery_scores.get(node_id, 0.0)
        comp    = item["components"]

        # Razón legible para el estudiante
        if mastery == 0.0:
            reason = "Concepto nuevo — prerequisitos completados"
        elif mastery < 0.3:
            reason = "Iniciado pero necesita más práctica"
        elif mastery < 0.6:
            reason = "En progreso — continúa para dominarlo"
        else:
            reason = "Casi dominado — un poco más de práctica"

        recommendations.append({
            "node_id":  node_id,
            "label":    node_labels.get(node_id, ""),
            "mastery":  round(mastery, 4),
            "score":    item["score"],
            "reason":   reason,
            "components": comp,
        })

    logger.info(f"Recomendaciones generadas: {len(recommendations)}")
    return recommendations