"""
Auto-Curriculum Generator - Diseño Instruccional Noruego
------------------------------------------------------
Basado en:
- Taxonomía de Bloom revisada (Anderson & Krathwohl)
- Modelo 4MAT de Bernice McCarthy
- Dybdelæring (aprendizaje profundo noruego)
- Principios de Diseño Instruccional de Gagné
"""

import os
import json
import re
import networkx as nx
import openai
from loguru import logger
from dotenv import load_dotenv
import uuid
from db.client import supabase

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
    raw = raw.replace('\\"', '"')
    raw = raw.replace('"{', '{')
    raw = raw.replace('}"', '}')
    return raw


def _generate_fallback_content(subtopic_label: str, difficulty: int, course_title: str) -> dict:
    """Contenido de fallback educativo"""
    return {
        "motivation": f"Dominar {subtopic_label} es fundamental para avanzar en {course_title}.",
        "explanation": f"{subtopic_label} es un concepto clave en este curso. "
                      f"Para dominarlo, practica con ejercicios reales y consulta "
                      f"la documentación oficial.",
        "analogy": f"Piensa en {subtopic_label} como una herramienta que resuelve problemas específicos.",
        "examples": [
            f"Aplicación práctica de {subtopic_label} en la industria",
            f"Caso de estudio real utilizando {subtopic_label}"
        ],
        "critical_questions": [
            f"¿Cómo se aplica {subtopic_label} en un contexto real?",
            f"¿Qué relación tiene {subtopic_label} con otros conceptos del curso?"
        ],
        "practice_task": f"Realiza un ejercicio práctico que involucre {subtopic_label}.",
        "resources": ["Documentación oficial", "Tutoriales en línea"]
    }


