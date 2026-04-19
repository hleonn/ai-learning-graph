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
    num_suggestions: int = None
) -> List[Dict[str, Any]]:
    """
    Genera sugerencias de cursos usando DeepSeek.
    La IA decide cuántos cursos son necesarios (entre 3 y 7).
    """
    logger.info(f"Generando sugerencias de cursos para bootcamp: {bootcamp_title}")

    existing_titles = [c.get('title', '') for c in existing_courses]
    existing_context = f"\nCursos ya existentes (NO sugerir estos): {', '.join(existing_titles)}" if existing_titles else ""

    prompt = f"""Eres un experto en diseño curricular.

Bootcamp: "{bootcamp_title}"
Descripción: {bootcamp_description[:500]}{existing_context}

Genera entre 3 y 7 cursos para este bootcamp (tú decides la cantidad según la complejidad).
Los cursos deben seguir una progresión lógica.

Devuelve SOLO JSON:
[
  {{"title": "...", "description": "...", "domain": "data|web|cloud|devops|generic", "difficulty_level": "beginner|intermediate|advanced"}}
]"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=1000,
            timeout=30
        )

        raw = response.choices[0].message.content.strip()
        cleaned = clean_json_response(raw)
        suggestions = json.loads(cleaned)

        logger.info(f"✅ {len(suggestions)} cursos sugeridos por IA")
        return suggestions

    except Exception as e:
        logger.error(f"❌ Error generando sugerencias con IA: {e}")
        return [
            {"title": f"Fundamentos de {bootcamp_title}", "description": "Conceptos básicos", "domain": "generic", "difficulty_level": "beginner"},
            {"title": f"{bootcamp_title} Avanzado", "description": "Técnicas avanzadas", "domain": "generic", "difficulty_level": "intermediate"},
            {"title": f"Proyecto de {bootcamp_title}", "description": "Aplicación práctica", "domain": "generic", "difficulty_level": "advanced"}
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
{bootcamp_description[:300]}

Analiza estos cursos:

{courses_info}

Devuelve SOLO JSON:
{{
  "relevant": ["título relevante 1", "título relevante 2"],
  "irrelevant": ["título irrelevante 1"],
  "suggestions": [
    {{"replace": "título irrelevante", "suggest": "alternativa", "reason": "razón"}}
  ]
}}"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800,
            timeout=30
        )

        raw = response.choices[0].message.content.strip()
        cleaned = clean_json_response(raw)
        result = json.loads(cleaned)

        logger.info(f"✅ Análisis: {len(result.get('relevant', []))} relevantes, {len(result.get('irrelevant', []))} irrelevantes")
        return result

    except Exception as e:
        logger.error(f"❌ Error analizando relevancia: {e}")
        return {
            "relevant": [c.get('title') for c in courses],
            "irrelevant": [],
            "suggestions": []
        }