from fastapi import APIRouter, HTTPException, BackgroundTasks, Response
from typing import List, Optional, Dict, Any
from loguru import logger
import uuid
import json
from datetime import datetime

from models.bootcamp import (
    Bootcamp, BootcampRecommendationRequest, BootcampRecommendationResponse,
    ComposeRequest, GEXFExportRequest, WeightedNode, Module, ModuleStatus
)
from pipeline.bootcamp_composer import (
    load_course_graph, compose_bootcamp_graph, organize_modules,
    generate_module_names_with_ai, calculate_personalized_progress
)
from db.client import supabase

router = APIRouter(prefix="/bootcamp", tags=["bootcamp"])


@router.post("/recommend")
async def recommend_bootcamp(request: BootcampRecommendationRequest) -> BootcampRecommendationResponse:
    """Recomienda estructura de bootcamp basada en cursos existentes"""
    logger.info(f"Recomendando bootcamp: {request.title}")

    existing_courses = []
    missing_courses = []

    # Verificar cursos existentes
    for course_id in request.required_course_ids:
        course_res = supabase.table("courses").select("id, title, domain, difficulty_level").eq("id", course_id).execute()
        if course_res.data:
            existing_courses.append(course_res.data[0])

    # Buscar cursos relacionados por dominio
    title_lower = request.title.lower()
    desc_lower = request.description.lower()

    if "web" in title_lower or "web" in desc_lower or "frontend" in title_lower or "react" in title_lower:
        suggested_courses = [
            {"title": "HTML Fundamentos", "description": "Estructura y semántica web", "domain": "web", "difficulty_level": "beginner"},
            {"title": "CSS Esencial", "description": "Estilos y diseño responsivo", "domain": "web", "difficulty_level": "beginner"},
            {"title": "JavaScript Básico", "description": "Programación en el navegador", "domain": "web", "difficulty_level": "beginner"},
            {"title": "React Moderno", "description": "Componentes y estado", "domain": "web", "difficulty_level": "intermediate"},
            {"title": "Node.js API", "description": "Backend con JavaScript", "domain": "web", "difficulty_level": "intermediate"}
        ]
    elif "data" in title_lower or "data" in desc_lower or "machine learning" in title_lower or "ia" in title_lower or "ai" in title_lower:
        suggested_courses = [
            {"title": "Python para Data Science", "description": "Fundamentos de Python", "domain": "data", "difficulty_level": "beginner"},
            {"title": "SQL para Análisis", "description": "Consultas y bases de datos", "domain": "data", "difficulty_level": "beginner"},
            {"title": "Pandas y NumPy", "description": "Manipulación de datos", "domain": "data", "difficulty_level": "intermediate"},
            {"title": "Machine Learning Básico", "description": "Algoritmos fundamentales", "domain": "data", "difficulty_level": "intermediate"},
            {"title": "Deep Learning con PyTorch", "description": "Redes neuronales", "domain": "data", "difficulty_level": "advanced"}
        ]
    else:
        suggested_courses = [
            {"title": f"Fundamentos de {request.title}", "description": f"Conceptos básicos de {request.title}", "domain": "generic", "difficulty_level": "beginner"},
            {"title": f"{request.title} Avanzado", "description": f"Técnicas avanzadas de {request.title}", "domain": "generic", "difficulty_level": "intermediate"},
            {"title": f"Proyecto de {request.title}", "description": f"Aplicación práctica de {request.title}", "domain": "generic", "difficulty_level": "advanced"}
        ]

    # Verificar qué cursos sugeridos faltan
    existing_titles = [c.get('title', '').lower() for c in existing_courses]
    for suggested in suggested_courses:
        if suggested['title'].lower() not in existing_titles:
            missing_courses.append(suggested)

    # Crear bootcamp sugerido
    bootcamp_id = str(uuid.uuid4())
    suggested_bootcamp = Bootcamp(
        id=bootcamp_id,
        title=request.title,
        description=request.description,
        duration_weeks=request.target_duration_weeks,
        modules=[],
        total_weight=0.0,
        created_at=datetime.now().isoformat(),
        version=1
    )

    return BootcampRecommendationResponse(
        existing_courses=existing_courses,
        missing_courses=missing_courses,
        suggested_bootcamp=suggested_bootcamp
    )


