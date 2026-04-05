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

    prompt = f"""You are an expert curriculum designer. Extract exactly {num_concepts} key concepts from this course.

Course title: {title}
Course description: {description}
Domain: {domain}
Difficulty level: {level_description}

For EACH concept, provide:
1. label: Short name (max 3 words)
2. description: One sentence summary (what the student will learn)
3. difficulty: Integer 1-5 (1=basic, 5=expert)
4. content: Detailed explanation of the concept (2-3 paragraphs, comprehensive, educational)
5. examples: 2-3 practical examples or use cases (as an array of strings)

The content should be like a textbook section - thorough, educational, and appropriate for the difficulty level.
For beginner: focus on fundamentals, simple language
For intermediate: add depth, real-world context
For advanced: include technical details, best practices
For expert: professional-level insights, edge cases, certification prep

Return ONLY a JSON array. No explanation, no markdown, just the JSON.

Example format:
[
  {{
    "label": "Variables",
    "description": "Learn how to declare and assign values to variables",
    "difficulty": 1,
    "content": "A variable is a named container that stores data in memory. In programming, variables allow you to store, modify, and retrieve information throughout your program. Variables have a name (identifier) and a value. For example, in Python, you can write `age = 25` to store the number 25 in a variable called 'age'...",
    "examples": ["`name = 'John'` stores a text value", "`count = count + 1` increments a counter", "`total = price * quantity` calculates a total"]
  }}
]"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000
        )

        raw = response.choices[0].message.content.strip()

        # Limpiar posibles backticks
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        concepts = json.loads(raw)
        logger.info(f"Conceptos extraídos con contenido: {len(concepts)}")
        return concepts

    except Exception as e:
        logger.error(f"Error en extract_concepts_with_content: {e}")
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