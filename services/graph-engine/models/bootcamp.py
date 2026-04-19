from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime


class ModuleStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class WeightedNode(BaseModel):
    """Nodo con peso para composición de bootcamps"""
    id: str
    label: str
    description: str
    weight: float = 0.0          # 0-1, importancia en el ecosistema
    complexity: float = 0.0      # 0-1, dificultad del concepto
    prerequisite_strength: float = 0.0  # 0-1, qué tan necesario es
    dependencies_count: int = 0        # cuántos nodos dependen de él
    original_course_id: str
    original_course_title: str
    pagerank: float = 0.0
    difficulty: int = 1
    phase: Optional[int] = None
    bloom_levels: List[str] = []
    skills: List[str] = []
    tech_stack: List[str] = []
    mastery_score: Optional[float] = None  # Para estudiantes específicos


class Module(BaseModel):
    """Módulo de un bootcamp"""
    id: str
    name: str
    order: int
    description: str
    node_ids: List[str] = []
    weight: float = 0.0                # Suma de pesos de los nodos
    complexity: float = 0.0            # Complejidad promedio
    prerequisites_modules: List[int] = []  # IDs de módulos que deben completarse antes
    estimated_hours: int = 0
    status: ModuleStatus = ModuleStatus.PENDING


class Bootcamp(BaseModel):
    """Bootcamp completo"""
    id: str
    title: str
    description: str
    duration_weeks: int
    modules: List[Module] = []
    total_weight: float = 0.0          # Suma de pesos de todos los módulos
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    version: int = 1


class BootcampRecommendationRequest(BaseModel):
    """Request para recomendación de bootcamp"""
    title: str
    description: str
    target_duration_weeks: int = 16
    required_course_ids: List[str] = []
    optional_course_ids: List[str] = []
    student_id: Optional[str] = None


class BootcampRecommendationResponse(BaseModel):
    """Respuesta con recomendación de bootcamp"""
    existing_courses: List[Dict[str, Any]] = []
    missing_courses: List[Dict[str, Any]] = []
    suggested_bootcamp: Optional[Bootcamp] = None
    learning_path_personalized: Optional[Dict[str, Any]] = None


class ComposeRequest(BaseModel):
    """Request para componer bootcamp desde cursos existentes"""
    bootcamp_id: str
    course_ids: List[str] = []
    student_id: Optional[str] = None


class GEXFExportRequest(BaseModel):
    """Request para exportar bootcamp a GEXF"""
    bootcamp_id: str
    include_weights: bool = True
    include_mastery: bool = False

class BootcampRecommendationResponse(BaseModel):
    existing_courses: List[Dict[str, Any]] = []
    missing_courses: List[Dict[str, Any]] = []
    suggested_bootcamp: Optional[Bootcamp] = None
    irrelevant_courses: List[Dict[str, Any]] = []
    relevant_suggestions: List[Dict[str, Any]] = []
    bootcamp_domain: str = "generic"
    generated_by_ai: bool = True