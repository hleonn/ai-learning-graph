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


def _generate_fallback_content(subtopic_label: str, difficulty: int) -> dict:
    """Contenido de fallback educativo"""
    return {
        "explanation": f"{subtopic_label} es un concepto fundamental en este curso. "
                      f"Para dominarlo, practica con ejercicios reales y consulta "
                      f"la documentación oficial.",
        "real_world_examples": [
            f"Aplicación práctica de {subtopic_label} en la industria",
            f"Caso de estudio real utilizando {subtopic_label}"
        ],
        "critical_questions": [
            f"¿Cómo se aplica {subtopic_label} en un contexto real?",
            f"¿Qué relación tiene {subtopic_label} con otros conceptos del curso?"
        ],
        "practice_exercise": f"Realiza un ejercicio práctico que involucre {subtopic_label}.",
        "further_learning": f"Consulta tutoriales avanzados sobre {subtopic_label}."
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT 1: ESTRUCTURA (Taxonomía de Bloom + Diseño Instruccional)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_roadmap_structure(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """
    PROMPT 1: Genera la estructura del roadmap
    Enfoque: Taxonomía de Bloom revisada + Diseño Instruccional
    """

    duration_map = {"beginner": 2, "intermediate": 4, "advanced": 6, "expert": 6}
    duration_months = duration_map.get(difficulty_level, 4)

    # Niveles de Bloom por nivel de dificultad
    bloom_by_level = {
        "beginner": ["Recordar", "Comprender", "Aplicar"],
        "intermediate": ["Comprender", "Aplicar", "Analizar"],
        "advanced": ["Aplicar", "Analizar", "Evaluar"],
        "expert": ["Analizar", "Evaluar", "Crear"]
    }
    bloom_levels = bloom_by_level.get(difficulty_level, ["Recordar", "Comprender", "Aplicar"])

    prompt = f"""Eres un experto en Diseño Instruccional. Genera un roadmap educativo de alta calidad.

Curso: {title}
Descripción: {description}
Dominio: {domain}
Nivel: {difficulty_level}
Duración: {duration_months} meses

REQUERIMIENTOS PEDAGÓGICOS:
1. **Taxonomía de Bloom**: Cada fase debe usar estos niveles: {bloom_levels}
2. **Diseño Instruccional**: Cada fase debe tener:
   - Un problema REAL que motiva el aprendizaje
   - Objetivos específicos y medibles
   - Resultados esperados tangibles
3. **Estructura**: 2-3 temas por fase, 2-4 subtemas por tema
4. **Prerrequisitos**: Deben ser pedagógicamente relevantes (no automáticos)

FORMATO JSON ESTRICTO (sin contenido educativo detallado, solo estructura):

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
      "expected_outcomes": ["Resultado 1", "Resultado 2", "Resultado 3"],
      "skills": ["Habilidad 1", "Habilidad 2", "Habilidad 3"],
      "tech_stack": ["Herramienta 1", "Herramienta 2"],
      "topics": [
        {{
          "topic_name": "Nombre del tema",
          "subtopics": [
            {{
              "label": "Nombre del subtema",
              "description": "Breve descripción (máx 15 palabras)",
              "difficulty": 1,
              "prerequisites": []
            }}
          ]
        }}
      ]
    }}
  ]
}}

Reglas difficulty: 1=Recordar, 2=Comprender, 3=Aplicar, 4=Analizar, 5=Crear

Genera solo JSON válido:"""

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

        logger.info(f"✅ Estructura generada: {len(roadmap.get('phases', []))} fases")
        return roadmap

    except Exception as e:
        logger.error(f"❌ Error en generate_roadmap_structure: {e}")
        return _generate_fallback_structure(title, difficulty_level, duration_months, bloom_levels)


def _generate_fallback_structure(title: str, difficulty_level: str, duration_months: int, bloom_levels: list) -> dict:
    """Estructura de fallback"""
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
# PROMPT 2: CONTENIDO EDUCATIVO (Modelo 4MAT + Aprendizaje Contextual)
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
    """
    PROMPT 2: Genera contenido educativo detallado
    Enfoque: Modelo 4MAT (McCarthy) + Aprendizaje Contextual
    """

    difficulty_map = {
        1: "Recordar - conceptos básicos",
        2: "Comprender - explicar con palabras propias",
        3: "Aplicar - usar en situaciones concretas",
        4: "Analizar - descomponer en partes",
        5: "Crear - generar nuevos productos"
    }
    difficulty_text = difficulty_map.get(difficulty, "Comprender y aplicar")

    prompt = f"""Eres un experto en Diseño Instruccional. Genera contenido educativo excepcional.

CONCEPTO: {subtopic_label}
DESCRIPCIÓN: {subtopic_description}
NIVEL BLOOM: {difficulty_text}
FASE: {phase_number}
PRERREQUISITOS: {', '.join(prerequisites) if prerequisites else 'Ninguno'}
CURSO: {course_title}
DOMINIO: {domain}

REQUERIMIENTOS PEDAGÓGICOS (Modelo 4MAT):

1. **¿POR QUÉ?** (Motivación)
   - Comienza con un problema REAL que este concepto resuelve
   - Explica la relevancia en el mundo real

2. **¿QUÉ?** (Conceptualización)
   - Explicación clara y profunda (3-4 párrafos)
   - Usa analogías y ejemplos concretos

3. **¿CÓMO?** (Aplicación)
   - 2-3 ejemplos prácticos paso a paso
   - Contextos variados (industrial, académico, personal)

4. **¿QUÉ MÁS?** (Reflexión)
   - 2 preguntas de pensamiento crítico
   - Conexión con conceptos previos y futuros

FORMATO JSON ESTRICTO:

{{
  "motivation": "Problema real que motiva el aprendizaje (1-2 oraciones)",
  "explanation": "Explicación detallada del concepto (3-4 párrafos)",
  "analogy": "Analogía que facilita la comprensión",
  "examples": [
    "Ejemplo práctico 1: Situación real paso a paso",
    "Ejemplo práctico 2: Caso de uso diferente",
    "Ejemplo práctico 3: Aplicación avanzada"
  ],
  "critical_questions": [
    "Pregunta de reflexión 1",
    "Pregunta de reflexión 2"
  ],
  "practice_task": "Tarea práctica para aplicar el concepto",
  "resources": ["Recurso 1", "Recurso 2"]
}}

Genera solo JSON válido, sin markdown, sin explicaciones adicionales."""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000
        )

        raw = response.choices[0].message.content.strip()
        cleaned = _clean_json_response(raw)
        content_data = json.loads(cleaned)

        logger.info(f"✅ Contenido generado para: {subtopic_label}")
        return content_data

    except Exception as e:
        logger.error(f"❌ Error generando contenido para {subtopic_label}: {e}")
        return _generate_fallback_content(subtopic_label, difficulty)


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL - ORQUESTA LOS PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

def generate_roadmap(
    title: str,
    description: str,
    domain: str = "generic",
    difficulty_level: str = "intermediate",
) -> dict:
    """
    Pipeline principal:
    - Prompt 1: Genera estructura
    - Los subtemas se guardan SIN contenido detallado
    - El contenido se generará bajo demanda con generate_subtopic_content
    """

    logger.info(f"📚 Generando roadmap: '{title}' (nivel: {difficulty_level})")

    # PROMPT 1: Estructura
    roadmap = generate_roadmap_structure(title, description, domain, difficulty_level)

    # Asegurar que los subtemas tienen campos para contenido futuro
    total_subtopics = 0
    for phase in roadmap.get("phases", []):
        for topic in phase.get("topics", []):
            for subtopic in topic.get("subtopics", []):
                total_subtopics += 1
                # Inicializar campos de contenido (se llenarán bajo demanda)
                subtopic["content_generated"] = False
                subtopic["motivation"] = ""
                subtopic["explanation"] = ""
                subtopic["analogy"] = ""
                subtopic["examples"] = []
                subtopic["critical_questions"] = []
                subtopic["practice_task"] = ""
                subtopic["resources"] = []

    logger.info(f"✅ Roadmap generado: {len(roadmap.get('phases', []))} fases, {total_subtopics} conceptos")
    logger.info(f"💡 El contenido detallado se generará bajo demanda al publicar en Classroom")

    return roadmap