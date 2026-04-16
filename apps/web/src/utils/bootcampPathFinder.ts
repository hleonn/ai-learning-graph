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
 */
export function findRootNodes(
    nodes: any[],
    edges: any[]
): string[] {
    const targets = new Set(edges.map(e => e.target))
    return nodes.filter(n => !targets.has(n.id)).map(n => n.id)
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

    // Construir grafo de dependencias (source -> targets)
    for (const edge of edges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, [])
        }
        adjacency.get(edge.source)!.push(edge.target)
    }

    // Encontrar nodos raíz
    const roots = findRootNodes(nodes, edges)

    // BFS desde raíces
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

    // Asignar profundidad 0 a nodos no alcanzados
    for (const node of nodes) {
        if (!depths.has(node.id)) {
            depths.set(node.id, 0)
        }
    }

    return depths
}

/**
 * Identifica nodos hito (milestones) - nodos con muchas dependencias o alta dificultad
 */
export function findMilestones(
    nodes: any[],
    edges: any[],
    depths: Map<string, number>
): string[] {
    const dependentsCount = new Map<string, number>()

    // Contar cuántos nodos dependen de cada nodo
    for (const edge of edges) {
        const count = dependentsCount.get(edge.source) || 0
        dependentsCount.set(edge.source, count + 1)
    }

    // Encontrar el máximo de dependientes para normalizar
    let maxDependents = 0
    for (const count of dependentsCount.values()) {
        maxDependents = Math.max(maxDependents, count)
    }

    const milestones: string[] = []

    for (const node of nodes) {
        const dependents = dependentsCount.get(node.id) || 0
        const depth = depths.get(node.id) || 0
        const difficulty = node.difficulty || 3

        // Un nodo es hito si:
        // 1. Tiene muchas dependencias (top 20%)
        // 2. O tiene dificultad alta (>= 4)
        // 3. O está en una profundidad significativa y tiene al menos una dependencia
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
 */
export function generateLearningOrder(
    nodes: any[],
    edges: any[]
): string[] {
    const order: string[] = []
    const visited = new Set<string>()
    const processing = new Set<string>()

    // Construir grafo de dependencias
    const adjacency = new Map<string, string[]>()

    for (const edge of edges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, [])
        }
        adjacency.get(edge.source)!.push(edge.target)
    }

    // DFS para orden topológico
    function dfs(nodeId: string): boolean {
        if (processing.has(nodeId)) {
            return false // Ciclo detectado
        }
        if (visited.has(nodeId)) {
            return true
        }

        processing.add(nodeId)
        const children = adjacency.get(nodeId) || []

        for (const child of children) {
            if (!dfs(child)) {
                return false
            }
        }

        processing.delete(nodeId)
        visited.add(nodeId)
        order.push(nodeId)
        return true
    }

    // Procesar todos los nodos
    for (const node of nodes) {
        if (!visited.has(node.id)) {
            dfs(node.id)
        }
    }

    return order.reverse() // Invertir para tener orden correcto
}

/**
 * Estima la duración total del bootcamp basada en nodos y dificultad
 */
export function estimateDuration(
    nodes: any[],
    depths: Map<string, number>
): number {
    let totalHours = 0

    for (const node of nodes) {
        const difficulty = node.difficulty || 3
        const depth = depths.get(node.id) || 0

        // Fórmula: horas base = 2, multiplicador por dificultad, bonificación por profundidad
        let hours = 2 + (difficulty - 1) * 1.5

        // Nodos más profundos toman más tiempo
        if (depth > 2) {
            hours += (depth - 2) * 0.5
        }

        totalHours += hours
    }

    return Math.round(totalHours)
}

/**
 * Genera el árbol de aprendizaje completo
 */
export function generateLearningPath(
    nodes: any[],
    edges: any[]
): LearningPath {
    // Calcular profundidades
    const depths = calculateNodeDepths(nodes, edges)

    // Encontrar nodos raíz
    const startNodes = findRootNodes(nodes, edges)

    // Encontrar hitos
    const milestones = findMilestones(nodes, edges, depths)

    // Generar orden de aprendizaje
    const order = generateLearningOrder(nodes, edges)

    // Estimar duración
    const estimatedDuration = estimateDuration(nodes, depths)

    return {
        order,
        levels: depths,
        milestones,
        startNodes,
        estimatedDuration
    }
}