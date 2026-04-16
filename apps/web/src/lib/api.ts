import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://mygateway.up.railway.app'

const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
})

// ── Courses ───────────────────────────────────────────────────────────────────
export const getCourses = () =>
    api.get('/courses').then((r) => r.data)

export const getCourse = (id: string) =>
    api.get(`/courses/${id}`).then((r) => r.data)

// Crear curso con roadmap completo (incluye generación de grafo)
export const createCourseWithRoadmap = async (courseData: {
    title: string
    description: string
    domain: string
    difficulty_level: string
    roadmap: any
}): Promise<{ id: string; success: boolean; message: string; nodeCount?: number; edgeCount?: number }> => {
    try {
        // 1. Crear el curso
        const courseResponse = await api.post('/courses', {
            title: courseData.title,
            description: courseData.description,
            domain: courseData.domain,
            difficulty_level: courseData.difficulty_level,
            roadmap: courseData.roadmap
        })

        const courseId = courseResponse.data[0]?.id || courseResponse.data.id

        if (!courseId) {
            throw new Error('No se pudo obtener el ID del curso')
        }

        // 2. Construir el grafo a partir del roadmap
        const graphResult = await buildGraphFromRoadmap(courseId, courseData.roadmap)

        return {
            id: courseId,
            success: graphResult.success,
            message: graphResult.message,
            nodeCount: graphResult.nodeCount,
            edgeCount: graphResult.edgeCount
        }
    } catch (error: any) {
        console.error('Error creating course with roadmap:', error)
        return {
            id: '',
            success: false,
            message: error.message || 'Error desconocido'
        }
    }
}

