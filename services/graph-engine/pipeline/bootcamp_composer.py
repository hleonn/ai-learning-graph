import uuid
import networkx as nx
from typing import List, Dict, Any, Tuple, Optional
from loguru import logger
from collections import defaultdict
import os
import json
import re
import openai

from models.bootcamp import WeightedNode, Module, Bootcamp, ModuleStatus
from db.client import supabase


# Configurar DeepSeek
deepseek_client = openai.OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)


def calculate_node_weight(node: Dict[str, Any], graph: nx.DiGraph, max_depth: int, max_deps: int) -> float:
    """Calcula el peso inteligente de un nodo basado en PageRank y complejidad"""

    # PageRank (importancia en el grafo)
    pagerank = node.get('pagerank', 0.1)

    # Calcular profundidad máxima hasta este nodo
    try:
        depth = nx.dag_longest_path_length(graph, node['id']) if graph.has_node(node['id']) else 0
    except:
        depth = 0

    # Número de dependencias (nodos que dependen de este)
    dependencies = graph.out_degree(node['id']) if graph.has_node(node['id']) else 0

    # Normalizar
    depth_normalized = min(1.0, depth / max_depth) if max_depth > 0 else 0
    deps_normalized = min(1.0, dependencies / max_deps) if max_deps > 0 else 0

    # Complejidad: combinación de profundidad y dependencias
    complexity = depth_normalized * 0.5 + deps_normalized * 0.5

    # Peso final: 60% PageRank, 40% complejidad
    weight = pagerank * 0.6 + complexity * 0.4

    return round(min(1.0, weight), 4)


def load_course_graph(course_id: str) -> Tuple[List[Dict], List[Dict], nx.DiGraph]:
    """Carga el grafo de un curso desde Supabase"""

    # Obtener información del curso
    course_res = supabase.table("courses").select("id, title, difficulty_level").eq("id", course_id).execute()
    course_info = course_res.data[0] if course_res.data else {"id": course_id, "title": "Unknown", "difficulty_level": "intermediate"}

    # Obtener nodos
    nodes_res = supabase.table("concept_nodes").select("*").eq("course_id", course_id).execute()
    edges_res = supabase.table("concept_edges").select("*").eq("course_id", course_id).execute()

    nodes = nodes_res.data
    edges = edges_res.data

    # Añadir información del curso a cada nodo
    for node in nodes:
        node['course_title'] = course_info.get('title', 'Unknown')
        node['course_difficulty'] = course_info.get('difficulty_level', 'intermediate')

    # Construir grafo
    G = nx.DiGraph()
    for node in nodes:
        G.add_node(node['id'], **node)
    for edge in edges:
        G.add_edge(edge['source_id'], edge['target_id'], strength=edge.get('prerequisite_strength', 0.8))

    return nodes, edges, G


