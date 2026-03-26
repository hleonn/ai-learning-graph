# """
# Auto-Curriculum Generator
# --------------------------
# Dado el título y descripción de un curso, usa Claude para:
#
# 1. Extraer N conceptos clave como nodos del grafo
# 2. Inferir prerequisitos entre conceptos como edges
# 3. Validar que el grafo resultante es un DAG (sin ciclos)
# 4. Retornar la estructura lista para insertar en Supabase
# """
#
# import os
# import json
# import networkx as nx
# from anthropic import Anthropic
# from loguru import logger
# from dotenv import load_dotenv
#
# load_dotenv()
#
# client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
#
#
# def extract_concepts(
#     title: str,
#     description: str,
#     domain: str = "generic",
#     num_concepts: int = 8,
# ) -> list[dict]:
#     """
#     Usa Claude para extraer conceptos clave de un curso.
#
#     Returns:
#         lista de {label, description, difficulty (1-5)}
#     """
#     logger.info(f"Extrayendo {num_concepts} conceptos para: {title}")
#
#     prompt = f"""You are an expert curriculum designer. Extract exactly {num_concepts} key concepts from this course.
#
# Course title: {title}
# Course description: {description}
# Domain: {domain}
#
# Return ONLY a JSON array. No explanation, no markdown, just the JSON.
# Each concept must have: label (short name), description (one sentence), difficulty (1-5 integer).
# Order from foundational (difficulty 1-2) to advanced (difficulty 4-5).
#
# Example format:
# [
#   {{"label": "Variables", "description": "Declare and assign values", "difficulty": 1}},
#   {{"label": "Functions", "description": "Reusable blocks of code", "difficulty": 2}}
# ]"""
#
#     response = client.messages.create(
#         model="claude-haiku-4-5-20251001",
#         max_tokens=1000,
#         messages=[{"role": "user", "content": prompt}]
#     )
#
#     raw = response.content[0].text.strip()
#
#     # Limpiar posibles backticks
#     if raw.startswith("```"):
#         raw = raw.split("```")[1]
#         if raw.startswith("json"):
#             raw = raw[4:]
#     raw = raw.strip()
#
#     concepts = json.loads(raw)
#     logger.info(f"Conceptos extraídos: {len(concepts)}")
#     return concepts
#
#
# def infer_prerequisites(concepts: list[dict]) -> list[dict]:
#     """
#     Usa Claude para inferir prerequisitos entre conceptos.
#
#     Returns:
#         lista de {source (label), target (label), strength (0.0-1.0)}
#     """
#     logger.info(f"Infiriendo prerequisitos para {len(concepts)} conceptos")
#
#     concept_labels = [c["label"] for c in concepts]
#
#     prompt = f"""You are an expert curriculum designer. Given these concepts, determine which ones are prerequisites for others.
#
# Concepts: {json.dumps(concept_labels)}
#
# Rules:
# - source must be learned BEFORE target
# - strength: 0.9 = essential prerequisite, 0.7 = helpful, 0.5 = loosely related
# - Only create edges where there is a clear learning dependency
# - Do NOT create cycles (A→B→A)
# - Return ONLY a JSON array, no explanation, no markdown
#
# Example format:
# [
#   {{"source": "Variables", "target": "Functions", "strength": 0.9}},
#   {{"source": "Variables", "target": "Loops", "strength": 0.85}}
# ]"""
#
#     response = client.messages.create(
#         model="claude-haiku-4-5-20251001",
#         max_tokens=1000,
#         messages=[{"role": "user", "content": prompt}]
#     )
#
#     raw = response.content[0].text.strip()
#
#     if raw.startswith("```"):
#         raw = raw.split("```")[1]
#         if raw.startswith("json"):
#             raw = raw[4:]
#     raw = raw.strip()
#
#     edges = json.loads(raw)
#     logger.info(f"Prerequisitos inferidos: {len(edges)} edges")
#     return edges
#
#
# def validate_dag(concepts: list[dict], edges: list[dict]) -> tuple[bool, list[dict]]:
#     """
#     Verifica que el grafo es un DAG válido (sin ciclos).
#     Si hay ciclos, los elimina hasta que sea un DAG.
#
#     Returns:
#         (is_valid, clean_edges)
#     """
#     label_to_idx = {c["label"]: i for i, c in enumerate(concepts)}
#
#     G = nx.DiGraph()
#     G.add_nodes_from(range(len(concepts)))
#
#     clean_edges = []
#     for edge in edges:
#         src = label_to_idx.get(edge["source"])
#         tgt = label_to_idx.get(edge["target"])
#
#         if src is None or tgt is None:
#             continue
#
#         # Agregar edge y verificar si crea ciclo
#         G.add_edge(src, tgt)
#         if not nx.is_directed_acyclic_graph(G):
#             G.remove_edge(src, tgt)
#             logger.warning(f"Edge eliminado por ciclo: {edge['source']} → {edge['target']}")
#         else:
#             clean_edges.append(edge)
#
#     is_dag = nx.is_directed_acyclic_graph(G)
#     logger.info(f"Validación DAG: {is_dag}, edges limpios: {len(clean_edges)}")
#     return is_dag, clean_edges
#
#
# def generate_curriculum(
#     title: str,
#     description: str,
#     domain: str = "generic",
#     num_concepts: int = 8,
# ) -> dict:
#     """
#     Pipeline completo: título → grafo de conocimiento validado.
#
#     Returns:
#         {concepts: [...], edges: [...], is_valid_dag: bool}
#     """
#     logger.info(f"Generando currículum: '{title}'")
#
#     # Paso 1: extraer conceptos
#     concepts = extract_concepts(title, description, domain, num_concepts)
#
#     # Paso 2: inferir prerequisitos
#     edges = infer_prerequisites(concepts)
#
#     # Paso 3: validar DAG
#     is_valid, clean_edges = validate_dag(concepts, edges)
#
#     logger.success(
#         f"Currículum generado: {len(concepts)} conceptos, "
#         f"{len(clean_edges)} edges, DAG={is_valid}"
#     )
#
#     return {
#         "concepts":     concepts,
#         "edges":        clean_edges,
#         "is_valid_dag": is_valid,
#         "stats": {
#             "total_concepts": len(concepts),
#             "total_edges":    len(clean_edges),
#             "removed_edges":  len(edges) - len(clean_edges),
#         }
#     }