// Construir grafo completo desde un roadmap (VERSIÓN CORREGIDA - GRAFOS INTERCONECTADOS)
export const buildGraphFromRoadmap = async (courseId: string, roadmap: any): Promise<{ success: boolean; message: string; nodeCount: number; edgeCount: number }> => {
    try {
        // Validar roadmap
        if (!roadmap || !roadmap.phases || !Array.isArray(roadmap.phases)) {
            throw new Error('Roadmap inválido: no contiene phases')
        }

        // Calcular posiciones de nodos
        const positions = calculatePositionsFromRoadmap(roadmap)
        const labelToId = new Map<string, string>()

        // Almacenar todos los nodos con su metadata
        const allNodes: { label: string; phase: number; topic: string; description: string; difficulty: number }[] = []

        let nodeCount = 0
        let edgeCount = 0

        // PASO 1: Crear todos los nodos y recolectar metadata
        for (const phase of roadmap.phases) {
            if (!phase.topics) continue

            for (const topic of phase.topics) {
                if (!topic.subtopics) continue

                for (const subtopic of topic.subtopics) {
                    const pos = positions[subtopic.label] || {
                        x: 100 + Math.random() * 700,
                        y: 100 + (phase.phase_number - 1) * 150 + Math.random() * 100
                    }

                    allNodes.push({
                        label: subtopic.label,
                        phase: phase.phase_number,
                        topic: topic.topic_name,
                        description: subtopic.description || '',
                        difficulty: subtopic.difficulty || 3
                    })

                    try {
                        const nodeResponse = await api.post(`/graph/${courseId}/nodes`, {
                            label: subtopic.label,
                            description: subtopic.description || `Concepto: ${subtopic.label}`,
                            difficulty: subtopic.difficulty || 3,
                            phase: phase.phase_number,
                            topic: topic.topic_name,
                            bloom_levels: phase.bloom_levels || [],
                            expected_outcomes: phase.expected_outcomes || [],
                            skills: phase.skills || [],
                            position_x: pos.x,
                            position_y: pos.y,
                            content: subtopic.content || '',
                            examples: subtopic.examples || []
                        })

                        if (nodeResponse.status === 200 || nodeResponse.status === 201) {
                            const nodeData = nodeResponse.data
                            const nodeId = nodeData.id || nodeData[0]?.id
                            if (nodeId) {
                                labelToId.set(subtopic.label, nodeId)
                                nodeCount++
                            }
                        }
                    } catch (nodeError) {
                        console.error(`Error creating node for ${subtopic.label}:`, nodeError)
                    }

                    await new Promise(resolve => setTimeout(resolve, 50))
                }
            }
        }

        // PASO 2: Crear edges basados en prerequisites (si existen)
        for (const phase of roadmap.phases) {
            if (!phase.topics) continue

            for (const topic of phase.topics) {
                if (!topic.subtopics) continue

                const subtopicsInTopic = topic.subtopics

                for (let i = 0; i < subtopicsInTopic.length; i++) {
                    const subtopic = subtopicsInTopic[i]
                    const targetId = labelToId.get(subtopic.label)
                    if (!targetId) continue

                    // 2.1 Usar prerequisites definidos en el roadmap
                    const prerequisites = subtopic.prerequisites || []
                    for (const prereqLabel of prerequisites) {
                        const sourceId = labelToId.get(prereqLabel)
                        if (sourceId && sourceId !== targetId) {
                            try {
                                await api.post(`/graph/${courseId}/edges`, {
                                    source_id: sourceId,
                                    target_id: targetId,
                                    prerequisite_strength: 0.9,
                                })
                                edgeCount++
                            } catch (edgeError) {
                                console.error(`Error creating edge from ${prereqLabel} to ${subtopic.label}:`, edgeError)
                            }
                            await new Promise(resolve => setTimeout(resolve, 30))
                        }
                    }

                    // 2.2 Si no hay prerequisites, crear conexiones inteligentes
                    if (prerequisites.length === 0) {
                        // Conectar con nodo anterior en el mismo tema (conexión secuencial)
                        if (i > 0) {
                            const prevSubtopic = subtopicsInTopic[i - 1]
                            const sourceId = labelToId.get(prevSubtopic.label)
                            if (sourceId && sourceId !== targetId) {
                                try {
                                    await api.post(`/graph/${courseId}/edges`, {
                                        source_id: sourceId,
                                        target_id: targetId,
                                        prerequisite_strength: 0.7,
                                    })
                                    edgeCount++
                                } catch (edgeError) {
                                    console.error(`Error creating sequential edge:`, edgeError)
                                }
                                await new Promise(resolve => setTimeout(resolve, 30))
                            }
                        }

                        // Conectar con nodos de temas relacionados (basado en descripción)
                        const relatedNodes = allNodes.filter(n =>
                            n.phase === phase.phase_number &&
                            n.label !== subtopic.label &&
                            (n.description.toLowerCase().includes('básico') ||
                                n.description.toLowerCase().includes('fundamento') ||
                                n.description.toLowerCase().includes('introducción'))
                        )

                        for (let r = 0; r < Math.min(2, relatedNodes.length); r++) {
                            const relatedNode = relatedNodes[r]
                            const sourceId = labelToId.get(relatedNode.label)
                            if (sourceId && sourceId !== targetId) {
                                try {
                                    await api.post(`/graph/${courseId}/edges`, {
                                        source_id: sourceId,
                                        target_id: targetId,
                                        prerequisite_strength: 0.5,
                                    })
                                    edgeCount++
                                } catch (edgeError) {
                                    // Ignorar errores de duplicados
                                }
                                await new Promise(resolve => setTimeout(resolve, 30))
                            }
                        }
                    }
                }
            }
        }

        // PASO 3: Crear conexiones entre fases (progresión de aprendizaje)
        const phasesList = roadmap.phases
        for (let p = 0; p < phasesList.length - 1; p++) {
            const currentPhase = phasesList[p]
            const nextPhase = phasesList[p + 1]

            if (!currentPhase.topics || !nextPhase.topics) continue

            // Obtener últimos 3 nodos de la fase actual
            const currentPhaseNodes: string[] = []
            for (const topic of currentPhase.topics) {
                if (topic.subtopics) {
                    for (const subtopic of topic.subtopics) {
                        const nodeId = labelToId.get(subtopic.label)
                        if (nodeId) currentPhaseNodes.push(nodeId)
                    }
                }
            }

            // Obtener primeros 3 nodos de la siguiente fase
            const nextPhaseNodes: string[] = []
            for (const topic of nextPhase.topics) {
                if (topic.subtopics) {
                    for (const subtopic of topic.subtopics) {
                        const nodeId = labelToId.get(subtopic.label)
                        if (nodeId) nextPhaseNodes.push(nodeId)
                    }
                }
            }

            // Conectar nodos de fase actual con nodos de siguiente fase
            const sourcesToConnect = currentPhaseNodes.slice(-3)
            const targetsToConnect = nextPhaseNodes.slice(0, 3)

            for (const source of sourcesToConnect) {
                for (const target of targetsToConnect) {
                    if (source !== target) {
                        try {
                            await api.post(`/graph/${courseId}/edges`, {
                                source_id: source,
                                target_id: target,
                                prerequisite_strength: 0.8,
                            })
                            edgeCount++
                        } catch (edgeError) {
                            // Ignorar duplicados
                        }
                        await new Promise(resolve => setTimeout(resolve, 30))
                    }
                }
            }
        }

        return {
            success: nodeCount > 0,
            message: `Grafo construido: ${nodeCount} nodos, ${edgeCount} edges (interconectado)`,
            nodeCount,
            edgeCount
        }
    } catch (error: any) {
        console.error('Error building graph from roadmap:', error)
        return {
            success: false,
            message: error.message || 'Error construyendo grafo',
            nodeCount: 0,
            edgeCount: 0
        }
    }
}

