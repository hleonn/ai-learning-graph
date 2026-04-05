"""
Auto-Curriculum Generator
--------------------------
Dado el título y descripción de un curso, usa DeepSeek para:

1. Extraer N conceptos clave como nodos del grafo
2. Generar contenido educativo para cada concepto (explicación + ejemplos)
3. Inferir prerequisitos entre conceptos como edges
4. Validar que el grafo resultante es un DAG (sin ciclos)
5. Retornar la estructura lista para insertar en Supabase
"""

import os
import json
import re
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


def _clean_json_response(raw: str) -> str:
    """Limpia la respuesta de la API para obtener JSON válido"""
    # Eliminar markdown
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    # Eliminar caracteres no imprimibles
    raw = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', raw)

    return raw


def _generate_fallback_concepts(title: str, num_concepts: int, difficulty_level: str) -> list[dict]:
    """Genera conceptos de fallback si la API falla"""
    logger.warning(f"Usando fallback para {title}")

    level_multiplier = {
        "beginner": 1,
        "intermediate": 2,
        "advanced": 3,
        "expert": 4
    }.get(difficulty_level, 2)

    concepts = []
    base_topics = [
        "Introducción", "Fundamentos", "Conceptos Básicos",
        "Aplicaciones Prácticas", "Casos de Estudio",
        "Mejores Prácticas", "Técnicas Avanzadas", "Optimización"
    ]

    for i in range(min(num_concepts, len(base_topics))):
        difficulty = min(level_multiplier + (i // 2), 5)
        concepts.append({
            "label": f"{base_topics[i]} de {title}",
            "description": f"Exploración del concepto {base_topics[i].lower()} aplicado a {title}",
            "difficulty": difficulty,
            "content": f"Este es el contenido educativo para el concepto '{base_topics[i]} de {title}'. " +
                      f"En este módulo aprenderás los aspectos fundamentales y avanzados de este tema. " +
                      f"El nivel de dificultad es {difficulty} de 5.",
            "examples": [
                f"Ejemplo práctico 1 de {base_topics[i].lower()}",
                f"Ejemplo práctico 2 de {base_topics[i].lower()}",
                f"Ejemplo práctico 3 de {base_topics[i].lower()}"
            ]
        })

    return concepts


def extract_concepts_with_content(
    title: str,
    description: str,
    domain: str = "generic",
    num_concepts: int = 8,
    difficulty_level: str = "intermediate",
) -> list[dict]:
    """
    Usa DeepSeek para extraer conceptos clave de un curso con contenido educativo.

    Returns:
        lista de {label, description, difficulty (1-5), content, examples}
    """
    logger.info(f"Extrayendo {num_concepts} conceptos para: {title} (nivel: {difficulty_level})")

    difficulty_map = {
        "beginner": "principiante - conceptos fundamentales, explicaciones simples",
        "intermediate": "intermedio - conceptos con algo de profundidad, ejemplos prácticos",
        "advanced": "avanzado - conceptos complejos, ejemplos detallados de casos reales",
        "expert": "experto/certificación - conceptos de nivel profesional, preparación para certificación"
    }

    level_description = difficulty_map.get(difficulty_level, difficulty_map["intermediate"])

    # Prompt simplificado para evitar JSON mal formado
    prompt = f"""Extract {num_concepts} key concepts for a course.

Course title: {title}
Course description: {description}
Domain: {domain}
Level: {level_description}

For each concept, provide exactly these fields:
- label: short name (2-4 words)
- description: one sentence explanation
- difficulty: integer 1-5
- content: detailed explanation (2-3 sentences)
- examples: array of 2-3 strings

Return ONLY valid JSON array. Example:
[
  {{"label": "Variables", "description": "Store and manage data", "difficulty": 1, "content": "Variables are containers for storing data values...", "examples": ["x = 5", "name = 'John'"]}}
]

IMPORTANT: Use double quotes. No trailing commas. Escape quotes with backslash."""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=1500
        )

        raw = response.choices[0].message.content.strip()
        logger.debug(f"Respuesta raw: {raw[:200]}...")

        cleaned = _clean_json_response(raw)
        concepts = json.loads(cleaned)

        # Validar y mapear conceptos
        mapped_concepts = []
        for i, c in enumerate(concepts):
            mapped_concepts.append({
                "label": c.get("label", f"Concepto {i+1}"),
                "description": c.get("description", f"Descripción del concepto {i+1}"),
                "difficulty": min(max(c.get("difficulty", 3), 1), 5),
                "content": c.get("content", f"Contenido educativo para {c.get('label', f'concepto {i+1}')}"),
                "examples": c.get("examples", ["Ejemplo 1", "Ejemplo 2"])
            })

        logger.info(f"Conceptos extraídos correctamente: {len(mapped_concepts)}")
        return mapped_concepts

    except json.JSONDecodeError as e:
        logger.error(f"Error decodificando JSON: {e}")
        logger.error(f"Respuesta problemática: {raw[:500]}...")
        return _generate_fallback_concepts(title, num_concepts, difficulty_level)

    except Exception as e:
        logger.error(f"Error en extract_concepts_with_content: {e}")
        return _generate_fallback_concepts(title, num_concepts, difficulty_level)


def infer_prerequisites(concepts: list[dict]) -> list[dict]:
    """
    Usa DeepSeek para inferir prerequisitos entre conceptos.

    Returns:
        lista de {source (label), target (label), strength (0.0-1.0)}
    """
    logger.info(f"Infiriendo prerequisitos para {len(concepts)} conceptos")

    concept_labels = [c["label"] for c in concepts]

    prompt = f"""Given these concepts, determine prerequisites.

Concepts: {json.dumps(concept_labels)}

Rules:
- source must be learned BEFORE target
- strength: 0.9=essential, 0.7=helpful, 0.5=related
- No cycles
- Return ONLY JSON array

Example: [{{"source": "Variables", "target": "Functions", "strength": 0.9}}]"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=800
        )

        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        edges = json.loads(cleaned)

        logger.info(f"Prerequisitos inferidos: {len(edges)} edges")
        return edges

    except Exception as e:
        logger.error(f"Error en infer_prerequisites: {e}")
        # Generar edges básicos basados en dificultad
        fallback_edges = []
        sorted_concepts = sorted(concepts, key=lambda x: x["difficulty"])
        for i in range(len(sorted_concepts) - 1):
            fallback_edges.append({
                "source": sorted_concepts[i]["label"],
                "target": sorted_concepts[i + 1]["label"],
                "strength": 0.8
            })
        return fallback_edges


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
        src = label_to_idx.get(edge.get("source"))
        tgt = label_to_idx.get(edge.get("target"))

        if src is None or tgt is None:
            continue

        G.add_edge(src, tgt)
        if not nx.is_directed_acyclic_graph(G):
            G.remove_edge(src, tgt)
            logger.warning(f"Edge eliminado por ciclo: {edge.get('source')} → {edge.get('target')}")
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
    difficulty_level: str = "intermediate",
) -> dict:
    """
    Pipeline completo: título → grafo de conocimiento validado con contenido educativo.

    Returns:
        {concepts: [...], edges: [...], is_valid_dag: bool}
    """
    logger.info(f"Generando currículum: '{title}' (nivel: {difficulty_level})")

    # Paso 1: extraer conceptos con contenido educativo
    concepts = extract_concepts_with_content(title, description, domain, num_concepts, difficulty_level)

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