"""
Auto-Curriculum Generator
--------------------------
Dado el título y descripción de un curso, usa DeepSeek para:

1. Extraer N conceptos clave como nodos del grafo
2. Inferir prerequisitos entre conceptos como edges
3. Validar que el grafo resultante es un DAG (sin ciclos)
4. Retornar la estructura lista para insertar en Supabase
"""

import os
import json
import networkx as nx
import openai
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

# Configurar DeepSeek
deepseek_client = openai.OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)


def extract_concepts(
    title: str,
    description: str,
    domain: str = "generic",
    num_concepts: int = 8,
) -> list[dict]:
    """
    Usa DeepSeek para extraer conceptos clave de un curso.

    Returns:
        lista de {label, description, difficulty (1-5)}
    """
    logger.info(f"Extrayendo {num_concepts} conceptos para: {title}")

    prompt = f"""You are an expert curriculum designer. Extract exactly {num_concepts} key concepts from this course.

Course title: {title}
Course description: {description}
Domain: {domain}

Return ONLY a JSON array. No explanation, no markdown, just the JSON.
Each concept must have: label (short name), description (one sentence), difficulty (1-5 integer).
Order from foundational (difficulty 1-2) to advanced (difficulty 4-5).

Example format:
[
  {{"label": "Variables", "description": "Declare and assign values", "difficulty": 1}},
  {{"label": "Functions", "description": "Reusable blocks of code", "difficulty": 2}}
]"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1000
        )

        raw = response.choices[0].message.content.strip()

        # Limpiar posibles backticks
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        concepts = json.loads(raw)
        logger.info(f"Conceptos extraídos: {len(concepts)}")
        return concepts

    except Exception as e:
        logger.error(f"Error en extract_concepts: {e}")
        raise


def infer_prerequisites(concepts: list[dict]) -> list[dict]:
    """
    Usa DeepSeek para inferir prerequisitos entre conceptos.

    Returns:
        lista de {source (label), target (label), strength (0.0-1.0)}
    """
    logger.info(f"Infiriendo prerequisitos para {len(concepts)} conceptos")

    concept_labels = [c["label"] for c in concepts]

    prompt = f"""You are an expert curriculum designer. Given these concepts, determine which ones are prerequisites for others.