def _generate_fallback_structure(title: str, difficulty_level: str, duration_months: int, bloom_levels: list) -> dict:
    """Estructura de fallback con prerequisites poblados"""
    num_phases = 3 if difficulty_level in ["advanced", "expert"] else (2 if difficulty_level == "intermediate" else 1)

    phases = []
    for i in range(num_phases):
        phase_num = i + 1
        if num_phases == 1:
            start_month = 1
            end_month = duration_months
        else:
            months_per_phase = duration_months / num_phases
            start_month = int(i * months_per_phase) + 1
            if i == num_phases - 1:
                end_month = duration_months
            else:
                end_month = int((i + 1) * months_per_phase)
                if end_month <= start_month:
                    end_month = start_month + 1

        phases.append({
            "phase_number": phase_num,
            "name": f"Fase {phase_num}: Fundamentos de {title}",
            "months": f"{start_month}-{end_month}",
            "bloom_levels": bloom_levels,
            "objective": f"Dominar los conceptos fundamentales de {title} aplicados a casos reales",
            "expected_outcomes": [f"Comprender {title} nivel {phase_num}", f"Aplicar {title} en proyectos"],
            "skills": [f"Habilidad {phase_num}.1", f"Habilidad {phase_num}.2"],
            "tech_stack": [f"Herramienta {phase_num}.1", f"Herramienta {phase_num}.2"],
            "topics": [
                {
                    "topic_name": f"Tema {phase_num}.1",
                    "subtopics": [
                        {"label": f"Subtema {phase_num}.1.1", "description": f"Descripción de Subtema {phase_num}.1.1", "difficulty": 1, "prerequisites": []},
                        {"label": f"Subtema {phase_num}.1.2", "description": f"Descripción de Subtema {phase_num}.1.2", "difficulty": 2, "prerequisites": [f"Subtema {phase_num}.1.1"]}
                    ]
                },
                {
                    "topic_name": f"Tema {phase_num}.2",
                    "subtopics": [
                        {"label": f"Subtema {phase_num}.2.1", "description": f"Descripción de Subtema {phase_num}.2.1", "difficulty": 2, "prerequisites": []},
                        {"label": f"Subtema {phase_num}.2.2", "description": f"Descripción de Subtema {phase_num}.2.2", "difficulty": 3, "prerequisites": [f"Subtema {phase_num}.2.1"]}
                    ]
                }
            ]
        })

    return {
        "title": title,
        "duration_months": duration_months,
        "phases": phases
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT 1: ESTRUCTURA (VERSIÓN OPTIMIZADA)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_roadmap_structure(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """
    PROMPT 1: Genera la estructura del roadmap (VERSIÓN OPTIMIZADA)
    """
    duration_map = {"beginner": 2, "intermediate": 4, "advanced": 6, "expert": 6}
    duration_months = duration_map.get(difficulty_level, 4)

    bloom_by_level = {
        "beginner": ["Recordar", "Comprender", "Aplicar"],
        "intermediate": ["Comprender", "Aplicar", "Analizar"],
        "advanced": ["Aplicar", "Analizar", "Evaluar"],
        "expert": ["Analizar", "Evaluar", "Crear"]
    }
    bloom_levels = bloom_by_level.get(difficulty_level, ["Recordar", "Comprender", "Aplicar"])

    # PROMPT OPTIMIZADO - Más corto y directo
    prompt = f"""Genera un roadmap educativo para el curso: "{title}"

Nivel: {difficulty_level}
Duración: {duration_months} meses
Niveles Bloom: {bloom_levels}

REGLAS IMPORTANTES:
1. Cada subtema DEBE tener "prerequisites" como array de strings con nombres EXACTOS de otros subtemas
2. Si no tiene prerequisitos, usar [] (array vacío)
3. Los prerequisitos deben ser lógicos (ej: "Variables" antes que "Funciones")

Devuelve SOLO JSON (sin explicaciones):

{{
  "title": "{title}",
  "duration_months": {duration_months},
  "phases": [
    {{
      "phase_number": 1,
      "name": "Nombre de la fase",
      "months": "1-2",
      "bloom_levels": {bloom_levels},
      "objective": "Objetivo de aprendizaje medible",
      "expected_outcomes": ["Resultado 1", "Resultado 2"],
      "skills": ["Habilidad 1", "Habilidad 2"],
      "tech_stack": ["Herramienta 1"],
      "topics": [
        {{
          "topic_name": "Nombre del tema",
          "subtopics": [
            {{"label": "Concepto 1", "description": "Descripción breve", "difficulty": 1, "prerequisites": []}},
            {{"label": "Concepto 2", "description": "Descripción breve", "difficulty": 2, "prerequisites": ["Concepto 1"]}},
            {{"label": "Concepto 3", "description": "Descripción breve", "difficulty": 3, "prerequisites": ["Concepto 2"]}}
          ]
        }}
      ]
    }}
  ]
}}"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=3000,
            timeout=45
        )

        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        roadmap = json.loads(cleaned)

        # Validar que los prerequisites existen
        all_labels = set()
        for phase in roadmap.get("phases", []):
            for topic in phase.get("topics", []):
                for subtopic in topic.get("subtopics", []):
                    all_labels.add(subtopic["label"])

        # Verificar y corregir prerequisites
        for phase in roadmap.get("phases", []):
            for topic in phase.get("topics", []):
                for subtopic in topic.get("subtopics", []):
                    valid_prereqs = []
                    for prereq in subtopic.get("prerequisites", []):
                        if prereq in all_labels:
                            valid_prereqs.append(prereq)
                        else:
                            logger.warning(f"Prerequisito inválido '{prereq}' para '{subtopic['label']}'")
                    subtopic["prerequisites"] = valid_prereqs

                    # Log para depuración
                    if len(valid_prereqs) > 0:
                        logger.info(f"✅ Prerequisitos para '{subtopic['label']}': {valid_prereqs}")

        logger.info(f"✅ Estructura generada: {len(roadmap.get('phases', []))} fases")
        return roadmap

    except Exception as e:
        logger.error(f"❌ Error en generate_roadmap_structure: {e}")
        return _generate_fallback_structure(title, difficulty_level, duration_months, bloom_levels)


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT 2: CONTENIDO EDUCATIVO
# ═══════════════════════════════════════════════════════════════════════════════

def generate_subtopic_content(
    subtopic_label: str,
    subtopic_description: str,
    difficulty: int,
    phase_number: int,
    prerequisites: list,
    course_title: str,
    domain: str = "generic"
) -> dict:
    """Genera contenido educativo detallado para un subtema"""
    difficulty_map = {1: "Recordar", 2: "Comprender", 3: "Aplicar", 4: "Analizar", 5: "Crear"}
    difficulty_text = difficulty_map.get(difficulty, "Comprender")

    prompt = f"""Genera contenido educativo para "{subtopic_label}".

Nivel: {difficulty_text}
Curso: {course_title}

Devuelve SOLO JSON:
{{
  "motivation": "Problema real que motiva (1-2 oraciones)",
  "explanation": "Explicación clara del concepto (2-3 párrafos)",
  "analogy": "Analogía simple (1 oración)",
  "examples": ["Ejemplo 1", "Ejemplo 2"],
  "critical_questions": ["Pregunta 1", "Pregunta 2"],
  "practice_task": "Ejercicio para aplicar el concepto",
  "resources": ["Recurso 1", "Recurso 2"]
}}"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=2000,
            timeout=60
        )

        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        content_data = json.loads(cleaned)
        logger.info(f"✅ Contenido generado para: {subtopic_label}")
        return content_data

    except Exception as e:
        logger.error(f"❌ Error generando contenido para {subtopic_label}: {e}")
        return _generate_fallback_content(subtopic_label, difficulty, course_title)


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE COMPATIBILIDAD
# ═══════════════════════════════════════════════════════════════════════════════

def generate_curriculum(
    title: str,
    description: str,
    domain: str = "generic",
    num_concepts: int = 8,
    difficulty_level: str = "intermediate",
) -> dict:
    """Pipeline para curriculum tradicional"""
    logger.info(f"Generando currículum: '{title}' (nivel: {difficulty_level})")

    roadmap = generate_roadmap_structure(title, description, domain, difficulty_level)

    concepts = []
    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                concepts.append({
                    "label": subtopic["label"],
                    "description": subtopic["description"],
                    "difficulty": subtopic["difficulty"],
                    "content": subtopic.get("description", ""),
                    "examples": []
                })

    concepts = concepts[:num_concepts]

    edges = []
    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                for prereq in subtopic.get("prerequisites", []):
                    edges.append({
                        "source": prereq,
                        "target": subtopic["label"],
                        "strength": 0.9
                    })

    from .curriculum import validate_dag
    is_valid, clean_edges = validate_dag(concepts, edges)

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


def infer_prerequisites(concepts: list[dict]) -> list[dict]:
    """Usa DeepSeek para inferir prerequisitos entre conceptos"""
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
            max_tokens=800,
            timeout=30
        )
        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        edges = json.loads(cleaned)
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
    """Verifica que el grafo es un DAG válido (sin ciclos)"""
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
    return is_dag, clean_edges


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════════