// Función para calcular posiciones de nodos (layout automático)
export const calculatePositionsFromRoadmap = (roadmap: any): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {}

    if (!roadmap || !roadmap.phases) return positions

    // Recolectar todos los subtopics con sus prerrequisitos
    const allSubtopics: { label: string; prerequisites: string[]; phase: number }[] = []
    for (const phase of roadmap.phases) {
        if (!phase.topics) continue
        for (const topic of phase.topics) {
            if (!topic.subtopics) continue
            for (const subtopic of topic.subtopics) {
                allSubtopics.push({
                    label: subtopic.label,
                    prerequisites: subtopic.prerequisites || [],
                    phase: phase.phase_number
                })
            }
        }
    }

    // Calcular niveles usando BFS desde nodos sin prerrequisitos
    const levels: Record<string, number> = {}
    const processed = new Set<string>()
    let currentLevel = 0

    // Nodos iniciales (sin prerrequisitos)
    let currentNodes = allSubtopics.filter(s => s.prerequisites.length === 0).map(s => s.label)
    currentNodes.forEach(label => { levels[label] = 0; processed.add(label) })

    // BFS para asignar niveles
    while (currentNodes.length > 0) {
        const nextNodes: string[] = []
        for (const nodeLabel of currentNodes) {
            for (const subtopic of allSubtopics) {
                if (!processed.has(subtopic.label) && subtopic.prerequisites.includes(nodeLabel)) {
                    if (!nextNodes.includes(subtopic.label)) {
                        nextNodes.push(subtopic.label)
                    }
                }
            }
        }
        currentLevel++
        nextNodes.forEach(label => { levels[label] = currentLevel; processed.add(label) })
        currentNodes = nextNodes
    }

    // Nodos sin nivel asignado (ciclos o aislados)
    for (const subtopic of allSubtopics) {
        if (!processed.has(subtopic.label)) {
            levels[subtopic.label] = currentLevel + 1
            processed.add(subtopic.label)
        }
    }

    // Distribuir nodos por nivel
    const nodesPerLevel: Record<number, string[]> = {}
    Object.entries(levels).forEach(([label, level]) => {
        if (!nodesPerLevel[level]) nodesPerLevel[level] = []
        nodesPerLevel[level].push(label)
    })

    // Posicionar nodos
    Object.entries(nodesPerLevel).forEach(([levelStr, labels]) => {
        const levelNum = parseInt(levelStr)
        const y = 80 + levelNum * 130
        const total = labels.length
        const startX = 400 - (total - 1) * 90

        labels.forEach((label, idx) => {
            positions[label] = {
                x: startX + idx * 180,
                y: y
            }
        })
    })

    return positions
}

