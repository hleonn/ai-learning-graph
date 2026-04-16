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
    weight: number          // Peso del módulo (0-1)
    percentage: number      // Porcentaje (0-100)
    complexity: number      // Complejidad (0-1)
    nodeFactor: number      // Factor basado en nodos
    positionFactor: number  // Factor basado en posición
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
 * Los módulos posteriores tienen más peso
 */
function calculatePositionFactor(position: number, total: number): number {
    if (total === 1) return 0.5
    // Progresión lineal: primer módulo = 0.3, último = 0.9
    const minFactor = 0.3
    const maxFactor = 0.9
    return minFactor + ((position - 1) / (total - 1)) * (maxFactor - minFactor)
}

/**
 * Calcula pesos progresivos para los módulos del bootcamp
 *
 * Fórmula: Peso = (Complejidad_base * 0.4) + (Factor_nodos * 0.3) + (Factor_posición * 0.3)
 */
export function calculateProgressiveWeights(
    courses: CourseInfo[],
    order: string[]  // IDs de cursos en orden
): ModuleWeight[] {
    if (courses.length === 0) return []

    // Encontrar máximo de nodos para normalización
    const maxNodes = Math.max(...courses.map(c => c.nodeCount))

    // Calcular factores individuales (sin usar idx no utilizado)
    const factors = courses.map((course) => {
        const position = order.indexOf(course.id) + 1
        const total = courses.length

        const baseComplexity = getBaseComplexity(course.difficulty)
        const nodeFactor = calculateNodeFactor(course.nodeCount, maxNodes)
        const positionFactor = calculatePositionFactor(position, total)

        // Peso bruto = combinación de factores
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

    // Normalizar pesos para que sumen 1
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

    // Ajustar para que la suma sea exactamente 100%
    const totalPercentage = weights.reduce((sum, w) => sum + w.percentage, 0)
    if (totalPercentage !== 100 && weights.length > 0) {
        const diff = 100 - totalPercentage
        weights[weights.length - 1].percentage += diff
    }

    return weights
}

/**
 * Calcula pesos simplificados cuando no hay datos completos
 */
export function calculateSimpleWeights(totalModules: number): number[] {
    if (totalModules === 0) return []

    // Progresión: 10%, 15%, 20%, 25%, 30% (para 5 módulos)
    const progression = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40]

    const weights: number[] = []
    for (let i = 0; i < totalModules; i++) {
        if (i < progression.length) {
            weights.push(progression[i])
        } else {
            // Para más de 7 módulos, distribución equitativa con sesgo al final
            const remaining = 1 - weights.reduce((a, b) => a + b, 0)
            const remainingModules = totalModules - i
            weights.push(remaining / remainingModules)
        }
    }

    // Normalizar
    const total = weights.reduce((a, b) => a + b, 0)
    return weights.map(w => w / total)
}

/**
 * Obtiene recomendación de orden de cursos basado en dependencias
 */
export function suggestCourseOrder(courses: CourseInfo[]): string[] {
    // Orden por dificultad (beginner → expert)
    const difficultyOrder: Record<string, number> = {
        'beginner': 1,
        'intermediate': 2,
        'advanced': 3,
        'expert': 4
    }

    return [...courses]
        .sort((a, b) => {
            // Primero por dificultad
            const diff = (difficultyOrder[a.difficulty] || 2) - (difficultyOrder[b.difficulty] || 2)
            if (diff !== 0) return diff
            // Luego por número de nodos (menos nodos primero = fundamentos)
            return a.nodeCount - b.nodeCount
        })
        .map(c => c.id)
}