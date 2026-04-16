// src/utils/bootcampGraphBuilder.ts

export interface GlobalNode {
    id: string
    originalId: string
    courseId: string
    courseTitle: string
    label: string
    description: string
    difficulty: number
    phase: number
    topic: string
    position_x: number
    position_y: number
    moduleOrder: number
    moduleWeight: number
}

export interface GlobalEdge {
    id: string
    source: string
    target: string
    type: 'internal' | 'intermodule' | 'cross'
    strength: number
    prerequisite_strength: number
    sourceCourseId: string
    targetCourseId: string
}

export interface BootcampGraph {
    nodes: GlobalNode[]
    edges: GlobalEdge[]
    summary: {
        totalNodes: number
        totalEdges: number
        totalCourses: number
        courseStats: Map<string, { nodeCount: number; edgeCount: number }>
    }
}

/**
 * Construye el grafo global del bootcamp combinando todos los cursos
 * @param courseIds - Lista de IDs de cursos en el orden correcto
 * @param moduleWeights - Mapa de pesos por curso
 */
export async function buildBootcampGlobalGraph(
    courseIds: string[],
    moduleWeights: Map<string, number>
): Promise<BootcampGraph> {
    const allNodes: GlobalNode[] = []
    const allEdges: GlobalEdge[] = []
    const courseStats = new Map<string, { nodeCount: number; edgeCount: number }>()

    let edgeCounter = 0
    let lastModuleNodes: string[] = []  // Nodos del módulo anterior (para conexiones)

    for (let moduleIdx = 0; moduleIdx < courseIds.length; moduleIdx++) {
        const courseId = courseIds[moduleIdx]
        const moduleOrder = moduleIdx + 1
        const moduleWeight = moduleWeights.get(courseId) || (1 / courseIds.length)

        // Obtener el grafo del curso
        const response = await fetch(`https://mygateway.up.railway.app/graph/${courseId}`)
        if (!response.ok) {
            console.error(`Error fetching graph for course ${courseId}`)
            continue
        }

        const graphData = await response.json()
        const nodes = graphData.nodes || []
        const edges = graphData.edges || []

        // Obtener título del curso
        let courseTitle = courseId
        const courseResponse = await fetch(`https://mygateway.up.railway.app/courses/${courseId}`)
        if (courseResponse.ok) {
            const courseData = await courseResponse.json()
            courseTitle = courseData.title || courseId
        }

        // Prefijo único para este curso
        const prefix = `c${moduleOrder}_`

        // Mapeo de IDs originales a nuevos IDs globales
        const idMapping = new Map<string, string>()

        // Añadir nodos del curso
        const currentModuleNodes: string[] = []

        for (const node of nodes) {
            const nodeData = node.data || node
            const originalId = nodeData.id
            const globalId = `${prefix}${originalId}`
            idMapping.set(originalId, globalId)
            currentModuleNodes.push(globalId)

            // Posición ajustada para evitar superposición entre módulos
            const posX = (node.position?.x || Math.random() * 800) + (moduleOrder * 200)
            const posY = node.position?.y || Math.random() * 600

            allNodes.push({
                id: globalId,
                originalId: originalId,
                courseId: courseId,
                courseTitle: courseTitle,
                label: nodeData.label || originalId,
                description: nodeData.description || '',
                difficulty: nodeData.difficulty || 3,
                phase: nodeData.phase || moduleOrder,
                topic: nodeData.topic || 'General',
                position_x: posX,
                position_y: posY,
                moduleOrder: moduleOrder,
                moduleWeight: moduleWeight
            })
        }

        courseStats.set(courseId, { nodeCount: nodes.length, edgeCount: edges.length })

        // Añadir edges internos del curso
        for (const edge of edges) {
            const edgeData = edge.data || edge
            const sourceId = idMapping.get(edgeData.source)
            const targetId = idMapping.get(edgeData.target)

            if (sourceId && targetId) {
                allEdges.push({
                    id: `e${edgeCounter++}`,
                    source: sourceId,
                    target: targetId,
                    type: 'internal',
                    strength: edgeData.strength || edgeData.prerequisite_strength || 0.5,
                    prerequisite_strength: edgeData.prerequisite_strength || 0.5,
                    sourceCourseId: courseId,
                    targetCourseId: courseId
                })
            }
        }

        // Añadir edges entre módulos (conexión con módulo anterior)
        if (lastModuleNodes.length > 0 && currentModuleNodes.length > 0) {
            // Conectar últimos 3 nodos del módulo anterior con primeros 3 del módulo actual
            const sourcesToConnect = lastModuleNodes.slice(-3)
            const targetsToConnect = currentModuleNodes.slice(0, 3)

            for (const source of sourcesToConnect) {
                for (const target of targetsToConnect) {
                    allEdges.push({
                        id: `e${edgeCounter++}`,
                        source: source,
                        target: target,
                        type: 'intermodule',
                        strength: 0.7,
                        prerequisite_strength: 0.7,
                        sourceCourseId: courseIds[moduleIdx - 1],
                        targetCourseId: courseId
                    })
                }
            }

            // También conectar el primer nodo de cada módulo
            if (lastModuleNodes.length > 0 && currentModuleNodes.length > 0) {
                allEdges.push({
                    id: `e${edgeCounter++}`,
                    source: lastModuleNodes[0],
                    target: currentModuleNodes[0],
                    type: 'intermodule',
                    strength: 0.85,
                    prerequisite_strength: 0.85,
                    sourceCourseId: courseIds[moduleIdx - 1],
                    targetCourseId: courseId
                })
            }
        }

        lastModuleNodes = currentModuleNodes
    }

    return {
        nodes: allNodes,
        edges: allEdges,
        summary: {
            totalNodes: allNodes.length,
            totalEdges: allEdges.length,
            totalCourses: courseIds.length,
            courseStats: courseStats
        }
    }
}

/**
 * Genera estadísticas de dependencias entre módulos
 */
export function calculateModuleDependencies(edges: GlobalEdge[]): Map<string, Map<string, number>> {
    const dependencies = new Map<string, Map<string, number>>()

    for (const edge of edges) {
        if (edge.type === 'intermodule') {
            if (!dependencies.has(edge.sourceCourseId)) {
                dependencies.set(edge.sourceCourseId, new Map())
            }
            const sourceMap = dependencies.get(edge.sourceCourseId)!
            const current = sourceMap.get(edge.targetCourseId) || 0
            sourceMap.set(edge.targetCourseId, current + edge.strength)
        }
    }

    return dependencies
}