@router.post("/compose")
async def compose_bootcamp(request: ComposeRequest) -> Bootcamp:
    """Compone un bootcamp a partir de cursos existentes"""
    logger.info(f"Componiendo bootcamp {request.bootcamp_id} con cursos: {request.course_ids}")

    # Obtener metadata del bootcamp
    bootcamp_res = supabase.table("bootcamps").select("*").eq("id", request.bootcamp_id).execute()

    if not bootcamp_res.data:
        raise HTTPException(status_code=404, detail=f"Bootcamp {request.bootcamp_id} no encontrado")

    bootcamp = Bootcamp(**bootcamp_res.data[0])

    # Componer grafo combinado
    weighted_nodes, edges, graph = compose_bootcamp_graph(request.course_ids, request.student_id)

    # Organizar en módulos (4 módulos por defecto)
    num_modules = max(2, min(6, request.course_ids.count))
    modules = organize_modules(weighted_nodes, graph, target_modules=num_modules)

    # Generar nombres con IA
    modules = generate_module_names_with_ai(modules, bootcamp.title, bootcamp.description)

    # Calcular peso total
    total_weight = sum(m.weight for m in modules)

    # Actualizar bootcamp
    bootcamp.modules = modules
    bootcamp.total_weight = total_weight
    bootcamp.updated_at = datetime.now().isoformat()

    # Guardar en Supabase
    supabase.table("bootcamps").update({
        "modules": [m.dict() for m in modules],
        "total_weight": total_weight,
        "updated_at": datetime.now().isoformat()
    }).eq("id", request.bootcamp_id).execute()

    # Guardar nodos ponderados del bootcamp
    for node in weighted_nodes:
        node_data = node.dict()
        node_data["bootcamp_id"] = request.bootcamp_id
        # Verificar si ya existe
        existing = supabase.table("bootcamp_nodes").select("id").eq("id", node.id).execute()
        if existing.data:
            supabase.table("bootcamp_nodes").update(node_data).eq("id", node.id).execute()
        else:
            supabase.table("bootcamp_nodes").insert(node_data).execute()

    return bootcamp


@router.post("/export/gexf")
async def export_to_gexf(request: GEXFExportRequest):
    """Exporta el grafo del bootcamp a formato GEXF (para Gephi)"""
    logger.info(f"Exportando bootcamp {request.bootcamp_id} a GEXF")

    # Obtener nodos del bootcamp
    nodes_res = supabase.table("bootcamp_nodes").select("*").eq("bootcamp_id", request.bootcamp_id).execute()

    # Obtener edges del bootcamp (de los cursos originales)
    course_ids = list(set([n.get('original_course_id') for n in nodes_res.data if n.get('original_course_id')]))
    all_edges = []

    for course_id in course_ids:
        edges_res = supabase.table("concept_edges").select("*").eq("course_id", course_id).execute()
        all_edges.extend(edges_res.data)

    nodes = nodes_res.data
    edges = all_edges

    # Construir XML GEXF
    gexf = f"""<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.3" version="1.3">
  <meta lastmodifieddate="{datetime.now().strftime('%Y-%m-%d')}">
    <creator>AI Learning Graph</creator>
    <description>Bootcamp Graph Export</description>
  </meta>
  <graph mode="static" defaultedgetype="directed">
    <attributes class="node">
      <attribute id="weight" title="weight" type="float"/>
      <attribute id="complexity" title="complexity" type="float"/>
      <attribute id="pagerank" title="pagerank" type="float"/>
      <attribute id="difficulty" title="difficulty" type="integer"/>
      <attribute id="course" title="course" type="string"/>
    </attributes>
    <nodes>
"""

    for node in nodes:
        node_id = node.get('id', '')
        label = node.get('label', 'Unknown')
        weight = node.get('weight', 0.0)
        complexity = node.get('complexity', 0.0)
        pagerank = node.get('pagerank', 0.0)
        difficulty = node.get('difficulty', 1)
        course = node.get('original_course_title', '')

        gexf += f"""
      <node id="{node_id}" label="{label}">
        <attvalues>
          <attvalue for="weight" value="{weight}"/>
          <attvalue for="complexity" value="{complexity}"/>
          <attvalue for="pagerank" value="{pagerank}"/>
          <attvalue for="difficulty" value="{difficulty}"/>
          <attvalue for="course" value="{course}"/>
        </attvalues>
      </node>"""

    gexf += """
    </nodes>
    <edges>
"""

    edge_id = 0
    for edge in edges:
        source = edge.get('source_id', '')
        target = edge.get('target_id', '')
        strength = edge.get('prerequisite_strength', 0.8)
        gexf += f"""
      <edge id="{edge_id}" source="{source}" target="{target}" weight="{strength}"/>"""
        edge_id += 1

    gexf += """
    </edges>
  </graph>
</gexf>"""

    return Response(
        content=gexf,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=bootcamp_{request.bootcamp_id}.gexf"}
    )


