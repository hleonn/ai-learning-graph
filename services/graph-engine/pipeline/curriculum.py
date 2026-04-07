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
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
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
    """Usa DeepSeek para extraer conceptos clave de un curso con contenido educativo."""
    logger.info(f"Extrayendo {num_concepts} conceptos para: {title} (nivel: {difficulty_level})")

    difficulty_map = {
        "beginner": "principiante - conceptos fundamentales, explicaciones simples",
        "intermediate": "intermedio - conceptos con algo de profundidad, ejemplos prácticos",
        "advanced": "avanzado - conceptos complejos, ejemplos detallados de casos reales",
        "expert": "experto/certificación - conceptos de nivel profesional, preparación para certificación"
    }

    level_description = difficulty_map.get(difficulty_level, difficulty_map["intermediate"])

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
  {{"label": "Variables", "description": "Store and manage data", "difficulty": 1, "content": "Variables are containers...", "examples": ["x = 5", "name = 'John'"]}}
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
    """Usa DeepSeek para inferir prerequisitos entre conceptos."""
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
    """Verifica que el grafo es un DAG válido (sin ciclos)."""
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
    """Pipeline completo: título → grafo de conocimiento validado con contenido educativo."""
    logger.info(f"Generando currículum: '{title}' (nivel: {difficulty_level})")

    concepts = extract_concepts_with_content(title, description, domain, num_concepts, difficulty_level)
    edges = infer_prerequisites(concepts)
    is_valid, clean_edges = validate_dag(concepts, edges)

    logger.success(
        f"Currículum generado: {len(concepts)} conceptos, "
        f"{len(clean_edges)} edges, DAG={is_valid}"
    )

    return {
        "concepts": concepts,
        "edges": clean_edges,
        "is_valid_dag": is_valid,
        "stats": {
            "total_concepts": len(concepts),
            "total_edges": len(clean_edges),
            "removed_edges": len(edges) - len(clean_edges),
        }
    }


def _validate_and_repair_dag(roadmap: dict) -> dict:
    """Valida y repara el DAG asegurando conectividad entre fases"""

    # Recopilar todos los subtemas con sus metadatos
    all_subtopics = []
    phase_map = {}

    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                label = subtopic["label"]
                all_subtopics.append({
                    "label": label,
                    "prerequisites": subtopic.get("prerequisites", []),
                    "phase": phase.get("phase_number", 1),
                    "topic": topic.get("topic_name", "")
                })
                phase_map[label] = phase.get("phase_number", 1)

    # Verificar conectividad entre fases
    phases = sorted(set(phase_map.values()))

    for i in range(len(phases) - 1):
        current_phase = phases[i]
        next_phase = phases[i + 1]

        current_subtopics = [s for s in all_subtopics if s["phase"] == current_phase]
        next_subtopics = [s for s in all_subtopics if s["phase"] == next_phase]

        if not current_subtopics or not next_subtopics:
            continue

        # Conectar el último subtema de la fase actual con el primero de la siguiente
        last_current = current_subtopics[-1]["label"]
        first_next = next_subtopics[0]

        # Verificar si ya tiene dependencias de fase anterior
        has_prev_phase_prereq = False
        for prereq in first_next["prerequisites"]:
            if phase_map.get(prereq, 0) < next_phase:
                has_prev_phase_prereq = True
                break

        if not has_prev_phase_prereq:
            if last_current not in first_next["prerequisites"]:
                first_next["prerequisites"].append(last_current)
                logger.info(f"Reparado: {first_next['label']} ahora depende de {last_current}")

    # Actualizar el roadmap con los cambios
    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                label = subtopic["label"]
                original = next((s for s in all_subtopics if s["label"] == label), None)
                if original:
                    subtopic["prerequisites"] = original["prerequisites"]

    return roadmap