def compose_bootcamp_graph(course_ids: List[str], student_id: Optional[str] = None) -> Tuple[List[WeightedNode], List[Dict], nx.DiGraph]:
    """Compone múltiples grafos en uno solo"""

    all_nodes = []
    all_edges = []
    combined_graph = nx.DiGraph()

    # Cargar información de los cursos
    courses_info = {}
    for course_id in course_ids:
        course_res = supabase.table("courses").select("id, title, difficulty_level").eq("id", course_id).execute()
        if course_res.data:
            courses_info[course_id] = course_res.data[0]

    # Cargar y fusionar todos los grafos
    for course_id in course_ids:
        nodes, edges, G = load_course_graph(course_id)

        course_title = courses_info.get(course_id, {}).get('title', 'Unknown')

        # Añadir nodos con metadata de origen
        for node in nodes:
            node['original_course_id'] = course_id
            node['original_course_title'] = course_title
            all_nodes.append(node)
            combined_graph.add_node(node['id'], **node)

        # Añadir edges
        for edge in edges:
            all_edges.append(edge)
            combined_graph.add_edge(edge['source_id'], edge['target_id'], strength=edge.get('prerequisite_strength', 0.8))

    # Calcular métricas del grafo combinado
    try:
        # Calcular PageRank
        pagerank = nx.pagerank(combined_graph, alpha=0.85)

        # Calcular orden topológico
        try:
            topo_order = list(nx.topological_sort(combined_graph))
        except nx.NetworkXUnfeasible:
            logger.warning("Grafo combinado tiene ciclos, usando orden aproximado")
            topo_order = list(combined_graph.nodes())

        # Calcular profundidad máxima
        max_depth = 0
        for node_id in combined_graph.nodes():
            try:
                depth = nx.dag_longest_path_length(combined_graph, node_id)
                max_depth = max(max_depth, depth)
            except:
                pass

        # Calcular dependencias máximas
        max_deps = max(combined_graph.out_degree(node) for node in combined_graph.nodes()) if combined_graph.nodes() else 0

    except Exception as e:
        logger.error(f"Error calculando métricas: {e}")
        pagerank = {node['id']: 0.1 for node in all_nodes}
        topo_order = [node['id'] for node in all_nodes]
        max_depth = 1
        max_deps = 1

    # Crear WeightedNodes
    weighted_nodes = []
    for node in all_nodes:
        wn = WeightedNode(
            id=node['id'],
            label=node.get('label', 'Unknown'),
            description=node.get('description', ''),
            weight=calculate_node_weight(node, combined_graph, max_depth, max_deps),
            complexity=node.get('difficulty', 1) / 5.0,
            prerequisite_strength=0.0,
            dependencies_count=combined_graph.out_degree(node['id']),
            original_course_id=node.get('original_course_id', ''),
            original_course_title=node.get('original_course_title', ''),
            pagerank=pagerank.get(node['id'], 0.1),
            difficulty=node.get('difficulty', 1),
            phase=node.get('phase'),
            bloom_levels=node.get('bloom_levels', []),
            skills=node.get('skills', []),
            tech_stack=node.get('tech_stack', [])
        )
        weighted_nodes.append(wn)

    # Si hay estudiante, cargar mastery existente
    if student_id:
        node_ids = [wn.id for wn in weighted_nodes]
        mastery_res = supabase.table("student_mastery").select("node_id, mastery_score").eq("user_id", student_id).in_("node_id", node_ids).execute()
        mastery_map = {m['node_id']: m['mastery_score'] for m in mastery_res.data}

        for wn in weighted_nodes:
            wn.mastery_score = mastery_map.get(wn.id, 0.0)

    return weighted_nodes, all_edges, combined_graph


def organize_modules(weighted_nodes: List[WeightedNode], graph: nx.DiGraph, target_modules: int = 4) -> List[Module]:
    """Organiza los nodos en módulos pedagógicos usando el grafo de dependencias"""

    # Ordenar nodos por orden topológico (respetando dependencias)
    try:
        sorted_nodes = list(nx.topological_sort(graph))
    except:
        sorted_nodes = [node.id for node in weighted_nodes]

    # Mapear ID a WeightedNode
    node_map = {node.id: node for node in weighted_nodes}

    # Distribuir nodos en módulos basado en peso acumulado
    modules = []
    current_module_nodes = []
    current_weight = 0.0

    # Peso total esperado por módulo
    total_weight = sum(node.weight for node in weighted_nodes)
    target_weight_per_module = total_weight / target_modules

    for node_id in sorted_nodes:
        node = node_map.get(node_id)
        if not node:
            continue

        # Si añadir este nodo excede el peso objetivo, crear nuevo módulo
        if current_weight + node.weight > target_weight_per_module and current_module_nodes:
            module_weight = sum(n.weight for n in current_module_nodes)
            module_complexity = sum(n.complexity for n in current_module_nodes) / len(current_module_nodes) if current_module_nodes else 0

            module = Module(
                id=str(uuid.uuid4()),
                name=f"Módulo {len(modules) + 1}",
                order=len(modules) + 1,
                description="",
                node_ids=[n.id for n in current_module_nodes],
                weight=round(module_weight, 4),
                complexity=round(module_complexity, 4),
                prerequisites_modules=[],
                estimated_hours=0,
                status=ModuleStatus.PENDING
            )
            modules.append(module)
            current_module_nodes = []
            current_weight = 0.0

        current_module_nodes.append(node)
        current_weight += node.weight

    # Último módulo
    if current_module_nodes:
        module_weight = sum(n.weight for n in current_module_nodes)
        module_complexity = sum(n.complexity for n in current_module_nodes) / len(current_module_nodes) if current_module_nodes else 0

        module = Module(
            id=str(uuid.uuid4()),
            name=f"Módulo {len(modules) + 1}",
            order=len(modules) + 1,
            description="",
            node_ids=[n.id for n in current_module_nodes],
            weight=round(module_weight, 4),
            complexity=round(module_complexity, 4),
            prerequisites_modules=[],
            estimated_hours=0,
            status=ModuleStatus.PENDING
        )
        modules.append(module)

    # Calcular dependencias entre módulos basado en edges entre nodos
    for i, module in enumerate(modules):
        module_node_ids = set(module.node_ids)
        prereq_modules = set()

        for node_id in module.node_ids:
            for pred in graph.predecessors(node_id):
                for j, other_module in enumerate(modules):
                    if pred in other_module.node_ids and j != i:
                        prereq_modules.add(j + 1)

        module.prerequisites_modules = sorted(prereq_modules)

    return modules


