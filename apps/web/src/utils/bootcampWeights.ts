// src/utils/bootcampWeights.ts

interface CourseInfo {
    id: string
    title: string
    nodeCount: number
    edgeCount: number
    difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
    complexityScore?: number
}

interface ModuleWeight {
    courseId: string
    courseTitle: string
    weight: number
    percentage: number
    complexity: number
    nodeFactor: number
    positionFactor: number
}

interface GraphNode {
    id: string
    label: string
    description: string
    difficulty: number
    prerequisites: string[]
}

/**
 * Calcula la complejidad base según nivel de dificultad
 */
function getBaseComplexity(difficulty: string): number {
    const map: Record<string, number> = {
        'beginner': 0.2,
        'intermediate': 0.5,
        'advanced': 0.8,
        'expert': 1.0
    }
    return map[difficulty] || 0.5
}

/**
 * Calcula el factor de nodos (normalizado)
 */
function calculateNodeFactor(nodeCount: number, maxNodes: number): number {
    if (maxNodes === 0) return 0.5
    return nodeCount / maxNodes
}

/**
 * Calcula el factor de posición (progresión)
 */
function calculatePositionFactor(position: number, total: number): number {
    if (total === 1) return 0.5
    const minFactor = 0.3
    const maxFactor = 0.9
    return minFactor + ((position - 1) / (total - 1)) * (maxFactor - minFactor)
}

/**
 * Calcula pesos progresivos para los módulos del bootcamp
 */
export function calculateProgressiveWeights(
    courses: CourseInfo[],
    order: string[]
): ModuleWeight[] {
    if (courses.length === 0) return []

    const maxNodes = Math.max(...courses.map(c => c.nodeCount))

    const factors = courses.map((course) => {
        const position = order.indexOf(course.id) + 1
        const total = courses.length

        const baseComplexity = getBaseComplexity(course.difficulty)
        const nodeFactor = calculateNodeFactor(course.nodeCount, maxNodes)
        const positionFactor = calculatePositionFactor(position, total)

        const rawWeight = (baseComplexity * 0.4) + (nodeFactor * 0.3) + (positionFactor * 0.3)

        return {
            ...course,
            position,
            total,
            baseComplexity,
            nodeFactor,
            positionFactor,
            rawWeight
        }
    })

    const totalRawWeight = factors.reduce((sum, f) => sum + f.rawWeight, 0)

    const weights: ModuleWeight[] = factors.map(f => ({
        courseId: f.id,
        courseTitle: f.title,
        weight: f.rawWeight / totalRawWeight,
        percentage: Math.round((f.rawWeight / totalRawWeight) * 100),
        complexity: f.baseComplexity,
        nodeFactor: f.nodeFactor,
        positionFactor: f.positionFactor
    }))

    const totalPercentage = weights.reduce((sum, w) => sum + w.percentage, 0)
    if (totalPercentage !== 100 && weights.length > 0) {
        const diff = 100 - totalPercentage
        weights[weights.length - 1].percentage += diff
    }

    return weights
}

/**
 * Obtiene recomendación de orden de cursos basado en dificultad (fallback)
 */
export function suggestCourseOrder(courses: CourseInfo[]): string[] {
    const difficultyOrder: Record<string, number> = {
        'beginner': 1,
        'intermediate': 2,
        'advanced': 3,
        'expert': 4
    }

    return [...courses]
        .sort((a, b) => {
            const diff = (difficultyOrder[a.difficulty] || 2) - (difficultyOrder[b.difficulty] || 2)
            if (diff !== 0) return diff
            return a.nodeCount - b.nodeCount
        })
        .map(c => c.id)
}

/**
 * NUEVA FUNCIÓN: Ordena cursos basado en dependencias pedagógicas reales
 * Analiza los grafos de cada curso para detectar qué conceptos son prerrequisito de otros
 */
export async function suggestPedagogicalOrder(
    courses: CourseInfo[],
    courseGraphs: Map<string, GraphNode[]>
): Promise<string[]> {
    console.log('📚 suggestPedagogicalOrder - Iniciando')
    console.log(`   Cursos a ordenar: ${courses.map(c => c.title).join(', ')}`)

    if (courses.length <= 1) {
        return courses.map(c => c.id)
    }

    // Construir grafo de dependencias entre cursos
    const dependencies = new Map<string, Set<string>>()
    const courseMap = new Map<string, CourseInfo>()

    for (const course of courses) {
        dependencies.set(course.id, new Set())
        courseMap.set(course.id, course)
    }

    // Para cada curso, obtener sus nodos y sus prerrequisitos
    const courseNodeLabels = new Map<string, Set<string>>()
    const coursePrereqs = new Map<string, Set<string>>()

    for (const course of courses) {
        const nodes = courseGraphs.get(course.id) || []
        const labels = new Set<string>()
        const prereqs = new Set<string>()

        for (const node of nodes) {
            if (node.label) {
                labels.add(node.label.toLowerCase())
            }
            if (node.prerequisites && Array.isArray(node.prerequisites)) {
                for (const prereq of node.prerequisites) {
                    if (prereq) {
                        prereqs.add(prereq.toLowerCase())
                    }
                }
            }
        }

        courseNodeLabels.set(course.id, labels)
        coursePrereqs.set(course.id, prereqs)

        console.log(`   Curso "${course.title}": ${labels.size} conceptos, ${prereqs.size} prerrequisitos únicos`)
    }

    // Detectar dependencias entre cursos
    for (const courseA of courses) {
        const labelsA = courseNodeLabels.get(courseA.id) || new Set()
        const depsForA = dependencies.get(courseA.id) || new Set()

        for (const courseB of courses) {
            if (courseA.id === courseB.id) continue

            const prereqsB = coursePrereqs.get(courseB.id) || new Set()

            // Si conceptos de A son prerrequisito de B, entonces A debe ir antes que B
            for (const prereq of prereqsB) {
                if (labelsA.has(prereq)) {
                    depsForA.add(courseB.id)
                    console.log(`   🔗 Dependencia: "${courseA.title}" → "${courseB.title}" (por: "${prereq}")`)
                    break
                }
            }
        }
        dependencies.set(courseA.id, depsForA)
    }

    // Orden topológico basado en dependencias
    const order: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    function dfs(courseId: string): boolean {
        if (visiting.has(courseId)) {
            console.warn(`   ⚠️ Ciclo detectado en: ${courseMap.get(courseId)?.title}`)
            return false
        }
        if (visited.has(courseId)) return true

        visiting.add(courseId)
        const deps = dependencies.get(courseId) || new Set()

        for (const dep of deps) {
            if (!dfs(dep)) return false
        }

        visiting.delete(courseId)
        visited.add(courseId)
        order.unshift(courseId)
        return true
    }

    for (const course of courses) {
        if (!visited.has(course.id)) {
            dfs(course.id)
        }
    }

    // Contar cuántas dependencias se detectaron
    let totalDeps = 0
    for (const deps of dependencies.values()) {
        totalDeps += deps.size
    }
    console.log(`   📊 Dependencias detectadas: ${totalDeps}`)

    // Si hay dependencias detectadas, usar orden topológico
    if (order.length === courses.length && totalDeps > 0) {
        console.log('📚 Orden pedagógico detectado:', order.map(id => courseMap.get(id)?.title))
        return order
    }

    // Fallback: orden por dificultad
    console.log('⚠️ No se detectaron dependencias, usando orden por dificultad')
    return suggestCourseOrder(courses)
}