// Verificar si un curso tiene grafo completo
export const checkCourseGraph = async (courseId: string): Promise<{ hasGraph: boolean; nodeCount: number; edgeCount: number }> => {
    try {
        const response = await api.get(`/graph/${courseId}`)
        const data = response.data
        const nodes = data.nodes || []
        const edges = data.edges || []
        return {
            hasGraph: nodes.length > 0,
            nodeCount: nodes.length,
            edgeCount: edges.length
        }
    } catch (error) {
        console.error(`Error checking graph for course ${courseId}:`, error)
        return {
            hasGraph: false,
            nodeCount: 0,
            edgeCount: 0
        }
    }
}

// Verificar múltiples cursos en paralelo
export const checkMultipleCoursesGraphs = async (courseIds: string[]): Promise<Map<string, { hasGraph: boolean; nodeCount: number; edgeCount: number }>> => {
    const results = new Map()

    // Verificar en paralelo con límite de concurrencia
    const batchSize = 5
    for (let i = 0; i < courseIds.length; i += batchSize) {
        const batch = courseIds.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(async (courseId) => {
            const result = await checkCourseGraph(courseId)
            return { courseId, result }
        }))

        for (const { courseId, result } of batchResults) {
            results.set(courseId, result)
        }
    }

    return results
}

// Obtener grafo completo para visualización
export const getFullGraph = async (courseId: string) => {
    try {
        const response = await api.get(`/graph/${courseId}`)
        return response.data
    } catch (error) {
        console.error('Error fetching full graph:', error)
        return { nodes: [], edges: [] }
    }
}

// Exportar bootcamp a GEXF
export const exportBootcampToGEXF = async (bootcampId: string, bootcampTitle: string) => {
    const token = localStorage.getItem('google_token')
    const response = await fetch(`${API_URL}/bootcamp/export/gexf`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            bootcamp_id: bootcampId,
            include_weights: true
        })
    })

    if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bootcamp_${bootcampTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return true
}