def generate_roadmap(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """Pipeline principal para generar roadmap"""
    logger.info(f"📚 Generando roadmap: '{title}' (nivel: {difficulty_level})")

    roadmap = generate_roadmap_structure(title, description, domain, difficulty_level)

    total_subtopics = 0
    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                total_subtopics += 1
                subtopic["content_generated"] = False
                if "prerequisites" not in subtopic:
                    subtopic["prerequisites"] = []

    logger.info(f"✅ Roadmap generado: {len(roadmap.get('phases', []))} fases, {total_subtopics} conceptos")
    return roadmap


# ═══════════════════════════════════════════════════════════════════════════════
# GUARDAR GRAFO DEL CURSO
# ═══════════════════════════════════════════════════════════════════════════════

def save_course_graph(course_id: str, roadmap: dict) -> dict:
    """Guarda el grafo de un curso en Supabase"""
    logger.info(f"Guardando grafo para curso {course_id}")

    concepts = []
    edges = []
    label_to_id = {}

    for phase in roadmap.get("phases", []):
        phase_num = phase.get("phase_number", 1)
        bloom_levels = phase.get("bloom_levels", [])
        expected_outcomes = phase.get("expected_outcomes", [])
        skills = phase.get("skills", [])
        tech_stack = phase.get("tech_stack", [])

        for topic in phase.get("topics", []):
            topic_name = topic.get("topic_name", "")

            for subtopic in topic.get("subtopics", []):
                node_id = str(uuid.uuid4())
                label = subtopic.get("label", "")

                concepts.append({
                    "id": node_id,
                    "course_id": course_id,
                    "label": label,
                    "description": subtopic.get("description", ""),
                    "difficulty": subtopic.get("difficulty", 1),
                    "phase": phase_num,
                    "topic": topic_name,
                    "bloom_levels": bloom_levels,
                    "expected_outcomes": expected_outcomes,
                    "skills": skills,
                    "tech_stack": tech_stack,
                    "position_x": 0,
                    "position_y": 0,
                    "content": subtopic.get("content", ""),
                    "examples": subtopic.get("examples", [])
                })

                label_to_id[label] = node_id

                for prereq_label in subtopic.get("prerequisites", []):
                    edges.append({
                        "source_label": prereq_label,
                        "target_label": label,
                        "strength": 0.9
                    })

    batch_size = 50
    for i in range(0, len(concepts), batch_size):
        batch = concepts[i:i+batch_size]
        result = supabase.table("concept_nodes").insert(batch).execute()
        if not result.data:
            logger.error(f"Error guardando nodos batch {i}")

    edges_created = 0
    for edge in edges:
        source_id = label_to_id.get(edge["source_label"])
        target_id = label_to_id.get(edge["target_label"])
        if source_id and target_id:
            existing = supabase.table("concept_edges").select("id").eq("course_id", course_id).eq("source_id", source_id).eq("target_id", target_id).execute()
            if not existing.data:
                result = supabase.table("concept_edges").insert({
                    "course_id": course_id,
                    "source_id": source_id,
                    "target_id": target_id,
                    "prerequisite_strength": edge["strength"],
                    "edge_type": "prerequisite"
                }).execute()
                if result.data:
                    edges_created += 1

    logger.info(f"✅ Grafo guardado: {len(concepts)} nodos, {edges_created} edges")
    return {
        "nodes_created": len(concepts),
        "edges_created": edges_created,
        "course_id": course_id
    }