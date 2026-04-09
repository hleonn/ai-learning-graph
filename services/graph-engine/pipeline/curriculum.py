"""
Auto-Curriculum Generator - Versión Noruega (dybdelæring)
--------------------------------------------------------
Basado en el sistema educativo noruego:
- Aprendizaje profundo (dybdelæring)
- Problemas del mundo real
- Pensamiento crítico
- Contexto cultural
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
    # Reparar comillas comunes
    raw = raw.replace('\\"', '"')
    raw = raw.replace('"{', '{')
    raw = raw.replace('}"', '}')
    return raw


def _generate_fallback_concepts(title: str, num_concepts: int, difficulty_level: str) -> list[dict]:
    """Genera conceptos de fallback si la API falla"""
    logger.warning(f"Usando fallback para {title}")

    level_multiplier = {"beginner": 1, "intermediate": 2, "advanced": 3, "expert": 4}.get(difficulty_level, 2)

    concepts = []
    base_topics = [
        "Introducción y Fundamentos", "Conceptos Básicos", "Aplicaciones Prácticas",
        "Casos de Estudio", "Mejores Prácticas", "Técnicas Avanzadas", "Optimización", "Proyecto Final"
    ]

    for i in range(min(num_concepts, len(base_topics))):
        difficulty = min(level_multiplier + (i // 2), 5)
        concepts.append({
            "label": f"{base_topics[i]} de {title}",
            "description": f"Exploración del concepto {base_topics[i].lower()} aplicado a {title}",
            "difficulty": difficulty,
            "content": f"Este es el contenido educativo para '{base_topics[i]} de {title}'. Enfoque noruego: aprendizaje profundo y resolución de problemas reales.",
            "examples": [f"Ejemplo en contexto noruego: {base_topics[i].lower()}", f"Ejemplo internacional: {base_topics[i].lower()}"]
        })
    return concepts


def extract_concepts_with_content(
    title: str,
    description: str,
    domain: str = "generic",
    num_concepts: int = 8,
    difficulty_level: str = "intermediate",
) -> list[dict]:
    """Versión simplificada - ya no se usa directamente para roadmaps"""
    logger.info(f"Extrayendo {num_concepts} conceptos para: {title}")
    return _generate_fallback_concepts(title, num_concepts, difficulty_level)


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
            max_tokens=800
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


def generate_curriculum(
    title: str,
    description: str,
    domain: str = "generic",
    num_concepts: int = 8,
    difficulty_level: str = "intermediate",
) -> dict:
    """Pipeline para curriculum tradicional (mantenido por compatibilidad)"""
    concepts = extract_concepts_with_content(title, description, domain, num_concepts, difficulty_level)
    edges = infer_prerequisites(concepts)
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


# ═══════════════════════════════════════════════════════════════════════════════
# NUEVA VERSIÓN: PROMPT 1 - ESTRUCTURA (Enfoque Noruego)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_roadmap_structure(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """
    PROMPT 1: Genera solo la estructura del roadmap (fases, temas, subtemas, prerrequisitos)
    Enfoque: dybdelæring (aprendizaje profundo noruego)
    """

    duration_map = {"beginner": 2, "intermediate": 4, "advanced": 6, "expert": 6}
    duration_months = duration_map.get(difficulty_level, 4)

    # Contexto noruego para el prompt
    norwegian_context = """
CONTEXTO PEDAGÓGICO (Basado en el sistema educativo noruego - mejores puntajes PISA):
1. **Dybdelæring (Aprendizaje Profundo)**: No solo memorizar, sino comprender y aplicar
2. **Real-world problems**: Cada concepto debe resolver un problema real
3. **Critical thinking**: Fomentar preguntas que requieren reflexión
4. **Sustainability**: Conectar con Objetivos de Desarrollo Sostenible (ODS)
5. **Inclusive design**: Accesible para todos los estudiantes
"""

    prompt = f"""Eres un experto pedagogo noruego especializado en "dybdelæring" (aprendizaje profundo).

{ norwegian_context }

Genera un roadmap de aprendizaje para:

Curso: {title}
Descripción: {description}
Dominio: {domain}
Nivel: {difficulty_level}
Duración: {duration_months} meses

REGLAS ESTRUCTURALES:
- Cada fase debe resolver un PROBLEMA REAL
- Cada fase debe tener 2-3 temas
- Cada tema debe tener 2-4 subtemas
- Los prerrequisitos deben ser PEDAGÓGICAMENTE RELEVANTES
- El grafo completo debe ser un DAG (sin ciclos)

RETORNA SOLO JSON VÁLIDO con esta estructura exacta:

{{
  "title": "{title}",
  "duration_months": {duration_months},
  "real_world_context": "Problema real que resuelve este curso (1-2 frases)",
  "sustainable_goals": ["ODS 4", "ODS 9"],
  "phases": [
    {{
      "phase_number": 1,
      "name": "Nombre de la fase",
      "months": "1-2",
      "real_problem": "Problema real que se resuelve en esta fase",
      "bloom_levels": ["Recordar", "Comprender", "Aplicar"],
      "objective": "Objetivo profundo de aprendizaje",
      "expected_outcomes": ["Resultado esperado 1", "Resultado esperado 2"],
      "skills": ["Habilidad 1", "Habilidad 2"],
      "tech_stack": ["Herramienta 1", "Herramienta 2"],
      "topics": [
        {{
          "topic_name": "Nombre del tema",
          "subtopics": [
            {{
              "label": "Nombre del subtema",
              "description": "Breve descripción",
              "difficulty": 1,
              "prerequisites": []
            }}
          ]
        }}
      ]
    }}
  ]
}}

Reglas para difficulty:
- 1 = Principiante (recordar, comprender)
- 2 = Básico (aplicar)
- 3 = Intermedio (analizar)
- 4 = Avanzado (evaluar)
- 5 = Experto (crear)

