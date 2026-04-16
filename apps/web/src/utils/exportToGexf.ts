// src/utils/exportToGexf.ts

export interface GraphNode {
    id: string
    label: string
    description?: string
    difficulty?: number
    phase?: number
    topic?: string
    mastery?: number
    position_x?: number
    position_y?: number
    moduleOrder?: number
    courseTitle?: string
    moduleWeight?: number
}

export interface GraphEdge {
    id: string
    source: string
    target: string
    strength?: number
    prerequisite_strength?: number
    type?: 'internal' | 'intermodule' | 'cross'
}

export interface GraphData {
    nodes: GraphNode[]
    edges: GraphEdge[]
    course?: {
        id: string
        title: string
        description: string
    }
}

/**
 * Escapa caracteres especiales para XML
 */
function escapeXml(unsafe: string): string {
    if (!unsafe) return ''
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/**
 * Genera un archivo GEXF válido para Gephi
 * Formato: https://gephi.org/gexf/1.2draft.xsd
 *
 * Características:
 * - Incluye todos los nodos de todos los cursos
 * - Incluye edges internos de cada curso
 * - Incluye edges entre módulos (dependencias entre cursos)
 * - Colores por módulo para fácil identificación
 * - Posiciones preservadas para visualización consistente
 */
export function generateGexfFromGraph(
    graphData: GraphData,
    courseTitle: string,
    courseDescription: string = ''
): string {
    const timestamp = new Date().toISOString()
    const nodes = graphData.nodes || []
    const edges = graphData.edges || []

    // Calcular estadísticas
    const totalNodes = nodes.length
    const totalEdges = edges.length

    // Determinar rangos de dificultad
    const difficulties = nodes.map(n => n.difficulty || 0)
    const maxDifficulty = Math.max(...difficulties, 1)

    // Colores para los diferentes módulos (igual que en GraphView)
    const MODULE_COLORS = [
        '#4A90D9', '#50E3C2', '#F5A623', '#D0021B', '#9B59B6',
        '#1D9E75', '#E8A317', '#E67E22', '#2ECC71', '#E74C3C'
    ]

    function getModuleColor(moduleOrder: number): string {
        if (!moduleOrder) return '#1E3A5F'
        return MODULE_COLORS[(moduleOrder - 1) % MODULE_COLORS.length]
    }

    // Construir XML GEXF
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" 
      xmlns:viz="http://www.gexf.net/1.2draft/viz" 
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
      xsi:schemaLocation="http://www.gexf.net/1.2draft http://www.gexf.net/1.2draft/gexf.xsd" 
      version="1.2">
    <meta lastmodifieddate="${timestamp}">
        <creator>AI Learning Graph Platform</creator>
        <description>${escapeXml(courseDescription || `Grafo de aprendizaje para: ${courseTitle}`)}</description>
    </meta>
    <graph mode="static" defaultedgetype="directed">
        
        <!-- Atributos de nodos -->
        <attributes class="node">
            <attribute id="description" title="Descripción" type="string"/>
            <attribute id="difficulty" title="Dificultad (1-5)" type="integer"/>
            <attribute id="phase" title="Fase" type="integer"/>
            <attribute id="topic" title="Tema" type="string"/>
            <attribute id="mastery" title="Mastery" type="double"/>
            <attribute id="moduleOrder" title="Módulo" type="integer"/>
            <attribute id="courseTitle" title="Curso" type="string"/>
            <attribute id="moduleWeight" title="Peso del Módulo" type="double"/>
        </attributes>
        
        <!-- Atributos de edges -->
        <attributes class="edge">
            <attribute id="strength" title="Fuerza" type="double"/>
            <attribute id="prerequisite_strength" title="Fuerza de prerrequisito" type="double"/>
            <attribute id="edgeType" title="Tipo de Edge" type="string">
                <default>internal</default>
                <options>internal,intermodule,cross</options>
            </attribute>
        </attributes>
        
        <!-- Nodos -->
        <nodes count="${totalNodes}">
`

    // Añadir cada nodo
    for (const node of nodes) {
        const nodeId = escapeXml(node.id)
        const label = escapeXml(node.label)
        const description = escapeXml(node.description || '')
        const difficulty = node.difficulty || 1
        const phase = node.phase || node.moduleOrder || 1
        const topic = escapeXml(node.topic || 'General')
        const mastery = node.mastery || 0
        const moduleOrder = node.moduleOrder || 1
        const courseTitleAttr = escapeXml(node.courseTitle || '')
        const moduleWeight = node.moduleWeight || (1 / (nodes.filter(n => n.moduleOrder === moduleOrder).length || 1))

        // Posiciones
        const posX = node.position_x ?? (Math.random() * 1000)
        const posY = node.position_y ?? (Math.random() * 800)

        // Color basado en módulo
        const moduleColor = getModuleColor(moduleOrder)

        // Tamaño basado en dificultad y peso del módulo
        const size = 10 + (difficulty / maxDifficulty) * 20 + (moduleWeight * 10)

        xml += `            <node id="${nodeId}" label="${label}">
                <attvalues>
                    <attvalue for="description" value="${description}"/>
                    <attvalue for="difficulty" value="${difficulty}"/>
                    <attvalue for="phase" value="${phase}"/>
                    <attvalue for="topic" value="${topic}"/>
                    <attvalue for="mastery" value="${mastery}"/>
                    <attvalue for="moduleOrder" value="${moduleOrder}"/>
                    <attvalue for="courseTitle" value="${courseTitleAttr}"/>
                    <attvalue for="moduleWeight" value="${moduleWeight}"/>
                </attvalues>
                <viz:size value="${size}"/>
                <viz:position x="${posX}" y="${posY}" z="0.0"/>
                <viz:color r="${parseInt(moduleColor.slice(1, 3), 16)}" 
                           g="${parseInt(moduleColor.slice(3, 5), 16)}" 
                           b="${parseInt(moduleColor.slice(5, 7), 16)}"/>
                <viz:shape value="disc"/>
            </node>
`
    }

    xml += `        </nodes>
        
        <!-- Edges -->
        <edges count="${totalEdges}">
`

    // Añadir cada edge
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]
        const edgeId = edge.id || `e${i}`
        const source = escapeXml(edge.source)
        const target = escapeXml(edge.target)
        const strength = edge.strength ?? edge.prerequisite_strength ?? 0.5
        const edgeType = edge.type || 'internal'

        // Grosor basado en fuerza y tipo
        let thickness = 1 + strength * 3
        let edgeColor = '#D3D1C7'

        if (edgeType === 'intermodule') {
            thickness = 3 + strength * 3
            edgeColor = '#E24B4A'
        } else if (edgeType === 'cross') {
            thickness = 2 + strength * 2
            edgeColor = '#9B59B6'
        }

        xml += `            <edge id="${edgeId}" source="${source}" target="${target}" weight="${strength}" type="${edgeType}">
                <attvalues>
                    <attvalue for="strength" value="${strength}"/>
                    <attvalue for="prerequisite_strength" value="${strength}"/>
                    <attvalue for="edgeType" value="${edgeType}"/>
                </attvalues>
                <viz:thickness value="${thickness}"/>
                <viz:color r="${parseInt(edgeColor.slice(1, 3), 16)}" 
                           g="${parseInt(edgeColor.slice(3, 5), 16)}" 
                           b="${parseInt(edgeColor.slice(5, 7), 16)}"/>
                <viz:shape value="solid"/>
            </edge>
`
    }

    xml += `        </edges>
    </graph>
</gexf>`

    return xml
}

/**
 * Genera un GEXF para un bootcamp completo (múltiples cursos)
 * Esta es la función principal para exportar bootcamps
 */
export function generateBootcampGexf(
    bootcampData: {
        id: string
        title: string
        description: string
        modules: any[]
    },
    coursesGraphs: Map<string, GraphData>
): string {
    const allNodes: GraphNode[] = []
    const allEdges: GraphEdge[] = []

    let edgeCounter = 0
    let courseCounter = 0
    const coursePrefixes: Map<string, string> = new Map()

    // Añadir nodos y edges de cada curso con prefijo único
    for (const [courseId, graphData] of coursesGraphs) {
        const prefix = `c${courseCounter++}_`
        coursePrefixes.set(courseId, prefix)

        // Encontrar el orden del módulo (basado en bootcampData.modules)
        let moduleOrder = courseCounter
        if (bootcampData.modules) {
            const moduleIndex = bootcampData.modules.findIndex(m => m.course_id === courseId)
            if (moduleIndex !== -1) moduleOrder = moduleIndex + 1
        }

        // Calcular peso del módulo
        const moduleWeight = bootcampData.modules?.find(m => m.course_id === courseId)?.weight || (1 / (coursesGraphs.size || 1))

        for (const node of graphData.nodes) {
            allNodes.push({
                ...node,
                id: `${prefix}${node.id}`,
                label: node.label,
                moduleOrder: moduleOrder,
                courseTitle: node.courseTitle || courseId,
                moduleWeight: moduleWeight
            })
        }

        for (const edge of graphData.edges) {
            allEdges.push({
                ...edge,
                id: `e${edgeCounter++}`,
                source: `${prefix}${edge.source}`,
                target: `${prefix}${edge.target}`,
                type: 'internal'
            })
        }
    }

    // Añadir edges entre módulos del bootcamp
    if (bootcampData.modules) {
        const moduleNodes: Map<number, string[]> = new Map()

        // Agrupar nodos por módulo
        for (const node of allNodes) {
            const moduleOrder = node.moduleOrder || 1
            if (!moduleNodes.has(moduleOrder)) {
                moduleNodes.set(moduleOrder, [])
            }
            moduleNodes.get(moduleOrder)!.push(node.id)
        }

        // Conectar módulos secuencialmente (M1 -> M2, M2 -> M3, etc.)
        for (let i = 1; i <= moduleNodes.size; i++) {
            const currentNodes = moduleNodes.get(i) || []
            const nextNodes = moduleNodes.get(i + 1) || []

            if (currentNodes.length > 0 && nextNodes.length > 0) {
                // Conectar los 3 nodos más importantes de cada módulo
                const sourcesToConnect = currentNodes.slice(-3)
                const targetsToConnect = nextNodes.slice(0, 3)

                for (const source of sourcesToConnect) {
                    for (const target of targetsToConnect) {
                        allEdges.push({
                            id: `e${edgeCounter++}`,
                            source: source,
                            target: target,
                            strength: 0.8,
                            prerequisite_strength: 0.8,
                            type: 'intermodule'
                        })
                    }
                }

                // Conexión principal (primer nodo de cada módulo)
                if (currentNodes.length > 0 && nextNodes.length > 0) {
                    allEdges.push({
                        id: `e${edgeCounter++}`,
                        source: currentNodes[0],
                        target: nextNodes[0],
                        strength: 0.9,
                        prerequisite_strength: 0.9,
                        type: 'intermodule'
                    })
                }
            }
        }
    }

    return generateGexfFromGraph(
        { nodes: allNodes, edges: allEdges },
        bootcampData.title,
        bootcampData.description
    )
}

/**
 * Descarga un archivo GEXF
 */
export function downloadGexf(gexfContent: string, filename: string): void {
    const blob = new Blob([gexfContent], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.gexf') ? filename : `${filename}.gexf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Exporta un curso a GEXF usando la API (fallback) o generación local
 */
export async function exportCourseToGexf(
    courseId: string,
    courseTitle: string,
    useApi: boolean = true
): Promise<boolean> {
    try {
        if (useApi) {
            const token = localStorage.getItem('google_token')
            const response = await fetch(`https://mygateway.up.railway.app/graph/${courseId}/export/gexf`, {
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
            }
        }

        // Fallback: generar localmente desde el grafo
        const graphResponse = await fetch(`https://mygateway.up.railway.app/graph/${courseId}`)
        if (!graphResponse.ok) {
            throw new Error('No se pudo obtener el grafo')
        }

        const graphData = await graphResponse.json()
        const gexfContent = generateGexfFromGraph(
            { nodes: graphData.nodes || [], edges: graphData.edges || [] },
            courseTitle
        )
        downloadGexf(gexfContent, `${courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`)
        return true

    } catch (error) {
        console.error('Error exporting course to GEXF:', error)
        return false
    }
}

/**
 * Exporta un bootcamp a GEXF usando el grafo global
 * Esta es la función principal para exportar bootcamps completos
 */
export async function exportBootcampToGexfFromGraph(
    bootcampGraph: { nodes: GraphNode[]; edges: GraphEdge[] },
    bootcampTitle: string,
    bootcampDescription: string
): Promise<boolean> {
    try {
        const gexfContent = generateGexfFromGraph(
            bootcampGraph,
            bootcampTitle,
            bootcampDescription
        )
        downloadGexf(gexfContent, `bootcamp_${bootcampTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`)
        return true
    } catch (error) {
        console.error('Error exporting bootcamp graph to GEXF:', error)
        return false
    }
}

/**
 * Exporta un bootcamp a GEXF (generación local desde cursos)
 */
export async function exportBootcampToGexfLocal(
    bootcampId: string,
    bootcampTitle: string,
    courseIds: string[]
): Promise<boolean> {
    try {
        const coursesGraphs = new Map<string, GraphData>()

        // Obtener grafos de todos los cursos
        for (const courseId of courseIds) {
            const response = await fetch(`https://mygateway.up.railway.app/graph/${courseId}`)
            if (response.ok) {
                const graphData = await response.json()

                // Obtener título del curso
                let courseTitle = courseId
                const courseResponse = await fetch(`https://mygateway.up.railway.app/courses/${courseId}`)
                if (courseResponse.ok) {
                    const courseData = await courseResponse.json()
                    courseTitle = courseData.title || courseId
                }

                coursesGraphs.set(courseId, {
                    nodes: graphData.nodes || [],
                    edges: graphData.edges || [],
                    course: { id: courseId, title: courseTitle, description: '' }
                })
            }
        }

        // Obtener información del bootcamp
        const token = localStorage.getItem('google_token')
        const bootcampResponse = await fetch(`https://mygateway.up.railway.app/bootcamp/${bootcampId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        let bootcampInfo = {
            id: bootcampId,
            title: bootcampTitle,
            description: '',
            modules: courseIds.map((id, idx) => ({
                course_id: id,
                order: idx + 1,
                weight: 1 / courseIds.length
            }))
        }

        if (bootcampResponse.ok) {
            const data = await bootcampResponse.json()
            bootcampInfo = { ...bootcampInfo, ...data }
        }

        const gexfContent = generateBootcampGexf(bootcampInfo, coursesGraphs)
        downloadGexf(gexfContent, `bootcamp_${bootcampTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`)
        return true

    } catch (error) {
        console.error('Error exporting bootcamp to GEXF:', error)
        return false
    }
}