def generate_module_names_with_ai(modules: List[Module], bootcamp_title: str, bootcamp_description: str) -> List[Module]:
    """Usa IA para generar nombres y descripciones de módulos"""

    if not modules:
        return modules

    # Preparar resumen de nodos por módulo
    module_summaries = []
    for i, module in enumerate(modules):
        node_count = len(module.node_ids)
        module_summaries.append(f"Módulo {i+1}: {node_count} conceptos, peso {module.weight:.2f}, complejidad {module.complexity:.2f}")

    prompt = f"""Genera nombres y descripciones profesionales para los módulos de un bootcamp.

Bootcamp: {bootcamp_title}
Descripción: {bootcamp_description or 'Bootcamp de formación profesional'}

Módulos a nombrar (ordenados pedagógicamente):
{chr(10).join(module_summaries)}

Requisitos:
1. Nombres deben reflejar el contenido y progresión del aprendizaje
2. Descripciones deben ser concisas (1-2 oraciones)
3. El primer módulo debe ser introductorio, los últimos más avanzados
4. Usa términos apropiados para el dominio del bootcamp
5. Responde SOLO con JSON, sin markdown

Devuelve:
{{
  "modules": [
    {{"name": "Nombre del módulo 1", "description": "Descripción del módulo 1"}},
    {{"name": "Nombre del módulo 2", "description": "Descripción del módulo 2"}}
  ]
}}"""

    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=1000
        )

        raw = response.choices[0].message.content.strip()

        # Limpiar markdown
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)

        for i, module_data in enumerate(data.get('modules', [])):
            if i < len(modules):
                modules[i].name = module_data.get('name', modules[i].name)
                modules[i].description = module_data.get('description', '')

    except Exception as e:
        logger.error(f"Error generando nombres de módulos con IA: {e}")
        # Mantener nombres por defecto
        for i, module in enumerate(modules):
            module.name = f"Módulo {i+1}: {bootcamp_title[:30]}"
            module.description = f"Avanza en tu camino para dominar {bootcamp_title}"

    return modules


def calculate_personalized_progress(weighted_nodes: List[WeightedNode], modules: List[Module]) -> Dict[str, Any]:
    """Calcula progreso personalizado basado en mastery existente"""

    # Mapear nodos por ID
    node_map = {node.id: node for node in weighted_nodes}

    module_progress = []
    total_completed_weight = 0.0
    total_weight = sum(node.weight for node in weighted_nodes)

    for module in modules:
        module_weight = 0.0
        completed_weight = 0.0

        for node_id in module.node_ids:
            node = node_map.get(node_id)
            if node:
                node_weight = node.weight
                module_weight += node_weight

                mastery = node.mastery_score or 0.0
                if mastery >= 0.8:
                    completed_weight += node_weight
                elif mastery >= 0.6:
                    completed_weight += node_weight * mastery

        progress_pct = (completed_weight / module_weight * 100) if module_weight > 0 else 0
        module_progress.append({
            "module_id": module.id,
            "module_name": module.name,
            "order": module.order,
            "weight": module_weight,
            "completed_weight": completed_weight,
            "progress_pct": round(progress_pct, 2),
            "status": "completed" if progress_pct >= 95 else "in_progress" if progress_pct > 0 else "pending"
        })

        total_completed_weight += completed_weight

    total_progress = (total_completed_weight / total_weight * 100) if total_weight > 0 else 0

    return {
        "total_progress": round(total_progress, 2),
        "total_weight": total_weight,
        "completed_weight": total_completed_weight,
        "modules": module_progress
    }