// Exportar un curso individual a GEXF (usando API o fallback local)
export const exportCourseToGEXF = async (courseId: string, courseTitle: string): Promise<boolean> => {
    try {
        const token = localStorage.getItem('google_token')
        const response = await fetch(`${API_URL}/graph/${courseId}/export/gexf`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })

        if (response.ok) {
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            return true
        } else {
            // Fallback: generar localmente
            const graphData = await getFullGraph(courseId)
            const gexfContent = generateSimpleGexf(graphData, courseTitle)
            const blob = new Blob([gexfContent], { type: 'application/xml' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            return true
        }
    } catch (error) {
        console.error('Error exporting course to GEXF:', error)
        return false
    }
}

// Función auxiliar para generar GEXF simple (fallback)
function generateSimpleGexf(graphData: any, title: string): string {
    const timestamp = new Date().toISOString()
    const nodes = graphData.nodes || []
    const edges = graphData.edges || []

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" 
      xmlns:viz="http://www.gexf.net/1.2draft/viz" 
      version="1.2">
    <meta lastmodifieddate="${timestamp}">
        <creator>AI Learning Graph Platform</creator>
        <description>Grafo de aprendizaje: ${title}</description>
    </meta>
    <graph mode="static" defaultedgetype="directed">
        <nodes count="${nodes.length}">`

    for (const node of nodes) {
        const nodeData = node.data || node
        const nodeId = nodeData.id
        const label = nodeData.label || nodeId
        const pos = node.position || { x: Math.random() * 800, y: Math.random() * 600 }

        xml += `
            <node id="${nodeId}" label="${label}">
                <viz:position x="${pos.x || 0}" y="${pos.y || 0}" z="0"/>
                <viz:size value="15"/>
                <viz:color r="30" g="58" b="95"/>
            </node>`
    }

    xml += `
        </nodes>
        <edges count="${edges.length}">`

    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]
        const edgeData = edge.data || edge
        xml += `
            <edge id="e${i}" source="${edgeData.source}" target="${edgeData.target}" weight="${edgeData.strength || 0.5}"/>`
    }

    xml += `
        </edges>
    </graph>
</gexf>`

    return xml
}

// ── Graph (alias para getFullGraph, mantener compatibilidad) ─────────────────
export const getGraph = getFullGraph

// ── Mastery ───────────────────────────────────────────────────────────────────
export const getStudentMastery = (userId: string, courseId: string) =>
    api.get(`/mastery/student/${userId}/course/${courseId}`).then((r) => r.data)

export const getGaps = (userId: string, courseId: string) =>
    api.get(`/mastery/gaps/student/${userId}/course/${courseId}`).then((r) => r.data)

export const recordEvent = (payload: {
    user_id: string
    node_id: string
    correct: boolean
    course_id: string
}) => api.post('/mastery/event', payload).then((r) => r.data)

// ── AI ────────────────────────────────────────────────────────────────────────
export const getSimilarNodes = (courseId: string, nodeId: string, k = 5) =>
    api.get(`/ai/embeddings/similar/${courseId}/${nodeId}?k=${k}`).then((r) => r.data)

export const getRecommendations = (userId: string, courseId: string, k = 5) =>
    api.get(`/ai/recommend/${userId}/${courseId}?k=${k}`).then((r) => r.data)

export const generateCurriculum = (payload: {
    title: string
    description: string
    domain: string
    num_concepts: number
}) => api.post('/ai/curriculum/generate', payload).then((r) => r.data)

export const saveCurriculum = (courseId: string, payload: {
    title: string
    description: string
    domain: string
    num_concepts: number
}) => api.post(`/ai/curriculum/save/${courseId}`, payload).then((r) => r.data)

// ── Node Position ────────────────────────────────────────────────────────────
export const updateNodePosition = async (courseId: string, nodeId: string, position: { x: number; y: number }) => {
    const response = await fetch(`${API_URL}/graph/${courseId}/nodes/${nodeId}/position`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            position_x: position.x,
            position_y: position.y,
        }),
    })

    if (!response.ok) {
        throw new Error('Error updating node position')
    }

    return response.json()
}

export const getNodeContent = async (courseId: string, nodeId: string, nodeLabel: string): Promise<any> => {
    const response = await fetch(`${API_URL}/ai/node-content/${courseId}/${nodeId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ node_label: nodeLabel })
    })

    if (!response.ok) {
        throw new Error('Error fetching node content')
    }

    return response.json()
}

