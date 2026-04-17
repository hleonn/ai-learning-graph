// @ts-nocheck
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses, createCourseWithRoadmap, checkMultipleCoursesGraphs, saveBootcampAsProgram } from '../lib/api'
import { calculateProgressiveWeights, suggestCourseOrder, suggestPedagogicalOrder } from '../utils/bootcampWeights'
import { buildBootcampGlobalGraph } from '../utils/bootcampGraphBuilder'
import type { BootcampGraph } from '../utils/bootcampGraphBuilder'

interface Course {
    id: string
    title: string
    description: string
    domain: string
    difficulty_level?: string
}

interface RecommendedCourse {
    title: string
    description: string
    domain: string
    difficulty_level: string
}

interface Module {
    id: string
    name: string
    order: number
    description: string
    node_ids: string[]
    weight: number
    complexity: number
    prerequisites_modules: number[]
    estimated_hours: number
    weekly_hours?: number
    weeks_duration?: number
}

interface Bootcamp {
    id: string
    title: string
    description: string
    duration_weeks: number
    modules: Module[]
    total_weight: number
}

interface GenerationProgress {
    current: number
    total: number
    courseName: string
    status: 'generating' | 'building_graph' | 'completed' | 'failed'
    nodeCount?: number
    edgeCount?: number
}

// Clave para localStorage
const STORAGE_KEY_BOOTCAMP_STATE = 'bootcamp_creator_state'

// Interfaz para guardar el estado completo
interface BootcampCreatorState {
    bootcampTitle: string
    bootcampDescription: string
    durationWeeks: number
    selectedCourses: string[]
    recommendation: any
    bootcampId: string | null
    createdBootcamp: Bootcamp | null
    globalBootcampGraph: BootcampGraph | null
    bootcampBuilt: boolean
    generatedCourseIds: string[]
    graphCheckResultsData: Array<[string, { hasGraph: boolean; nodeCount: number; edgeCount: number }]>
    allCoursesHaveGraphs: boolean
    timestamp: number
}

// Función para guardar estado en localStorage
const saveStateToLocalStorage = (state: Partial<BootcampCreatorState>) => {
    try {
        const existing = localStorage.getItem(STORAGE_KEY_BOOTCAMP_STATE)
        const currentState = existing ? JSON.parse(existing) : {}
        const newState = { ...currentState, ...state, timestamp: Date.now() }
        localStorage.setItem(STORAGE_KEY_BOOTCAMP_STATE, JSON.stringify(newState))
        console.log('💾 Estado del bootcamp guardado en localStorage')
    } catch (error) {
        console.error('Error saving bootcamp state:', error)
    }
}

// Función para cargar estado desde localStorage
const loadStateFromLocalStorage = (): BootcampCreatorState | null => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_BOOTCAMP_STATE)
        if (!saved) return null

        const state = JSON.parse(saved)
        // Verificar si el estado tiene menos de 1 hora (3600000 ms)
        if (Date.now() - (state.timestamp || 0) > 3600000) {
            console.log('⏰ Estado expirado, limpiando...')
            localStorage.removeItem(STORAGE_KEY_BOOTCAMP_STATE)
            return null
        }

        console.log('📀 Estado del bootcamp cargado desde localStorage')
        return state
    } catch (error) {
        console.error('Error loading bootcamp state:', error)
        return null
    }
}

// Función para limpiar estado
const clearBootcampState = () => {
    localStorage.removeItem(STORAGE_KEY_BOOTCAMP_STATE)
    console.log('🗑️ Estado del bootcamp limpiado')
}

