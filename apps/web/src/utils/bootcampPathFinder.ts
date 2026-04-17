// src/utils/bootcampPathFinder.ts

export interface LearningNode {
    id: string
    label: string
    courseId: string
    courseTitle: string
    moduleOrder: number
    difficulty: number
    prerequisites: string[]
    dependents: string[]
    depth: number
    isRoot: boolean
    isMilestone: boolean
}

export interface LearningPath {
    order: string[]           // IDs de nodos en orden recomendado
    levels: Map<string, number>  // Nodos por profundidad (id -> depth)
    milestones: string[]      // Nodos importantes (hitos)
    startNodes: string[]       // Nodos para comenzar
    estimatedDuration: number  // Duración estimada en horas
}

/**
 * Encuentra todos los nodos raíz (sin dependencias entrantes)
 * Opcionalmente, filtrar por módulo
 */
export function findRootNodes(
    nodes: any[],
    edges: any[],
    maxModuleOrder?: number
): string[] {
    const targets = new Set(edges.map(e => e.target))
    let filteredNodes = nodes

    if (maxModuleOrder !== undefined) {
        // Solo considerar nodos de módulos hasta maxModuleOrder
        filteredNodes = nodes.filter(n => (n.moduleOrder || 1) <= maxModuleOrder)
    }

    return filteredNodes.filter(n => !targets.has(n.id)).map(n => n.id)
}

/**
 * Calcula la profundidad de cada nodo usando BFS desde los nodos raíz
 */
export function calculateNodeDepths(
    nodes: any[],
    edges: any[]
): Map<string, number> {
    const depths = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const edge of edges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, [])
        }
        adjacency.get(edge.source)!.push(edge.target)
    }

    const roots = findRootNodes(nodes, edges)
    const queue: { id: string; depth: number }[] = roots.map(id => ({ id, depth: 0 }))
    const visited = new Set<string>()

    for (const root of roots) {
        depths.set(root, 0)
        visited.add(root)
    }

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!
        const children = adjacency.get(id) || []

        for (const child of children) {
            const currentDepth = depths.get(child) || Infinity
            const newDepth = depth + 1
            if (newDepth < currentDepth) {
                depths.set(child, newDepth)
                if (!visited.has(child)) {
                    visited.add(child)
                    queue.push({ id: child, depth: newDepth })
                }
            }
        }
    }

    for (const node of nodes) {
        if (!depths.has(node.id)) {
            depths.set(node.id, 0)
        }
    }

    return depths
}

/**
 * Identifica nodos hito (milestones)
 */
export function findMilestones(
    nodes: any[],
    edges: any[],
    depths: Map<string, number>
): string[] {
    const dependentsCount = new Map<string, number>()

    for (const edge of edges) {
        const count = dependentsCount.get(edge.source) || 0
        dependentsCount.set(edge.source, count + 1)
    }

    let maxDependents = 0
    for (const count of dependentsCount.values()) {
        maxDependents = Math.max(maxDependents, count)
    }

    const milestones: string[] = []

    for (const node of nodes) {
        const dependents = dependentsCount.get(node.id) || 0
        const depth = depths.get(node.id) || 0
        const difficulty = node.difficulty || 3

        const isHighDependents = maxDependents > 0 && dependents / maxDependents > 0.7
        const isHighDifficulty = difficulty >= 4
        const isDeepAndHasDependents = depth >= 3 && dependents > 0

        if (isHighDependents || isHighDifficulty || isDeepAndHasDependents) {
            milestones.push(node.id)
        }
    }

    return milestones
}

/**
 * Genera el orden óptimo de aprendizaje (topológico)
 * Opcionalmente, limitar a primeros N módulos
 */
export function generateLearningOrder(
    nodes: any[],
    edges: any[],
    maxModuleOrder?: number
): string[] {
    const order: string[] = []
    const visited = new Set<string>()
    const processing = new Set<string>()
    const adjacency = new Map<string, string[]>()

    // Filtrar nodos y edges por módulo si es necesario
    let filteredNodes = nodes
    let filteredEdges = edges

    if (maxModuleOrder !== undefined) {
        const validNodeIds = new Set(
            nodes.filter(n => (n.moduleOrder || 1) <= maxModuleOrder).map(n => n.id)
        )
        filteredNodes = nodes.filter(n => validNodeIds.has(n.id))
        filteredEdges = edges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target))
    }

    for (const edge of filteredEdges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, [])
        }
        adjacency.get(edge.source)!.push(edge.target)
    }

    function dfs(nodeId: string): boolean {
        if (processing.has(nodeId)) return false
        if (visited.has(nodeId)) return true

        processing.add(nodeId)
        const children = adjacency.get(nodeId) || []

        for (const child of children) {
            if (!dfs(child)) return false
        }

        processing.delete(nodeId)
        visited.add(nodeId)
        order.push(nodeId)
        return true
    }

    for (const node of filteredNodes) {
        if (!visited.has(node.id)) {
            dfs(node.id)
        }
    }

    return order.reverse()
}

/**
 * Estima la duración total del bootcamp
 */
export function estimateDuration(
    nodes: any[],
    depths: Map<string, number>
): number {
    let totalHours = 0

    for (const node of nodes) {
        const difficulty = node.difficulty || 3
        const depth = depths.get(node.id) || 0

        let hours = 2 + (difficulty - 1) * 1.5
        if (depth > 2) {
            hours += (depth - 2) * 0.5
        }
        totalHours += hours
    }

    return Math.round(totalHours)
}

/**
 * Genera el árbol de aprendizaje completo
 * @param nodes - Todos los nodos del bootcamp
 * @param edges - Todos los edges del bootcamp
 * @param maxStartModule - Módulo máximo para considerar puntos de inicio (ej: 2)
 * @param maxOrderModule - Módulo máximo para considerar orden sugerido (ej: 2)
 */
export function generateLearningPath(
    nodes: any[],
    edges: any[],
    maxStartModule: number = 2,
    maxOrderModule: number = 2
): LearningPath {
    const depths = calculateNodeDepths(nodes, edges)

    // Puntos de inicio: solo de los primeros N módulos (ej: Python y SQL)
    const startNodes = findRootNodes(nodes, edges, maxStartModule)

    // Hitos: de todos los nodos
    const milestones = findMilestones(nodes, edges, depths)

    // Orden sugerido: solo de los primeros N módulos (ej: Python y SQL)
    const order = generateLearningOrder(nodes, edges, maxOrderModule)

    const estimatedDuration = estimateDuration(nodes, depths)

    return {
        order,
        levels: depths,
        milestones,
        startNodes,
        estimatedDuration
    }
}