Concepts: {json.dumps(concept_labels)}

Rules:
- source must be learned BEFORE target
- strength: 0.9 = essential prerequisite, 0.7 = helpful, 0.5 = loosely related
- Only create edges where there is a clear learning dependency
- Do NOT create cycles (A→B→A)
- Return ONLY a JSON array, no explanation, no markdown

Example format:
[
  {{"source": "Variables", "target": "Functions", "strength": 0.9}},
  {{"source": "Variables", "target": "Loops", "strength": 0.85}}
]"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1000
        )

        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        edges = json.loads(raw)
        logger.info(f"Prerequisitos inferidos: {len(edges)} edges")
        return edges

    except Exception as e:
        logger.error(f"Error en infer_prerequisites: {e}")
        raise


def validate_dag(concepts: list[dict], edges: list[dict]) -> tuple[bool, list[dict]]:
    """
    Verifica que el grafo es un DAG válido (sin ciclos).
    Si hay ciclos, los elimina hasta que sea un DAG.

    Returns:
        (is_valid, clean_edges)
    """
    label_to_idx = {c["label"]: i for i, c in enumerate(concepts)}

    G = nx.DiGraph()
    G.add_nodes_from(range(len(concepts)))

    clean_edges = []
    for edge in edges:
        src = label_to_idx.get(edge["source"])
        tgt = label_to_idx.get(edge["target"])

        if src is None or tgt is None:
            continue

        # Agregar edge y verificar si crea ciclo
        G.add_edge(src, tgt)
        if not nx.is_directed_acyclic_graph(G):
            G.remove_edge(src, tgt)
            logger.warning(f"Edge eliminado por ciclo: {edge['source']} → {edge['target']}")
        else:
            clean_edges.append(edge)

    is_dag = nx.is_directed_acyclic_graph(G)
    logger.info(f"Validación DAG: {is_dag}, edges limpios: {len(clean_edges)}")
    return is_dag, clean_edges


def generate_curriculum(
    title: str,
    description: str,
    domain: str = "generic",
    num_concepts: int = 8,
) -> dict:
    """
    Pipeline completo: título → grafo de conocimiento validado.

    Returns:
        {concepts: [...], edges: [...], is_valid_dag: bool}
    """
    logger.info(f"Generando currículum: '{title}'")

    # Paso 1: extraer conceptos
    concepts = extract_concepts(title, description, domain, num_concepts)

    # Paso 2: inferir prerequisitos
    edges = infer_prerequisites(concepts)

    # Paso 3: validar DAG
    is_valid, clean_edges = validate_dag(concepts, edges)

    logger.success(
        f"Currículum generado: {len(concepts)} conceptos, "
        f"{len(clean_edges)} edges, DAG={is_valid}"
    )

    return {
        "concepts":     concepts,
        "edges":        clean_edges,
        "is_valid_dag": is_valid,
        "stats": {
            "total_concepts": len(concepts),
            "total_edges":    len(clean_edges),
            "removed_edges":  len(edges) - len(clean_edges),
        }
    }