export default function BootcampCreator() {
    const navigate = useNavigate()
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(false)
    const [bootcampTitle, setBootcampTitle] = useState('')
    const [bootcampDescription, setBootcampDescription] = useState('')
    const [durationWeeks, setDurationWeeks] = useState(16)
    const [selectedCourses, setSelectedCourses] = useState<string[]>([])
    const [recommendation, setRecommendation] = useState<{
        existing_courses: Course[]
        missing_courses: RecommendedCourse[]
        suggested_bootcamp: Bootcamp | null
        learning_path_personalized: any
    } | null>(null)
    const [bootcampId, setBootcampId] = useState<string | null>(null)
    const [createdBootcamp, setCreatedBootcamp] = useState<Bootcamp | null>(null)
    const [globalBootcampGraph, setGlobalBootcampGraph] = useState<BootcampGraph | null>(null)

    // Estados del nuevo flujo con feedback mejorado
    const [generatingCourses, setGeneratingCourses] = useState(false)
    const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null)
    const [checkingGraphs, setCheckingGraphs] = useState(false)
    const [graphCheckResults, setGraphCheckResults] = useState<Map<string, { hasGraph: boolean; nodeCount: number; edgeCount: number }>>(new Map())
    const [buildingBootcamp, setBuildingBootcamp] = useState(false)
    const [allCoursesHaveGraphs, setAllCoursesHaveGraphs] = useState(false)
    const [generatedCourseIds, setGeneratedCourseIds] = useState<string[]>([])
    const [bootcampBuilt, setBootcampBuilt] = useState(false)
    const [savingProgram, setSavingProgram] = useState(false)

    // Cargar cursos disponibles y restaurar estado guardado
    useEffect(() => {
        const loadCourses = async () => {
            try {
                const data = await getCourses()
                setCourses(data.courses || [])

                // Restaurar estado guardado después de cargar cursos
                const savedState = loadStateFromLocalStorage()
                if (savedState) {
                    console.log('🔄 Restaurando estado guardado del bootcamp...')
                    setBootcampTitle(savedState.bootcampTitle)
                    setBootcampDescription(savedState.bootcampDescription)
                    setDurationWeeks(savedState.durationWeeks)
                    setSelectedCourses(savedState.selectedCourses)
                    setRecommendation(savedState.recommendation)
                    setBootcampId(savedState.bootcampId)
                    setCreatedBootcamp(savedState.createdBootcamp)
                    setGlobalBootcampGraph(savedState.globalBootcampGraph)
                    setBootcampBuilt(savedState.bootcampBuilt)
                    setGeneratedCourseIds(savedState.generatedCourseIds)
                    setAllCoursesHaveGraphs(savedState.allCoursesHaveGraphs)

                    // Restaurar graphCheckResults
                    if (savedState.graphCheckResultsData) {
                        const restoredMap = new Map(savedState.graphCheckResultsData)
                        setGraphCheckResults(restoredMap)
                    }

                    alert(`🔄 Se ha restaurado el bootcamp "${savedState.bootcampTitle}"\n\n` +
                        `Puedes continuar desde donde lo dejaste.`)
                }
            } catch (error) {
                console.error('Error loading courses:', error)
            }
        }
        loadCourses()
    }, [])

    // Sincronizar estado de grafos antes de recomendar
    const syncGraphsBeforeRecommend = async () => {
        if (selectedCourses.length === 0) return

        console.log('🔄 Sincronizando estado de grafos antes de recomendar...')
        const results = await checkMultipleCoursesGraphs(selectedCourses)
        setGraphCheckResults(results)

        const allHaveGraphs = Array.from(results.values()).every(r => r.hasGraph)
        setAllCoursesHaveGraphs(allHaveGraphs)

        console.log('📊 Estado de grafos sincronizado:', {
            total: results.size,
            withGraphs: Array.from(results.values()).filter(r => r.hasGraph).length,
            details: Array.from(results.entries()).map(([id, r]) => ({
                id: id.substring(0, 8),
                hasGraph: r.hasGraph,
                nodeCount: r.nodeCount
            }))
        })

        return results
    }

    const handleRecommend = async () => {
        if (!bootcampTitle.trim()) {
            alert('Ingresa un título para el bootcamp')
            return
        }

        setLoading(true)
        try {
            // Primero sincronizar estado de grafos
            await syncGraphsBeforeRecommend()

            const token = localStorage.getItem('google_token')

            // Depuración: mostrar qué cursos estamos enviando
            console.log('📤 Enviando recomendación con:', {
                title: bootcampTitle,
                description: bootcampDescription,
                target_duration_weeks: durationWeeks,
                required_course_ids: selectedCourses,
                selectedCoursesDetails: selectedCourses.map(id => {
                    const course = courses.find(c => c.id === id)
                    const graphInfo = graphCheckResults.get(id)
                    return {
                        id: id.substring(0, 8),
                        title: course?.title,
                        hasGraph: graphInfo?.hasGraph,
                        nodeCount: graphInfo?.nodeCount
                    }
                })
            })

            const response = await fetch('https://mygateway.up.railway.app/bootcamp/recommend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: bootcampTitle,
                    description: bootcampDescription,
                    target_duration_weeks: durationWeeks,
                    required_course_ids: selectedCourses
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()

            // Depuración: ver qué devuelve el backend
            console.log('📥 Respuesta de recomendación:', {
                existing_courses: data.existing_courses?.length,
                missing_courses: data.missing_courses?.length,
                existing_details: data.existing_courses?.map((c: any) => ({
                    id: c.id?.substring(0, 8),
                    title: c.title
                })),
                missing_details: data.missing_courses?.map((c: any) => ({
                    title: c.title,
                    domain: c.domain
                }))
            })

            setRecommendation(data)
            setBootcampId(data.suggested_bootcamp?.id || null)

            // Guardar estado después de recomendación
            saveStateToLocalStorage({
                bootcampTitle,
                bootcampDescription,
                durationWeeks,
                selectedCourses,
                recommendation: data,
                bootcampId: data.suggested_bootcamp?.id || null,
                graphCheckResultsData: Array.from(graphCheckResults.entries()),
                allCoursesHaveGraphs
            })

            // Verificar si el backend reconoció correctamente los cursos
            const recognizedIds = new Set(data.existing_courses?.map((c: any) => c.id) || [])
            const unrecognizedCourses = selectedCourses.filter(id => !recognizedIds.has(id))

            if (unrecognizedCourses.length > 0 && selectedCourses.length > 0) {
                const unrecognizedNames = unrecognizedCourses.map(id => {
                    const course = courses.find(c => c.id === id)
                    const graphInfo = graphCheckResults.get(id)
                    return `${course?.title || id} (grafo: ${graphInfo?.hasGraph ? '✅' : '❌'})`
                })
                console.warn('⚠️ Cursos no reconocidos por el backend:', unrecognizedNames)
                alert(`⚠️ El backend no reconoció ${unrecognizedCourses.length} curso(s):\n${unrecognizedNames.join('\n')}\n\n` +
                    `Estos cursos serán tratados como "faltantes" y se generarán nuevamente.\n\n` +
                    `Si los cursos ya existen, verifica que tengan grafos generados.`)
            }

        } catch (error) {
            console.error('Error en recomendación:', error)
            alert(`Error al recomendar bootcamp: ${error}\n\n` +
                `Verifica que el backend esté funcionando correctamente.`)
        } finally {
            setLoading(false)
        }
    }

    // Función auxiliar para exportar con grafo global
    async function exportBootcampToGexfLocalWithGraph(
        bootcampGraph: BootcampGraph,
        title: string,
        description: string
    ): Promise<boolean> {
        try {
            const { generateGexfFromGraph } = await import('../utils/exportToGexf')

            const gexfContent = generateGexfFromGraph(
                { nodes: bootcampGraph.nodes, edges: bootcampGraph.edges },
                title,
                description
            )

            const blob = new Blob([gexfContent], { type: 'application/xml' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `bootcamp_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            return true
        } catch (error) {
            console.error('Error exporting bootcamp graph:', error)
            return false
        }
    }

    // Exportar a GEXF - Versión corregida
    const handleExportGEXF = async () => {
        if (selectedCourses.length === 0) {
            alert('No hay cursos seleccionados para exportar')
            return
        }

        setLoading(true)
        try {
            // Si tenemos el grafo global construido, exportarlo
            if (globalBootcampGraph && globalBootcampGraph.nodes.length > 0) {
                const success = await exportBootcampToGexfLocalWithGraph(
                    globalBootcampGraph,
                    bootcampTitle || 'Mi Bootcamp',
                    bootcampDescription || ''
                )

                if (success) {
                    alert(`✅ Archivo GEXF exportado correctamente.\n\n` +
                        `Incluye ${globalBootcampGraph.nodes.length} nodos y ${globalBootcampGraph.edges.length} edges.\n` +
                        `Representa el grafo completo del bootcamp con todos los conceptos y sus relaciones.\n\n` +
                        `Puedes abrirlo con Gephi 0.10 para análisis avanzado.`)
                } else {
                    throw new Error('Error en exportación local')
                }
            } else {
                // Fallback: reconstruir el grafo
                alert('Reconstruyendo grafo global para exportación...')
                const courseInfos: CourseInfo[] = await Promise.all(selectedCourses.map(async (courseId) => {
                    const course = courses.find(c => c.id === courseId)
                    const graphInfo = graphCheckResults.get(courseId)
                    return {
                        id: courseId,
                        title: course?.title || courseId,
                        nodeCount: graphInfo?.nodeCount || 0,
                        edgeCount: graphInfo?.edgeCount || 0,
                        difficulty: 'intermediate' as const
                    }
                }))

                const suggestedOrder = suggestCourseOrder(courseInfos)
                const weights = calculateProgressiveWeights(courseInfos, suggestedOrder)
                const weightMap = new Map<string, number>()
                weights.forEach(w => weightMap.set(w.courseId, w.weight))

                const bootcampGraph = await buildBootcampGlobalGraph(suggestedOrder, weightMap)
                const success = await exportBootcampToGexfLocalWithGraph(
                    bootcampGraph,
                    bootcampTitle || 'Mi Bootcamp',
                    bootcampDescription || ''
                )

                if (success) {
                    alert(`✅ Archivo GEXF exportado correctamente con ${bootcampGraph.nodes.length} nodos.`)
                } else {
                    throw new Error('Error en exportación')
                }
            }
        } catch (error) {
            console.error('Error:', error)
            alert('Error al exportar a GEXF. Verifica que los cursos tengan grafos.')
        } finally {
            setLoading(false)
        }
    }

    // Verificar grafos con información detallada usando la nueva API
    const checkCoursesGraphs = async (courseIds: string[]) => {
        setCheckingGraphs(true)

        const results = await checkMultipleCoursesGraphs(courseIds)
        setGraphCheckResults(results)

        const allHaveGraphs = Array.from(results.values()).every(r => r.hasGraph)
        setAllCoursesHaveGraphs(allHaveGraphs)
        setCheckingGraphs(false)

        // Mostrar feedback detallado
        const courseNames = courses.filter(c => courseIds.includes(c.id))
        const missingGraphs = Array.from(results.entries())
            .filter(([, result]) => !result.hasGraph)
            .map(([id]) => courseNames.find(c => c.id === id)?.title || id)

        if (missingGraphs.length > 0) {
            alert(`⚠️ Los siguientes cursos NO tienen grafos:\n${missingGraphs.join('\n')}\n\nDebes generarlos primero usando "Generar cursos faltantes".`)
        } else {
            const totalNodes = Array.from(results.values()).reduce((sum, r) => sum + r.nodeCount, 0)
            const totalEdges = Array.from(results.values()).reduce((sum, r) => sum + r.edgeCount, 0)
            alert(`✅ Todos los ${courseIds.length} cursos tienen sus grafos correctamente.\n📊 Total: ${totalNodes} nodos, ${totalEdges} edges`)
        }

        // Guardar estado después de verificar grafos
        saveStateToLocalStorage({
            graphCheckResultsData: Array.from(graphCheckResults.entries()),
            allCoursesHaveGraphs
        })

        return allHaveGraphs
    }

    // Generar un curso completo usando la nueva API
    const generateFullCourse = async (courseInfo: RecommendedCourse, index: number, total: number): Promise<string | null> => {
        try {
            // 1. Generar roadmap con IA
            setGenerationProgress({
                current: index,
                total: total,
                courseName: courseInfo.title,
                status: 'generating'
            })

            const roadmapResponse = await fetch('https://mygateway.up.railway.app/ai/roadmap/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: courseInfo.title,
                    description: courseInfo.description,
                    domain: courseInfo.domain,
                    difficulty_level: courseInfo.difficulty_level
                })
            })

            if (!roadmapResponse.ok) {
                throw new Error(`Error generando roadmap: ${roadmapResponse.status}`)
            }

            const roadmapData = await roadmapResponse.json()

            // Extraer fases correctamente
            let phases = null
            if (roadmapData.phases && Array.isArray(roadmapData.phases)) {
                phases = roadmapData.phases
            } else if (roadmapData.data && roadmapData.data.phases) {
                phases = roadmapData.data.phases
            } else if (Array.isArray(roadmapData) && roadmapData[0]?.phases) {
                phases = roadmapData[0].phases
            }

            if (!phases || phases.length === 0) {
                throw new Error('No se generaron fases para el curso')
            }

            const finalRoadmap = {
                title: courseInfo.title,
                duration_months: phases.length,
                phases: phases
            }

            // 2. Construir el grafo
            setGenerationProgress({
                current: index,
                total: total,
                courseName: courseInfo.title,
                status: 'building_graph'
            })

            // Usar la nueva función que crea curso + grafo
            const result = await createCourseWithRoadmap({
                title: courseInfo.title,
                description: courseInfo.description,
                domain: courseInfo.domain,
                difficulty_level: courseInfo.difficulty_level,
                roadmap: finalRoadmap
            })

            if (!result.success) {
                throw new Error(result.message)
            }

            setGenerationProgress(prev => prev ? {
                ...prev,
                status: 'completed',
                nodeCount: result.nodeCount,
                edgeCount: result.edgeCount
            } : null)

            return result.id

        } catch (error) {
            console.error(`Error generando curso ${courseInfo.title}:`, error)
            setGenerationProgress(prev => prev ? { ...prev, status: 'failed' } : null)
            return null
        }
    }

    // Generar cursos faltantes con feedback visual detallado
    const generateMissingCourses = async () => {
        if (!recommendation?.missing_courses?.length) {
            alert('No hay cursos faltantes para generar')
            return
        }

        const missingCourses = recommendation.missing_courses
        const totalCourses = missingCourses.length
        const existingSelected = [...selectedCourses]
        const newGeneratedIds: string[] = []

        setGeneratingCourses(true)

        for (let i = 0; i < totalCourses; i++) {
            const course = missingCourses[i]
            const courseId = await generateFullCourse(course, i + 1, totalCourses)

            if (courseId) {
                newGeneratedIds.push(courseId)
                existingSelected.push(courseId)
            }

            // Pequeña pausa entre cursos
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        // Actualizar estados
        setSelectedCourses(existingSelected)
        setGeneratedCourseIds(newGeneratedIds)
        setGeneratingCourses(false)

        // Limpiar progreso después de un momento
        setTimeout(() => setGenerationProgress(null), 2000)

        // Recargar lista de cursos disponibles
        try {
            const refreshedCourses = await getCourses()
            setCourses(refreshedCourses.courses || [])
        } catch (error) {
            console.error('Error refreshing courses:', error)
        }

        // Mostrar resumen final
        const successCount = newGeneratedIds.length
        if (successCount === totalCourses) {
            alert(`✅ Éxito: Se generaron ${totalCourses} cursos con sus grafos correctamente.\n\nAhora puedes verificar los grafos y construir el bootcamp.`)
        } else {
            alert(`⚠️ Parcial: ${successCount} de ${totalCourses} cursos generados. Revisa la consola para más detalles.`)
        }

        // Verificar automáticamente los grafos después de generar
        if (existingSelected.length > 0) {
            await checkCoursesGraphs(existingSelected)
        }

        // Guardar estado después de generar cursos
        saveStateToLocalStorage({
            selectedCourses: existingSelected,
            generatedCourseIds: newGeneratedIds,
            graphCheckResultsData: Array.from(graphCheckResults.entries()),
            allCoursesHaveGraphs
        })
    }

    // Construcción virtual del bootcamp con pesos progresivos y grafo global
    // Construcción virtual del bootcamp con pesos progresivos y grafo global
    // Construcción virtual del bootcamp con pesos progresivos y grafo global
    const buildBootcampDiscrete = async () => {
        if (!allCoursesHaveGraphs) {
            alert('Verifica que todos los cursos tengan grafos primero')
            return
        }

        if (selectedCourses.length === 0) {
            alert('Selecciona al menos un curso para construir el bootcamp')
            return
        }

        setBuildingBootcamp(true)

        try {
            // 1. Obtener información de los cursos seleccionados
            const courseInfos = await Promise.all(selectedCourses.map(async (courseId) => {
                const course = courses.find(c => c.id === courseId)
                const graphInfo = graphCheckResults.get(courseId)

                // Determinar dificultad basada en número de nodos
                let difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert' = 'intermediate'
                const nodeCount = graphInfo?.nodeCount || 0
                if (nodeCount < 15) difficulty = 'beginner'
                else if (nodeCount < 25) difficulty = 'intermediate'
                else if (nodeCount < 35) difficulty = 'advanced'
                else difficulty = 'expert'

                return {
                    id: courseId,
                    title: course?.title || courseId,
                    nodeCount: graphInfo?.nodeCount || 0,
                    edgeCount: graphInfo?.edgeCount || 0,
                    difficulty: difficulty,
                    complexityScore: nodeCount / 50
                }
            }))

            console.log('📚 Cursos seleccionados:', courseInfos.map(c => ({ title: c.title, difficulty: c.difficulty, nodeCount: c.nodeCount })))

            // 2. Obtener grafos de cada curso para analizar dependencias
            const courseGraphs = new Map<string, any[]>()
            for (const courseId of selectedCourses) {
                try {
                    const response = await fetch(`https://mygateway.up.railway.app/graph/${courseId}`)
                    if (response.ok) {
                        const graphData = await response.json()
                        const nodes = graphData.nodes || []

                        // Extraer información de nodos con sus prerrequisitos
                        const nodeInfo = nodes.map((node: any) => {
                            const nodeData = node.data || node
                            let prerequisites: string[] = []

                            // Buscar prerequisites en diferentes campos
                            if (nodeData.prerequisites && Array.isArray(nodeData.prerequisites)) {
                                prerequisites = nodeData.prerequisites
                            } else if (nodeData.prerequisite_labels && Array.isArray(nodeData.prerequisite_labels)) {
                                prerequisites = nodeData.prerequisite_labels
                            } else if (node.prerequisites && Array.isArray(node.prerequisites)) {
                                prerequisites = node.prerequisites
                            }

                            return {
                                id: nodeData.id || node.id,
                                label: nodeData.label || node.label,
                                description: nodeData.description || '',
                                difficulty: nodeData.difficulty || 3,
                                prerequisites: prerequisites
                            }
                        })

                        courseGraphs.set(courseId, nodeInfo)

                        // Log para depuración
                        const courseTitle = courseInfos.find(c => c.id === courseId)?.title || courseId
                        const nodesWithPrereqs = nodeInfo.filter((n: { prerequisites: string[] }) => n.prerequisites.length > 0)
                        console.log(`🔍 Curso "${courseTitle}": ${nodeInfo.length} nodos, ${nodesWithPrereqs.length} con prerrequisitos`)
                        if (nodesWithPrereqs.length > 0) {
                            console.log(`   Ejemplo: "${nodesWithPrereqs[0].label}" requiere:`, nodesWithPrereqs[0].prerequisites.slice(0, 3))
                        }
                    } else {
                        console.warn(`⚠️ No se pudo obtener grafo para curso ${courseId}: ${response.status}`)
                        courseGraphs.set(courseId, [])
                    }
                } catch (error) {
                    console.error(`Error fetching graph for course ${courseId}:`, error)
                    courseGraphs.set(courseId, [])
                }
            }

            // 3. Sugerir orden pedagógico basado en dependencias reales
            const pedagogicalOrderMap: Record<string, number> = {
                'PYTHON_DEBE_SER_PRIMERO': 1,
                'Python': 1,
                'SQL': 2,
                'Pandas': 3,
                'Machine Learning': 4,
                'Deep Learning': 5
            }

            const suggestedOrder = [...courseInfos]
                .sort((a, b) => {
                    const orderA = pedagogicalOrderMap[a.title.split(' ')[0]] || 99
                    const orderB = pedagogicalOrderMap[b.title.split(' ')[0]] || 99
                    return orderA - orderB
                })
                .map(c => c.id)

            console.log('📋 ORDEN PEDAGÓGICO MANUAL:', suggestedOrder.map(id => courseInfos.find(c => c.id === id)?.title))
            console.log('📋 Orden sugerido por dependencias:', suggestedOrder.map((id: string) => {
                const course = courseInfos.find(c => c.id === id)
                return course?.title
            }).filter(Boolean))

            // 4. Calcular pesos progresivos
            const weights = calculateProgressiveWeights(courseInfos, suggestedOrder)
            const weightMap = new Map<string, number>()
            weights.forEach(w => weightMap.set(w.courseId, w.weight))

            console.log('📊 Pesos calculados:', weights.map(w => ({ title: w.courseTitle, percentage: w.percentage, order: suggestedOrder.indexOf(w.courseId) + 1 })))

            // 5. Construir grafo global del bootcamp
            const bootcampGraph = await buildBootcampGlobalGraph(suggestedOrder, weightMap)
            setGlobalBootcampGraph(bootcampGraph)

            // Guardar grafo global en localStorage
            localStorage.setItem('bootcamp_global_graph', JSON.stringify(bootcampGraph))
            localStorage.setItem('bootcamp_global_graph_title', bootcampTitle)
            localStorage.setItem('bootcamp_global_graph_timestamp', Date.now().toString())
            console.log('💾 Grafo global guardado en localStorage')

            const totalBootcampHours = durationWeeks * 40
            // Calcular distribución uniforme de semanas por módulo
// Primero, calcular semanas por módulo basado en peso
            let totalWeight = 0
            for (const w of weights) {
                totalWeight += w.weight
            }

// Calcular semanas por módulo (redondeado, asegurando suma = durationWeeks)
            let remainingWeeks = durationWeeks
            const moduleWeeks: number[] = []
            for (let i = 0; i < weights.length; i++) {
                const weight = weights[i]
                let weeks = Math.round((weight.weight / totalWeight) * durationWeeks)
                if (i === weights.length - 1) {
                    weeks = remainingWeeks // El último módulo toma las semanas restantes
                }
                moduleWeeks.push(Math.max(1, weeks))
                remainingWeeks -= weeks
            }

// Ajustar para que la suma sea exactamente durationWeeks
            const totalAssignedWeeks = moduleWeeks.reduce((a, b) => a + b, 0)
            if (totalAssignedWeeks !== durationWeeks) {
                const diff = durationWeeks - totalAssignedWeeks
                moduleWeeks[moduleWeeks.length - 1] += diff
            }
            // Crear módulos con horas distribuidas uniformemente (40h/semana)
            const virtualModules = suggestedOrder.map((courseId, idx) => {
                const weight = weights.find(w => w.courseId === courseId)
                const course = courses.find(c => c.id === courseId)
                const weeksForModule = moduleWeeks[idx]
                const moduleHours = weeksForModule * 40  // 40 horas por semana × número de semanas
                const weeklyHours = 40
                return {
                    id: `module-${idx}`,
                    name: course?.title || `Módulo ${idx + 1}`,
                    order: idx + 1,
                    description: course?.description || `Curso: ${course?.title || ''}`,
                    node_ids: [],
                    weight: weight?.weight || 0.2,
                    complexity: weight?.complexity || 0.5,
                    prerequisites_modules: idx > 0 ? [idx - 1] : [],
                    estimated_hours: moduleHours,
                    weekly_hours: weeklyHours,
                    weeks_duration: weeksForModule,
                }
            })

            const virtualBootcamp: Bootcamp = {
                id: bootcampId || `virtual-${Date.now()}`,
                title: bootcampTitle,
                description: bootcampDescription || `Bootcamp de ${bootcampTitle}`,
                duration_weeks: durationWeeks,
                total_weight: 1,
                modules: virtualModules
            }

            setCreatedBootcamp(virtualBootcamp)
            setBootcampBuilt(true)

            // Mostrar resumen con pesos progresivos
            const courseDetails = weights.map(w => {
                const barLength = Math.round(w.percentage / 2)
                const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength)
                const orderIndex = suggestedOrder.indexOf(w.courseId) + 1
                return `  ${orderIndex}. 📚 ${w.courseTitle.padEnd(25)} ${w.percentage}% ${bar}`
            }).join('\n')

            alert(`✅ Bootcamp "${bootcampTitle}" preparado virtualmente con ${selectedCourses.length} cursos.\n\n` +
                `Orden de aprendizaje:\n${courseDetails}\n\n` +
                `📊 Grafo global: ${bootcampGraph.summary.totalNodes} nodos, ${bootcampGraph.summary.totalEdges} edges\n\n` +
                `Los cursos están listos para exportar a Gephi.`)

            // Guardar estado en localStorage después de construir
            saveStateToLocalStorage({
                bootcampTitle,
                bootcampDescription,
                durationWeeks,
                selectedCourses,
                recommendation,
                bootcampId,
                createdBootcamp: virtualBootcamp,
                globalBootcampGraph: bootcampGraph,
                bootcampBuilt: true,
                generatedCourseIds,
                graphCheckResultsData: Array.from(graphCheckResults.entries()),
                allCoursesHaveGraphs
            })

        } catch (error) {
            console.error('Error building virtual bootcamp:', error)
            alert('Error al preparar el bootcamp virtual')
        } finally {
            setBuildingBootcamp(false)
        }
    }

    // Guardar bootcamp como programa de formación
    const handleSaveToPrograms = async () => {
        if (!createdBootcamp || !bootcampBuilt) {
            alert('Primero debes construir el bootcamp')
            return
        }

        if (selectedCourses.length === 0) {
            alert('No hay cursos seleccionados para guardar')
            return
        }

        setSavingProgram(true)
        try {
            const program = await saveBootcampAsProgram(
                bootcampTitle,
                bootcampDescription || `Bootcamp de ${bootcampTitle}`,
                durationWeeks,
                selectedCourses,
                createdBootcamp.modules || []
            )

            if (program) {
                alert(`✅ Bootcamp "${bootcampTitle}" guardado correctamente en Programas de Formación.\n\n` +
                    `Podrás verlo en la sección de Bootcamps del Dashboard.`)

                // Limpiar estado después de guardar exitosamente
                //clearBootcampState()
            } else {
                throw new Error('Error al guardar el programa')
            }
        } catch (error) {
            console.error('Error saving program:', error)
            alert('Error al guardar el bootcamp en Programas de Formación')
        } finally {
            setSavingProgram(false)
        }
    }

    // Limpiar todo el progreso
    const handleClearProgress = () => {
        if (confirm('¿Limpiar todo el progreso del bootcamp actual?\n\nEsta acción no se puede deshacer.')) {
            clearBootcampState()
            // Resetear estados
            setBootcampTitle('')
            setBootcampDescription('')
            setDurationWeeks(16)
            setSelectedCourses([])
            setRecommendation(null)
            setBootcampId(null)
            setCreatedBootcamp(null)
            setGlobalBootcampGraph(null)
            setBootcampBuilt(false)
            setGeneratedCourseIds([])
            setGraphCheckResults(new Map())
            setAllCoursesHaveGraphs(false)
            alert('🧹 Progreso limpiado. Puedes comenzar un nuevo bootcamp.')
        }
    }

    // Obtener nombre del curso por ID
    const getCourseName = (courseId: string): string => {
        const course = courses.find(c => c.id === courseId)
        return course?.title || courseId.substring(0, 8)
    }

    // Calcular estadísticas de grafos
    const getGraphStats = () => {
        let totalNodes = 0
        let totalEdges = 0
        let withGraphs = 0

        for (const [, result] of graphCheckResults) {
            if (result.hasGraph) {
                withGraphs++
                totalNodes += result.nodeCount
                totalEdges += result.edgeCount
            }
        }

        return { withGraphs, totalNodes, totalEdges, total: graphCheckResults.size }
    }

    const graphStats = getGraphStats()

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => navigate('/dashboard')} style={styles.back}>← Volver al Dashboard</button>
                    <button onClick={handleClearProgress} style={styles.clearBtn}>🗑️ Limpiar progreso</button>
                </div>
                <h1 style={styles.title}>🎓 Creador de Bootcamps</h1>
                <p style={styles.subtitle}>Crea programas de formación combinando cursos existentes</p>
            </div>

            <div style={styles.container}>
                <div style={styles.formCard}>
                    <h2 style={styles.formTitle}>Información del Bootcamp</h2>

                    <div style={styles.field}>
                        <label style={styles.label}>Título del Bootcamp *</label>
                        <input
                            style={styles.input}
                            placeholder="Ej. Ingeniería en Inteligencia Artificial"
                            value={bootcampTitle}
                            onChange={e => setBootcampTitle(e.target.value)}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Descripción</label>
                        <textarea
                            style={styles.textarea}
                            placeholder="Describe el objetivo y contenido del bootcamp..."
                            value={bootcampDescription}
                            onChange={e => setBootcampDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Duración (semanas)</label>
                        <select
                            style={styles.select}
                            value={durationWeeks}
                            onChange={e => setDurationWeeks(Number(e.target.value))}
                        >
                            <option value={4}>1 mes</option>
                            <option value={8}>2 meses</option>
                            <option value={12}>3 meses</option>
                            <option value={16}>4 meses</option>
                            <option value={24}>6 meses</option>
                        </select>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Cursos disponibles para incluir</label>
                        <div style={styles.checkboxGroup}>
                            {courses.length === 0 ? (
                                <p style={styles.mutedText}>No hay cursos disponibles. Genera algunos primero.</p>
                            ) : (
                                courses.map(course => {
                                    const graphInfo = graphCheckResults.get(course.id)
                                    let statusBadge = ''
                                    let statusColor = {}

                                    if (graphInfo) {
                                        if (graphInfo.hasGraph) {
                                            statusBadge = `✅ ${graphInfo.nodeCount} nodos`
                                            statusColor = { color: '#1D9E75' }
                                        } else {
                                            statusBadge = '⚠️ sin grafo'
                                            statusColor = { color: '#E24B4A' }
                                        }
                                    }

                                    return (
                                        <label key={course.id} style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={selectedCourses.includes(course.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedCourses([...selectedCourses, course.id])
                                                    } else {
                                                        setSelectedCourses(selectedCourses.filter(id => id !== course.id))
                                                    }
                                                }}
                                            />
                                            <span>{course.title}</span>
                                            <span style={styles.courseBadge}>{course.domain}</span>
                                            {statusBadge && <span style={{...styles.graphBadge, ...statusColor}}>{statusBadge}</span>}
                                        </label>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    <button
                        style={styles.primaryBtn}
                        onClick={handleRecommend}
                        disabled={loading}
                    >
                        {loading ? '🔍 Analizando...' : '🔍 Recomendar estructura'}
                    </button>
                </div>

                {recommendation && (
                    <div style={styles.resultCard}>
                        <h2 style={styles.formTitle}>Recomendación IA</h2>

                        {/* Feedback visual de generación de cursos */}
                        {generationProgress && (
                            <div style={styles.progressContainer}>
                                <div style={styles.progressHeader}>
                                    <strong>📚 Generando curso {generationProgress.current} de {generationProgress.total}</strong>
                                    <span style={styles.progressCourseName}>{generationProgress.courseName}</span>
                                </div>
                                <div style={styles.progressBarTrack}>
                                    <div
                                        style={{
                                            ...styles.progressBarFill,
                                            width: `${(generationProgress.current / generationProgress.total) * 100}%`
                                        }}
                                    />
                                </div>
                                <div style={styles.progressStatus}>
                                    {generationProgress.status === 'generating' && (
                                        <span>🔄 Generando roadmap con IA... (puede tomar hasta 60s)</span>
                                    )}
                                    {generationProgress.status === 'building_graph' && (
                                        <span>🏗️ Construyendo grafo de aprendizaje...</span>
                                    )}
                                    {generationProgress.status === 'completed' && generationProgress.nodeCount && (
                                        <span style={{ color: '#1D9E75' }}>
                                            ✅ Curso completado: {generationProgress.nodeCount} nodos, {generationProgress.edgeCount} edges
                                        </span>
                                    )}
                                    {generationProgress.status === 'failed' && (
                                        <span style={{ color: '#E24B4A' }}>❌ Error en la generación</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Feedback de verificación de grafos */}
                        {checkingGraphs && (
                            <div style={styles.checkingContainer}>
                                <div style={styles.spinner}></div>
                                <span>🔍 Verificando grafos de los cursos seleccionados...</span>
                            </div>
                        )}

                        {/* Resumen de verificación de grafos */}
                        {graphCheckResults.size > 0 && !checkingGraphs && graphStats.total > 0 && (
                            <div style={styles.graphSummary}>
                                <details open>
                                    <summary style={styles.graphSummaryTitle}>
                                        📊 Estado de Grafos ({graphStats.withGraphs}/{graphStats.total} cursos con grafo)
                                        {graphStats.totalNodes > 0 && ` · ${graphStats.totalNodes} nodos · ${graphStats.totalEdges} edges`}
                                    </summary>
                                    <div style={styles.graphSummaryList}>
                                        {Array.from(graphCheckResults.entries()).map(([courseId, result]) => (
                                            <div key={courseId} style={styles.graphSummaryItem}>
                                                <span>{result.hasGraph ? '✅' : '❌'}</span>
                                                <span style={{ flex: 1 }}>{getCourseName(courseId)}</span>
                                                {result.hasGraph ? (
                                                    <span style={styles.graphNodeCount}>{result.nodeCount} nodos, {result.edgeCount} edges</span>
                                                ) : (
                                                    <span style={{ color: '#E24B4A', fontSize: 11 }}>Sin grafo</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Cursos existentes */}
                        <div style={styles.recommendationSection}>
                            <h3>📚 Cursos existentes</h3>
                            {recommendation.existing_courses?.length > 0 ? (
                                <ul>
                                    {recommendation.existing_courses.map(c => {
                                        const graphInfo = graphCheckResults.get(c.id)
                                        const hasGraph = graphInfo?.hasGraph
                                        return (
                                            <li key={c.id}>
                                                {hasGraph ? '✅' : '⚠️'} {c.title}
                                                {!hasGraph && <span style={{ color: '#E24B4A', fontSize: 11, marginLeft: 8 }}>(sin grafo)</span>}
                                            </li>
                                        )
                                    })}
                                </ul>
                            ) : <p>No hay cursos seleccionados</p>}
                        </div>

                        {/* Cursos faltantes */}
                        <div style={styles.recommendationSection}>
                            <h3>⚠️ Cursos recomendados (faltantes)</h3>
                            {recommendation.missing_courses?.length > 0 ? (
                                <>
                                    <ul>
                                        {recommendation.missing_courses.map((c: RecommendedCourse, idx:number) => (
                                            <li key={idx}>
                                                📖 {c.title}
                                                {generatedCourseIds.length > idx && <span style={styles.generatedBadge}> ✅ Generado</span>}
                                                <span style={styles.courseDomainBadge}>{c.domain}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        style={styles.warningBtn}
                                        onClick={generateMissingCourses}
                                        disabled={generatingCourses}
                                    >
                                        {generatingCourses ? '⏳ Generando cursos...' : '🔧 Generar cursos faltantes'}
                                    </button>
                                </>
                            ) : <p style={styles.successText}>✅ Tienes todos los cursos necesarios</p>}
                        </div>

                        {/* Botones de verificación y construcción */}
                        <div style={styles.buttonGroup}>
                            <button
                                style={styles.secondaryBtn}
                                onClick={() => checkCoursesGraphs(selectedCourses)}
                                disabled={checkingGraphs || selectedCourses.length === 0}
                            >
                                {checkingGraphs ? '🔍 Verificando grafos...' : '🔍 Verificar Grafos de Cursos'}
                            </button>

                            {allCoursesHaveGraphs && (
                                <button
                                    style={styles.successBtn}
                                    onClick={buildBootcampDiscrete}
                                    disabled={buildingBootcamp}
                                >
                                    {buildingBootcamp ? '🏗️ Construyendo bootcamp...' : '🏗️ Construcción Discreta de Bootcamp'}
                                </button>
                            )}
                        </div>

                        {/* Mostrar mensaje si los grafos están verificados */}
                        {allCoursesHaveGraphs && !bootcampBuilt && selectedCourses.length > 0 && (
                            <div style={styles.successMessage}>
                                ✅ Todos los cursos tienen sus grafos. Puedes proceder con la construcción virtual.
                            </div>
                        )}

                        {/* Mostrar mensaje si faltan grafos */}
                        {!allCoursesHaveGraphs && graphCheckResults.size > 0 && !checkingGraphs && (
                            <div style={styles.warningMessage}>
                                ⚠️ Algunos cursos no tienen grafos. Usa "Generar cursos faltantes" para crearlos.
                            </div>
                        )}

                        {/* Módulos generados después de construcción virtual */}
                        {createdBootcamp && (
                            <div style={styles.recommendationSection}>
                                <h3 style={styles.sectionSubtitle}>📋 Bootcamp Virtual - Módulos
                                    ({createdBootcamp.modules?.length || 0})</h3>
                                <div style={styles.modulesList}>
                                    {createdBootcamp.modules?.map((module: Module) => (
                                        <div key={module.id} style={styles.modulePreview}>
                                            <div style={styles.moduleHeader}>
                                                <span style={styles.moduleOrder}>Módulo {module.order}</span>
                                                <span
                                                    style={styles.moduleWeight}>Peso: {Math.round(module.weight * 100)}%</span>
                                            </div>
                                            <div style={styles.moduleName}>{module.name}</div>
                                            <div style={styles.moduleDesc}>{module.description}</div>
                                            <div style={styles.moduleMeta}>
                                                <span>📊 Complejidad: {Math.round(module.complexity * 100)}%</span>
                                                <span>⏱️ {module.estimated_hours}h totales</span>
                                                <span>📅 {module.weekly_hours}h/semana</span>
                                                {module.weeks_duration && <span>🗓️ {module.weeks_duration} semanas</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Footer con explicación de horas */}
                                <div style={styles.hoursFooter}>
                                    <p style={styles.hoursExplanation}>
                                        ⏱️ <strong>Cálculo de horas:</strong> {durationWeeks} semanas × 40 horas/semana = <strong>{durationWeeks * 40} horas totales</strong>
                                    </p>
                                    <p style={styles.hoursExplanation}>
                                        📊 La distribución por módulo se basa en el peso pedagógico de cada curso dentro del bootcamp.
                                    </p>
                                </div>
                                <p style={{fontSize: 12, color: '#888780', marginTop: 8, textAlign: 'center'}}>
                                    ℹ️ Bootcamp virtual generado localmente. Los cursos mantienen sus grafos
                                    individuales.
                                </p>
                            </div>
                        )}

                        {/* Botón de exportación */}
                        <div style={styles.buttonGroup}>
                            <button
                                style={styles.exportBtn}
                                onClick={handleExportGEXF}
                                disabled={selectedCourses.length === 0 || loading}
                            >
                                {loading ? '📊 Exportando...' : '📊 Exportar a Gephi (GEXF)'}
                            </button>
                        </div>
                        {/* Botón para guardar en Programas de Formación */}
                        {bootcampBuilt && createdBootcamp && (
                            <div style={styles.buttonGroup}>
                                <button
                                    style={styles.saveProgramBtn}
                                    onClick={handleSaveToPrograms}
                                    disabled={savingProgram}
                                >
                                    {savingProgram ? '💾 Guardando...' : '💾 Guardar en Programas de Formación'}
                                </button>
                            </div>
                        )}
                        {/* Botón para ver grafo global */}
                        {bootcampBuilt && globalBootcampGraph && (
                            <div style={styles.buttonGroup}>
                                <button
                                    style={styles.viewGraphBtn}
                                    onClick={() => {
                                        // Guardar en localStorage para que GraphView pueda acceder
                                        localStorage.setItem('bootcamp_graph', JSON.stringify(globalBootcampGraph))
                                        localStorage.setItem('bootcamp_title', bootcampTitle)
                                        navigate('/bootcamp-graph', {
                                            state: {
                                                bootcampGraph: globalBootcampGraph,
                                                title: bootcampTitle
                                            }
                                        })
                                    }}
                                >
                                    🌐 Ver Grafo Global del Bootcamp
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page: { maxWidth: 1400, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#F1EFE8' },
    header: { marginBottom: 32 },
    back: { background: 'none', border: '1px solid #D3D1C7', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, marginBottom: 16, color: '#1E3A5F' },
    clearBtn: { background: 'none', border: '1px solid #E24B4A', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, marginBottom: 16, marginLeft: 8, color: '#E24B4A' },
    title: { fontSize: 32, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    subtitle: { fontSize: 16, color: '#888780', marginTop: 8 },
    container: { display: 'flex', gap: 32, flexWrap: 'wrap' },
    formCard: { flex: 1, minWidth: 320, background: '#fff', borderRadius: 12, border: '1px solid #D3D1C7', padding: 24 },
    resultCard: { flex: 1, minWidth: 360, background: '#fff', borderRadius: 12, border: '1px solid #D3D1C7', padding: 24, maxHeight: '80vh', overflowY: 'auto' },
    formTitle: { fontSize: 20, fontWeight: 600, color: '#1E3A5F', marginBottom: 20 },
    field: { marginBottom: 16 },
    label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 },
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, fontFamily: 'inherit' },
    textarea: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' },
    select: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, background: '#fff', fontFamily: 'inherit' },
    checkboxGroup: { display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 250, overflowY: 'auto', padding: 10, border: '1px solid #F1EFE8', borderRadius: 8, background: '#F9F9F8' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: '#fff', border: '1px solid #E8E6E1' },
    courseBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#E8E6E1', color: '#1E3A5F' },
    graphBadge: { fontSize: 10, marginLeft: 'auto' },
    courseDomainBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#E1F5EE', color: '#1D9E75', marginLeft: 8 },
    primaryBtn: { width: '100%', padding: '12px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    secondaryBtn: { width: '100%', padding: '10px', background: '#6B6E6A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    warningBtn: { width: '100%', padding: '12px', background: '#F5A623', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 12 },
    successBtn: { width: '100%', padding: '12px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    exportBtn: { width: '100%', padding: '10px', background: '#9B59B6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    successMessage: { marginTop: 12, padding: '12px', background: '#E1F5EE', color: '#1D9E75', borderRadius: 8, fontSize: 13, textAlign: 'center' },
    warningMessage: { marginTop: 12, padding: '12px', background: '#FCEBEB', color: '#E24B4A', borderRadius: 8, fontSize: 13, textAlign: 'center' },
    buttonGroup: { display: 'flex', gap: 12, marginTop: 16, flexDirection: 'column' },
    recommendationSection: { marginBottom: 20, padding: 12, background: '#F9F9F8', borderRadius: 8 },
    sectionSubtitle: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', marginBottom: 10 },
    mutedText: { fontSize: 13, color: '#888780', textAlign: 'center', padding: 10 },
    successText: { fontSize: 13, color: '#1D9E75', textAlign: 'center', padding: 10 },
    modulesList: { maxHeight: 300, overflowY: 'auto' },
    modulePreview: { background: '#fff', border: '1px solid #E8E6E1', borderRadius: 8, padding: 12, marginBottom: 10 },
    moduleHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
    moduleOrder: { fontSize: 11, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', padding: '2px 8px', borderRadius: 12 },
    moduleWeight: { fontSize: 11, color: '#888780' },
    moduleName: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', marginBottom: 4 },
    moduleDesc: { fontSize: 12, color: '#6B6E6A', marginBottom: 8, lineHeight: 1.4 },
    moduleMeta: { display: 'flex', gap: 12, fontSize: 10, color: '#888780', paddingTop: 6, borderTop: '1px solid #F1EFE8', flexWrap: 'wrap' },
    progressContainer: { marginBottom: 16, padding: '16px', background: '#F9F9F8', borderRadius: 8, border: '1px solid #D3D1C7' },
    progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13, flexWrap: 'wrap', gap: 8 },
    progressCourseName: { color: '#1E3A5F', fontWeight: 500 },
    progressBarTrack: { height: 8, background: '#E8E6E1', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
    progressBarFill: { height: '100%', background: '#1D9E75', borderRadius: 4, transition: 'width 0.3s ease' },
    progressStatus: { fontSize: 12, color: '#6B6E6A' },
    checkingContainer: { marginBottom: 16, padding: '12px', background: '#E8F0FE', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 },
    spinner: { width: 20, height: 20, border: '2px solid #D3D1C7', borderTop: '2px solid #1E3A5F', borderRadius: '50%', animation: 'spin 1s linear infinite' },
    graphSummary: { marginBottom: 16, padding: '8px 12px', background: '#F1EFE8', borderRadius: 8 },
    graphSummaryTitle: { fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#1E3A5F' },
    graphSummaryList: { marginTop: 8, fontSize: 12, maxHeight: 200, overflowY: 'auto' },
    graphSummaryItem: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #E8E6E1', alignItems: 'center' },
    graphNodeCount: { fontSize: 10, color: '#888780' },
    generatedBadge: { fontSize: 10, color: '#1D9E75', marginLeft: 8 },
    viewGraphBtn: { width: '100%', padding: '12px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    saveProgramBtn: { width: '100%', padding: '12px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    hoursFooter: {
        marginTop: 16,
        padding: '12px 16px',
        background: '#F1EFE8',
        borderRadius: 8,
        borderLeft: '3px solid #1D9E75'
    },
    hoursExplanation: {
        fontSize: 12,
        color: '#2C2C2A',
        margin: '4px 0',
        lineHeight: 1.4
    },
}

// Añadir animación al documento
if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `
    document.head.appendChild(style)
}