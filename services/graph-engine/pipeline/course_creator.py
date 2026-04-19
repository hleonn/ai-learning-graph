# pipeline/course_creator.py

import uuid
from loguru import logger
from typing import Dict, Any, Optional
from db.client import supabase

def create_course_from_suggestion(
    course_suggestion: Dict[str, Any],
    bootcamp_title: str
) -> Optional[str]:
    """
    Crea un nuevo curso basado en una sugerencia de IA
    """
    logger.info(f"Creando curso: {course_suggestion.get('title')}")

    # Generar roadmap básico para el curso con prerequisites poblados
    roadmap = {
        "title": course_suggestion.get('title'),
        "duration_months": 2 if course_suggestion.get('difficulty_level') == 'beginner' else 4,
        "phases": [
            {
                "phase_number": 1,
                "name": f"Fundamentos de {course_suggestion.get('title')}",
                "months": "1-2",
                "bloom_levels": ["Recordar", "Comprender", "Aplicar"],
                "objective": f"Dominar los conceptos fundamentales de {course_suggestion.get('title')}",
                "expected_outcomes": [
                    f"Comprender los principios básicos de {course_suggestion.get('title')}",
                    f"Aplicar {course_suggestion.get('title')} en casos prácticos"
                ],
                "skills": [f"Análisis con {course_suggestion.get('title')}", "Resolución de problemas"],
                "tech_stack": ["Herramientas estándar del dominio"],
                "topics": [
                    {
                        "topic_name": f"Introducción a {course_suggestion.get('title')}",
                        "subtopics": [
                            {
                                "label": f"¿Qué es {course_suggestion.get('title')}?",
                                "description": course_suggestion.get('description', ''),
                                "difficulty": 1,
                                "prerequisites": []
                            },
                            {
                                "label": f"Conceptos clave de {course_suggestion.get('title')}",
                                "description": f"Conceptos fundamentales de {course_suggestion.get('title')}",
                                "difficulty": 2,
                                "prerequisites": [f"¿Qué es {course_suggestion.get('title')}?"]
                            },
                            {
                                "label": f"Aplicaciones prácticas de {course_suggestion.get('title')}",
                                "description": f"Aplicaciones prácticas de {course_suggestion.get('title')}",
                                "difficulty": 3,
                                "prerequisites": [f"Conceptos clave de {course_suggestion.get('title')}"]
                            }
                        ]
                    }
                ]
            }
        ]
    }

    try:
        course_data = {
            "title": course_suggestion.get('title'),
            "description": course_suggestion.get('description'),
            "domain": course_suggestion.get('domain', 'generic'),
            "difficulty_level": course_suggestion.get('difficulty_level', 'intermediate'),
            "roadmap": roadmap,
            "created_at": "now()"
        }

        result = supabase.table("courses").insert(course_data).execute()

        if result.data:
            course_id = result.data[0].get('id')
            logger.info(f"✅ Curso creado exitosamente: {course_suggestion.get('title')} (ID: {course_id})")
            return course_id
        else:
            logger.error(f"❌ Error creando curso: {course_suggestion.get('title')}")
            return None

    except Exception as e:
        logger.error(f"❌ Error creando curso {course_suggestion.get('title')}: {e}")
        return None