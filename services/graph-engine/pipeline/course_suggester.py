# pipeline/course_suggester.py

import json
import openai
import os
from loguru import logger
from typing import List, Dict, Any

# Configurar DeepSeek
deepseek_client = openai.OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

def clean_json_response(raw: str) -> str:
    """Limpia la respuesta de la API para obtener JSON válido"""
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    return raw

def generate_course_suggestions(
    bootcamp_title: str,
    bootcamp_description: str,
    existing_courses: List[Dict[str, Any]],
    num_suggestions: int = 5
) -> List[Dict[str, Any]]:
    """
    Genera sugerencias de cursos usando DeepSeek basado en el título y descripción del bootcamp
    """
    logger.info(f"Generando sugerencias de cursos para bootcamp: {bootcamp_title}")

    # Crear lista de cursos existentes para contexto
    existing_titles = [c.get('title', '') for c in existing_courses]
    existing_context = f"\nCursos ya existentes (no sugerir estos): {', '.join(existing_titles)}" if existing_titles else ""

    prompt = f"""Eres un experto en diseño curricular y creación de programas educativos.

Para un bootcamp llamado "{bootcamp_title}" con la siguiente descripción:

{bootcamp_description}

{existing_context}

Genera una lista de {num_suggestions} cursos que debería incluir este bootcamp.
Cada curso debe tener: título, descripción, dominio y nivel de dificultad.

REGLAS IMPORTANTES:
1. NO sugerir cursos que ya existen en la lista de existentes
2. Los cursos deben seguir una progresión lógica (fundamentos primero, luego avanzado)
3. Los títulos deben ser claros y descriptivos
4. Las descripciones deben ser breves (máx 100 caracteres)

Devuelve SOLO JSON en este formato:
[
  {{
    "title": "Nombre del curso",
    "description": "Breve descripción del curso",
    "domain": "data|web|cloud|devops|generic",
    "difficulty_level": "beginner|intermediate|advanced"
  }}
]

Dominios posibles: data, web, cloud, devops, generic
Niveles: beginner, intermediate, advanced

Asegúrate de que los cursos sean RELEVANTES para el tema del bootcamp."""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=2000
        )

        raw = response.choices[0].message.content.strip()
        cleaned = clean_json_response(raw)
        suggestions = json.loads(cleaned)

        logger.info(f"✅ {len(suggestions)} cursos sugeridos por IA")
        return suggestions[:num_suggestions]

    except Exception as e:
        logger.error(f"❌ Error generando sugerencias con IA: {e}")
        # Fallback: cursos genéricos
        return [
            {"title": f"Fundamentos de {bootcamp_title}", "description": f"Conceptos básicos de {bootcamp_title}", "domain": "generic", "difficulty_level": "beginner"},
            {"title": f"{bootcamp_title} Avanzado", "description": f"Técnicas avanzadas de {bootcamp_title}", "domain": "generic", "difficulty_level": "intermediate"},
            {"title": f"Proyecto de {bootcamp_title}", "description": f"Aplicación práctica de {bootcamp_title}", "domain": "generic", "difficulty_level": "advanced"}
        ]


def analyze_course_relevance(
    bootcamp_title: str,
    bootcamp_description: str,
    courses: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Analiza qué cursos son relevantes para el bootcamp usando IA
    """
    if not courses:
        return {"relevant": [], "irrelevant": [], "suggestions": []}

    logger.info(f"Analizando relevancia de {len(courses)} cursos para bootcamp: {bootcamp_title}")

    courses_info = "\n".join([f"- {c.get('title')} (dominio: {c.get('domain', 'generic')})" for c in courses])

    prompt = f"""Para el bootcamp "{bootcamp_title}" con descripción:
{bootcamp_description}

Analiza los siguientes cursos y determina cuáles son RELEVANTES y cuáles son IRRELEVANTES:

{courses_info}

Devuelve SOLO JSON en este formato:
{{
  "relevant": ["título del curso relevante 1", "título del curso relevante 2"],
  "irrelevant": ["título del curso irrelevante 1"],
  "suggestions": [
    {{"replace": "título del curso irrelevante", "suggest": "curso sugerido alternativo", "reason": "razón"}}
  ]
}}"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000
        )

        raw = response.choices[0].message.content.strip()
        cleaned = clean_json_response(raw)
        result = json.loads(cleaned)

        logger.info(f"✅ Análisis completado: {len(result.get('relevant', []))} relevantes, {len(result.get('irrelevant', []))} irrelevantes")
        return result

    except Exception as e:
        logger.error(f"❌ Error analizando relevancia: {e}")
        # Fallback: considerar todos relevantes
        return {
            "relevant": [c.get('title') for c in courses],
            "irrelevant": [],
            "suggestions": []
        }