def generate_roadmap(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """Genera un roadmap de aprendizaje con dependencias cruzadas entre fases."""

    duration_map = {
        "beginner": 2,
        "intermediate": 4,
        "advanced": 6,
        "expert": 6
    }
    duration_months = duration_map.get(difficulty_level, 4)

    # Ejemplo de dependencias cruzadas para que DeepSeek aprenda el patrón
    example = """
EJEMPLO DE DEPENDENCIAS CRUZADAS ENTRE FASES (Álgebra):

Fase 1: Suma y Resta
- N1: Suma de monomios (prerrequisitos: [])
- N2: Suma de polinomios (prerrequisitos: ["Suma de monomios"])
- N3: Resta de monomios (prerrequisitos: ["Suma de monomios"])
- N4: Resta de polinomios (prerrequisitos: ["Suma de polinomios", "Resta de monomios"])

Fase 2: Multiplicación y División
- N5: Multiplicación de monomios (prerrequisitos: ["Suma de monomios"])
- N6: Multiplicación de binomios (prerrequisitos: ["Multiplicación de monomios", "Suma de monomios"])
- N7: División de monomios (prerrequisitos: ["Multiplicación de monomios", "Resta de monomios"])
- N8: División de polinomios (prerrequisitos: ["Multiplicación de polinomios", "Resta de polinomios"])

Fase 3: Productos Notables
- N9: Binomio al cuadrado (prerrequisitos: ["Multiplicación de binomios", "Suma de monomios"])
- N10: Binomios conjugados (prerrequisitos: ["Multiplicación de binomios", "Resta de monomios"])

REGLAS CLAVE PARA DEPENDENCIAS:
1. Un nodo en Fase 2 puede depender de MÚLTIPLES nodos de la Fase 1
2. Un nodo en Fase 3 puede depender de MÚLTIPLES nodos de la Fase 2
3. Las dependencias deben ser PEDAGÓGICAMENTE RELEVANTES (no automáticas)
4. El grafo debe ser un SOLO COMPONENTE CONECTADO
5. Cada nodo (excepto los primeros) debe tener al menos UN prerrequisito
"""

    prompt = f"""Genera un roadmap de aprendizaje COMPLETO con DEPENDENCIAS CRUZADAS entre fases.

{example}

Curso: {title}
Descripción: {description}
Dominio: {domain}
Nivel: {difficulty_level.upper()}
Duración: {duration_months} meses

REGLAS OBLIGATORIAS:
1. Cada fase debe tener 2-3 temas, cada tema 3-5 subtemas
2. Los subtemas dentro de un tema forman una SECUENCIA de aprendizaje
3. Los subtemas de Fase 2+ DEBEN tener prerrequisitos de fases ANTERIORES
4. Las dependencias deben ser PEDAGÓGICAMENTE RELEVANTES
5. NO crear dependencias automáticas (ej: todo N depende de todo N-1)
6. El grafo completo debe ser un DAG válido (sin ciclos)

Devuelve SOLO JSON válido. Usa esta estructura:

{{
  "title": "{title}",
  "duration_months": {duration_months},
  "phases": [
    {{
      "phase_number": 1,
      "name": "Nombre de la Fase",
      "months": "1-2",
      "bloom_levels": ["Recordar", "Comprender"],
      "objective": "Objetivo educativo de la fase",
      "expected_outcomes": ["Resultado 1", "Resultado 2"],
      "skills": ["Habilidad 1", "Habilidad 2"],
      "tech_stack": ["Herramienta 1", "Herramienta 2"],
      "topics": [
        {{
          "topic_name": "Nombre del Tema",
          "subtopics": [
            {{"label": "Subtema 1", "description": "Descripción", "difficulty": 1, "prerequisites": []}},
            {{"label": "Subtema 2", "description": "Descripción", "difficulty": 2, "prerequisites": ["Subtema 1"]}}
          ]
        }}
      ]
    }}
  ]
}}

Genera el roadmap:"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=4000
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        raw = raw.replace('\\"', '"')

        roadmap = json.loads(raw)
        logger.info(f"Roadmap generado: {len(roadmap.get('phases', []))} fases")

        roadmap = _validate_and_repair_dag(roadmap)

        return roadmap

    except json.JSONDecodeError as e:
        logger.error(f"Error decodificando JSON: {e}")
        logger.error(f"Respuesta raw: {raw[:500]}...")
        return _generate_fallback_roadmap(title, difficulty_level, duration_months)
    except Exception as e:
        logger.error(f"Error en generate_roadmap: {e}")
        raise


def _generate_fallback_roadmap(title: str, difficulty_level: str, duration_months: int) -> dict:
    """Genera un roadmap de fallback si la API falla"""
    num_phases = 3 if difficulty_level in ["advanced", "expert"] else (2 if difficulty_level == "intermediate" else 1)

    phases = []
    previous_subtopics = []

    for i in range(num_phases):
        phase_num = i + 1
        start_month = i * 2 + 1
        end_month = start_month + 1

        topics = []
        for j in range(2):
            topic_name = f"Tema {phase_num}.{j+1}"
            subtopics = []
            for k in range(3):
                subtopic_label = f"Subtema {phase_num}.{j+1}.{k+1}"
                prereqs = []
                if k > 0:
                    prereqs.append(f"Subtema {phase_num}.{j+1}.{k}")
                if i > 0 and j == 0 and k == 0 and previous_subtopics:
                    prereqs.append(previous_subtopics[-1])
                subtopics.append({
                    "label": subtopic_label,
                    "description": f"Descripción de {subtopic_label}",
                    "difficulty": phase_num + j + k,
                    "prerequisites": prereqs
                })
                if k == 2:
                    previous_subtopics.append(subtopic_label)
            topics.append({
                "topic_name": topic_name,
                "subtopics": subtopics
            })

        phases.append({
            "phase_number": phase_num,
            "name": f"Fase {phase_num}: {title}",
            "months": f"{start_month}-{end_month}",
            "bloom_levels": ["Recordar", "Comprender", "Aplicar"],
            "objective": f"Objetivo de la fase {phase_num}",
            "expected_outcomes": [f"Resultado {phase_num}.1", f"Resultado {phase_num}.2"],
            "skills": [f"Habilidad {phase_num}.1", f"Habilidad {phase_num}.2"],
            "tech_stack": [f"Herramienta {phase_num}.1", f"Herramienta {phase_num}.2"],
            "topics": topics
        })

    return {
        "title": title,
        "duration_months": duration_months,
        "phases": phases
    }