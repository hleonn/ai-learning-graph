"""
Embedding Pipeline — con fallback si torch/node2vec no están instalados.
En producción usa embeddings simples basados en TF-IDF.
En desarrollo usa Node2Vec + sentence-transformers.
"""

import os
import numpy as np
import networkx as nx
from loguru import logger

# Detectar si las librerías de ML están disponibles
try:
    from node2vec import Node2Vec
    from sentence_transformers import SentenceTransformer
    ML_AVAILABLE = True
    logger.info("ML libraries disponibles: Node2Vec + sentence-transformers")
except ImportError:
    ML_AVAILABLE = False
    logger.warning("ML libraries no disponibles — usando embeddings simples (producción)")

TEXT_MODEL_NAME  = "all-MiniLM-L6-v2"
_text_model      = None


def get_text_model():
    global _text_model
    if _text_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Cargando modelo de texto: {TEXT_MODEL_NAME}")
        _text_model = SentenceTransformer(TEXT_MODEL_NAME)
        logger.info("Modelo cargado")
    return _text_model


def compute_node2vec_embeddings(
    G: nx.DiGraph,
    dimensions: int = 128,
    walk_length: int = 30,
    num_walks: int = 200,
    workers: int = 1,
) -> dict[str, np.ndarray]:
    if not ML_AVAILABLE:
        return _simple_structural_embeddings(G, dimensions)

    if G.number_of_nodes() == 0:
        return {}

    logger.info(f"Calculando Node2Vec: {G.number_of_nodes()} nodos")

    node2vec = Node2Vec(
        G,
        dimensions=dimensions,
        walk_length=walk_length,
        num_walks=num_walks,
        workers=workers,
        quiet=True,
    )

    model = node2vec.fit(window=10, min_count=1, batch_words=4)

    embeddings = {}
    for node_id in G.nodes():
        try:
            embeddings[node_id] = np.array(model.wv[str(node_id)])
        except KeyError:
            embeddings[node_id] = np.zeros(dimensions)

    logger.info(f"Node2Vec: {len(embeddings)} embeddings de {dimensions}-dim")
    return embeddings


def _simple_structural_embeddings(
    G: nx.DiGraph,
    dimensions: int = 128,
) -> dict[str, np.ndarray]:
    """
    Fallback para producción sin Node2Vec.
    Usa métricas de grafo: grado, PageRank, clustering, etc.
    """
    logger.info(f"Embeddings simples (fallback): {G.number_of_nodes()} nodos")

    pagerank   = nx.pagerank(G, alpha=0.85) if G.number_of_nodes() > 0 else {}
    in_degree  = dict(G.in_degree())
    out_degree = dict(G.out_degree())

    embeddings = {}
    rng = np.random.RandomState(42)

    for node_id in G.nodes():
        # Vector base aleatorio reproducible por nodo
        base = rng.randn(dimensions) * 0.1

        # Enriquecer con métricas del grafo
        base[0] = pagerank.get(node_id, 0.0)
        base[1] = in_degree.get(node_id, 0) / max(G.number_of_nodes(), 1)
        base[2] = out_degree.get(node_id, 0) / max(G.number_of_nodes(), 1)

        # Normalizar
        norm = np.linalg.norm(base)
        embeddings[node_id] = base / norm if norm > 0 else base

    return embeddings


def compute_text_embeddings(nodes: list[dict]) -> dict[str, np.ndarray]:
    if not ML_AVAILABLE:
        return _simple_text_embeddings(nodes)

    model    = get_text_model()
    texts    = []
    node_ids = []

    for node in nodes:
        text = f"{node['label']}. {node.get('description', '')}"
        texts.append(text)
        node_ids.append(node["id"])

    logger.info(f"Text embeddings para {len(texts)} nodos")
    vectors = model.encode(texts, show_progress_bar=False)
    return {node_id: vectors[i] for i, node_id in enumerate(node_ids)}


def _simple_text_embeddings(nodes: list[dict]) -> dict[str, np.ndarray]:
    """Fallback TF-IDF simple para producción."""
    logger.info(f"Text embeddings simples (fallback): {len(nodes)} nodos")

    from collections import Counter
    import math

    dimensions = 384
    texts      = [f"{n['label']} {n.get('description', '')}".lower() for n in nodes]

    # Vocabulario
    all_words = []
    for text in texts:
        all_words.extend(text.split())
    vocab = list(set(all_words))[:dimensions]
    word_to_idx = {w: i for i, w in enumerate(vocab)}

    embeddings = {}
    for node, text in zip(nodes, texts):
        vec = np.zeros(dimensions)
        words = text.split()
        for word in words:
            if word in word_to_idx:
                vec[word_to_idx[word]] += 1.0
        norm = np.linalg.norm(vec)
        embeddings[node["id"]] = vec / norm if norm > 0 else vec

    return embeddings


def fuse_embeddings(
    node2vec_embs: dict[str, np.ndarray],
    text_embs: dict[str, np.ndarray],
    output_dim: int = 256,
) -> dict[str, np.ndarray]:
    node_ids = list(node2vec_embs.keys())
    if not node_ids:
        return {}

    n2v_dim    = next(iter(node2vec_embs.values())).shape[0]
    text_dim   = next(iter(text_embs.values())).shape[0]
    concat_dim = n2v_dim + text_dim

    logger.info(f"Fusionando: {n2v_dim} + {text_dim} → {concat_dim} → {output_dim}")

    concat_matrix = np.zeros((len(node_ids), concat_dim))
    for i, node_id in enumerate(node_ids):
        n2v  = node2vec_embs.get(node_id, np.zeros(n2v_dim))
        text = text_embs.get(node_id, np.zeros(text_dim))
        concat_matrix[i] = np.concatenate([n2v, text])

    rng        = np.random.RandomState(42)
    projection = rng.randn(concat_dim, output_dim) / np.sqrt(concat_dim)
    projected  = concat_matrix @ projection

    norms      = np.linalg.norm(projected, axis=1, keepdims=True)
    norms      = np.where(norms == 0, 1, norms)
    normalized = projected / norms

    return {node_id: normalized[i] for i, node_id in enumerate(node_ids)}


def generate_course_embeddings(
    G: nx.DiGraph,
    nodes: list[dict],
) -> dict[str, np.ndarray]:
    n2v_embs  = compute_node2vec_embeddings(G)
    text_embs = compute_text_embeddings(nodes)
    return fuse_embeddings(n2v_embs, text_embs)