export const generateRoadmap = async (payload: {
    title: string
    description: string
    domain: string
    difficulty_level: string
}) => {
    const response = await fetch(`${API_URL}/ai/roadmap/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
    }

    const data = await response.json()
    console.log('📦 Datos recibidos del servidor:', data)
    return data
}

// ── Bootcamp ──────────────────────────────────────────────────────────────────
export const recommendBootcamp = async (payload: {
    title: string
    description: string
    target_duration_weeks: number
    required_course_ids: string[]
}) => {
    const token = localStorage.getItem('google_token')
    const response = await fetch(`${API_URL}/bootcamp/recommend`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    })

    if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
    }

    return response.json()
}

export const composeBootcamp = async (bootcampId: string, courseIds: string[]) => {
    const token = localStorage.getItem('google_token')
    const response = await fetch(`${API_URL}/bootcamp/compose`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            bootcamp_id: bootcampId,
            course_ids: courseIds,
            student_id: null
        })
    })

    if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
    }

    return response.json()
}

// =============================================================================
// ── Programs (Bootcamps, Diplomados, Especialidades, Talleres) ───────────────
// =============================================================================

export interface Program {
    id: string
    title: string
    description: string
    type: 'bootcamp' | 'diploma' | 'specialty' | 'workshop'
    duration_weeks: number
    course_ids: string[]
    modules?: any[]
    created_at: string
    updated_at: string
}

// Clave para localStorage
const STORAGE_KEY_PROGRAMS = 'ai_learning_programs'

// Función para generar ID único
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Obtener programas de localStorage (fallback)
function getProgramsFromLocalStorage(): Program[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_PROGRAMS)
        return stored ? JSON.parse(stored) : []
    } catch {
        return []
    }
}

// Guardar programas en localStorage
function saveProgramsToLocalStorage(programs: Program[]): void {
    localStorage.setItem(STORAGE_KEY_PROGRAMS, JSON.stringify(programs))
}

export const getPrograms = async (type?: string): Promise<Program[]> => {
    try {
        const url = type ? `/programs?type=${type}` : '/programs'
        const response = await api.get(url)
        return response.data.programs || response.data || []
    } catch (error) {
        console.warn('API getPrograms falló, usando localStorage:', error)
        let programs = getProgramsFromLocalStorage()
        if (type) {
            programs = programs.filter(p => p.type === type)
        }
        return programs
    }
}

export const getProgram = async (id: string): Promise<Program | null> => {
    try {
        const response = await api.get(`/programs/${id}`)
        return response.data
    } catch (error) {
        console.warn('API getProgram falló, usando localStorage:', error)
        const programs = getProgramsFromLocalStorage()
        return programs.find(p => p.id === id) || null
    }
}

export const createProgram = async (programData: {
    title: string
    description: string
    type: 'bootcamp' | 'diploma' | 'specialty' | 'workshop'
    duration_weeks: number
    course_ids: string[]
    modules?: any[]
}): Promise<Program | null> => {
    try {
        const token = localStorage.getItem('google_token')
        const response = await fetch(`${API_URL}/programs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(programData)
        })

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`)
        }

        return await response.json()
    } catch (error) {
        console.warn('API createProgram falló, usando localStorage:', error)

        const programs = getProgramsFromLocalStorage()
        const newProgram: Program = {
            id: generateId(),
            title: programData.title,
            description: programData.description,
            type: programData.type,
            duration_weeks: programData.duration_weeks,
            course_ids: programData.course_ids,
            modules: programData.modules || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }

        programs.push(newProgram)
        saveProgramsToLocalStorage(programs)

        console.log(`✅ Programa guardado en localStorage: ${newProgram.title} (ID: ${newProgram.id})`)

        return newProgram
    }
}

export const updateProgram = async (id: string, programData: Partial<Program>): Promise<Program | null> => {
    try {
        const token = localStorage.getItem('google_token')
        const response = await fetch(`${API_URL}/programs/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(programData)
        })

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`)
        }

        return await response.json()
    } catch (error) {
        console.warn('API updateProgram falló, usando localStorage:', error)

        const programs = getProgramsFromLocalStorage()
        const index = programs.findIndex(p => p.id === id)

        if (index !== -1) {
            programs[index] = {
                ...programs[index],
                ...programData,
                updated_at: new Date().toISOString()
            }
            saveProgramsToLocalStorage(programs)
            return programs[index]
        }

        return null
    }
}

export const deleteProgram = async (id: string): Promise<boolean> => {
    try {
        const token = localStorage.getItem('google_token')
        const response = await fetch(`${API_URL}/programs/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })

        return response.ok
    } catch (error) {
        console.warn('API deleteProgram falló, usando localStorage:', error)

        const programs = getProgramsFromLocalStorage()
        const filtered = programs.filter(p => p.id !== id)

        if (filtered.length !== programs.length) {
            saveProgramsToLocalStorage(filtered)
            return true
        }

        return false
    }
}

// Función corregida: eliminado bootcampId que no se usaba
export const saveBootcampAsProgram = async (
    bootcampTitle: string,
    bootcampDescription: string,
    durationWeeks: number,
    courseIds: string[],
    modules: any[]
): Promise<Program | null> => {
    return createProgram({
        title: bootcampTitle,
        description: bootcampDescription,
        type: 'bootcamp',
        duration_weeks: durationWeeks,
        course_ids: courseIds,
        modules: modules
    })
}