Genera el roadmap:"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=3000
        )

        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        roadmap = json.loads(cleaned)

        logger.info(f"Estructura generada: {len(roadmap.get('phases', []))} fases")
        return roadmap

    except Exception as e:
        logger.error(f"Error en generate_roadmap_structure: {e}")
        return _generate_fallback_roadmap_structure(title, difficulty_level, duration_months)


def _generate_fallback_roadmap_structure(title: str, difficulty_level: str, duration_months: int) -> dict:
    """Estructura de fallback si la API falla"""
    num_phases = 3 if difficulty_level in ["advanced", "expert"] else (2 if difficulty_level == "intermediate" else 1)

    phases = []
    for i in range(num_phases):
        phase_num = i + 1
        start_month = i * 2 + 1
        end_month = start_month + 1
        phases.append({
            "phase_number": phase_num,
            "name": f"Fase {phase_num}: Fundamentos de {title}",
            "months": f"{start_month}-{end_month}",
            "real_problem": f"Resolver problemas básicos relacionados con {title}",
            "bloom_levels": ["Recordar", "Comprender", "Aplicar"],
            "objective": f"Comprender y aplicar los conceptos fundamentales de {title}",
            "expected_outcomes": [f"Dominar el concepto {i+1}.1", f"Aplicar {i+1}.2 en proyectos"],
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
        "real_world_context": f"Este curso resuelve problemas relacionados con {title}",
        "sustainable_goals": ["ODS 4 - Educación de calidad"],
        "phases": phases
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT 2 - CONTENIDO EDUCATIVO (Enfoque Noruego)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_subtopic_content(
    subtopic_label: str,
    subtopic_description: str,
    difficulty: int,
    phase_number: int,
    prerequisites: list,
    domain: str = "generic"
) -> dict:
    """
    PROMPT 2: Genera contenido educativo detallado para un subtema específico
    Enfoque: dybdelæring (aprendizaje profundo) con ejemplos contextuales
    """

    difficulty_text = {
        1: "Principiante - conceptos fundamentales",
        2: "Básico - primeros pasos prácticos",
        3: "Intermedio - profundización",
        4: "Avanzado - casos complejos",
        5: "Experto - optimización y certificación"
    }.get(difficulty, "Intermedio")

    prompt = f"""Eres un experto pedagogo noruego especializado en "dybdelæring" (aprendizaje profundo).

Genera contenido educativo de alta calidad para:

Concepto: {subtopic_label}
Descripción: {subtopic_description}
Nivel: {difficulty_text}
Fase: {phase_number}
Prerrequisitos: {', '.join(prerequisites) if prerequisites else 'Ninguno'}
Dominio: {domain}

REGLAS PARA CONTENIDO DE CALIDAD (Modelo noruego):

1. **Real-world problem**: Comienza con un problema real que este concepto resuelve
2. **Why this matters**: Explica por qué es importante (conexión con la vida real)
3. **Deep understanding**: Explicación profunda pero accesible (2-3 párrafos)
4. **Contexto**: Usa ejemplos variados (naturaleza, tecnología, sostenibilidad)
5. **Critical thinking**: Incluye 2 preguntas que requieren reflexión
6. **Practice exercise**: Un ejercicio práctico que resuelve un problema real

RETORNA SOLO JSON VÁLIDO con esta estructura:

{{
  "explanation": "Explicación detallada (3-5 párrafos) comenzando con un problema real",
  "real_world_examples": [
    "Ejemplo 1: Contexto práctico",
    "Ejemplo 2: Contexto internacional",
    "Ejemplo 3: Contexto local"
  ],
  "critical_questions": [
    "Pregunta de reflexión 1",
    "Pregunta de reflexión 2"
  ],
  "practice_exercise": "Ejercicio práctico que resuelve un problema real",
  "further_learning": "Recursos adicionales sugeridos"
}}

Genera solo JSON válido:"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1500
        )

        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        content_data = json.loads(cleaned)

        logger.info(f"Contenido generado para: {subtopic_label}")
        return content_data

    except Exception as e:
        logger.error(f"Error generando contenido para {subtopic_label}: {e}")
        return {
            "explanation": f"{subtopic_description}\n\nEste concepto es fundamental para entender {subtopic_label}. Practica los ejercicios relacionados.",
            "real_world_examples": [f"Aplicación práctica de {subtopic_label}", f"Caso de uso real de {subtopic_label}"],
            "critical_questions": [f"¿Por qué es importante {subtopic_label}?", f"¿Cómo se relaciona con otros conceptos?"],
            "practice_exercise": f"Crea un pequeño proyecto que utilice {subtopic_label}",
            "further_learning": "Consulta la documentación oficial para más ejemplos"
        }


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL - ORQUESTA LOS DOS PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

def generate_roadmap(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """
    Pipeline completo:
    - Prompt 1: Genera estructura (fases, temas, subtemas)
    - Prompt 2: Genera contenido para cada subtema (bajo demanda o en batch)
    """

    logger.info(f"Generando roadmap con enfoque noruego: '{title}' (nivel: {difficulty_level})")

    # PROMPT 1: Generar estructura
    roadmap = generate_roadmap_structure(title, description, domain, difficulty_level)

    # PROMPT 2: Generar contenido para cada subtema (opcional - puede ser bajo demanda)
    total_subtopics = 0
    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                total_subtopics += 1
                # Por ahora generamos contenido básico, el contenido detallado se generará bajo demanda
                subtopic["content"] = subtopic.get("description", "")
                subtopic["examples"] = []

    logger.info(f"Roadmap completado: {len(roadmap.get('phases', []))} fases, {total_subtopics} conceptos")

    return roadmap