@router.get("/{bootcamp_id}/progress/{student_id}")
async def get_bootcamp_progress(bootcamp_id: str, student_id: str):
    """Obtiene el progreso inteligente de un estudiante en un bootcamp"""
    logger.info(f"Progreso de bootcamp {bootcamp_id} para estudiante {student_id}")

    # Obtener bootcamp
    bootcamp_res = supabase.table("bootcamps").select("*").eq("id", bootcamp_id).execute()
    if not bootcamp_res.data:
        raise HTTPException(status_code=404, detail="Bootcamp no encontrado")

    bootcamp = Bootcamp(**bootcamp_res.data[0])

    # Obtener nodos del bootcamp con mastery del estudiante
    nodes_res = supabase.table("bootcamp_nodes").select("*").eq("bootcamp_id", bootcamp_id).execute()

    # Convertir a WeightedNode y añadir mastery
    weighted_nodes = []
    for node_data in nodes_res.data:
        mastery_res = supabase.table("student_mastery").select("mastery_score").eq("user_id", student_id).eq("node_id", node_data['id']).execute()
        mastery = mastery_res.data[0]['mastery_score'] if mastery_res.data else 0.0

        wn = WeightedNode(
            id=node_data['id'],
            label=node_data['label'],
            description=node_data.get('description', ''),
            weight=node_data.get('weight', 0.1),
            complexity=node_data.get('complexity', 0.5),
            prerequisite_strength=node_data.get('prerequisite_strength', 0.0),
            dependencies_count=node_data.get('dependencies_count', 0),
            original_course_id=node_data.get('original_course_id', ''),
            original_course_title=node_data.get('original_course_title', ''),
            pagerank=node_data.get('pagerank', 0.1),
            difficulty=node_data.get('difficulty', 1),
            phase=node_data.get('phase'),
            bloom_levels=node_data.get('bloom_levels', []),
            skills=node_data.get('skills', []),
            tech_stack=node_data.get('tech_stack', []),
            mastery_score=mastery
        )
        weighted_nodes.append(wn)

    # Calcular progreso personalizado
    progress_data = calculate_personalized_progress(weighted_nodes, bootcamp.modules)

    return {
        "bootcamp_id": bootcamp_id,
        "bootcamp_title": bootcamp.title,
        "duration_weeks": bootcamp.duration_weeks,
        "total_modules": len(bootcamp.modules),
        **progress_data
    }


@router.post("/create")
async def create_bootcamp(bootcamp: Bootcamp):
    """Crea un nuevo bootcamp en la base de datos"""
    logger.info(f"Creando bootcamp: {bootcamp.title}")

    bootcamp.id = str(uuid.uuid4())
    bootcamp.created_at = datetime.now().isoformat()
    bootcamp.updated_at = datetime.now().isoformat()
    bootcamp.version = 1

    result = supabase.table("bootcamps").insert(bootcamp.dict()).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear bootcamp")

    return result.data[0]


@router.get("/")
async def list_bootcamps(limit: int = 50, offset: int = 0):
    """Lista todos los bootcamps"""
    result = supabase.table("bootcamps").select("*").range(offset, offset + limit - 1).order("created_at", desc=True).execute()

    return {
        "bootcamps": result.data,
        "total": len(result.data)
    }


@router.get("/{bootcamp_id}")
async def get_bootcamp(bootcamp_id: str):
    """Obtiene un bootcamp por ID"""
    result = supabase.table("bootcamps").select("*").eq("id", bootcamp_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Bootcamp no encontrado")

    return result.data[0]