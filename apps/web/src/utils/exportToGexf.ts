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
        .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '')
}

/**
 * Limpia un ID para que sea válido en XML y Gephi
 */
function cleanId(id: string): string {
    if (!id) return `node_${Math.random().toString(36).substr(2, 8)}`
    // Reemplazar caracteres no válidos y asegurar que comience con letra
    let cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    if (cleaned.match(/^\d/)) {
        cleaned = `n${cleaned}`
    }
    return cleaned
}

/**
 * Genera posiciones en layout circular para Gephi
 */
function generateCircularLayout(nodeCount: number, index: number): { x: number; y: number } {
    const radius = Math.min(800, Math.max(300, nodeCount * 4))
    const centerX = 500
    const centerY = 400
    const angle = (index / nodeCount) * 2 * Math.PI
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
    }
}

/**
 * Genera posiciones en layout jerárquico (mejor para dependencias)
 */
function generateHierarchicalLayout(
    nodes: GraphNode[],
    edges: GraphEdge[]
): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()

    // Calcular profundidad de cada nodo
    const depth = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    // Construir grafo de dependencias
    for (const edge of edges) {
        const source = cleanId(edge.source)
        const target = cleanId(edge.target)
        if (!adjacency.has(source)) {
            adjacency.set(source, [])
        }
        adjacency.get(source)!.push(target)
    }

    // Encontrar nodos raíz (sin dependencias entrantes)
    const allTargets = new Set(edges.map(e => cleanId(e.target)))
    const roots = nodes.filter(n => !allTargets.has(cleanId(n.id))).map(n => cleanId(n.id))

    // BFS para asignar profundidad (CORREGIDO)
    const queue: { id: string; depth: number }[] = roots.map(id => ({ id, depth: 0 }))
    const visited = new Set<string>()

    for (const root of roots) {
        depth.set(root, 0)
        visited.add(root)
    }

    while (queue.length > 0) {
        const item = queue.shift()!
        const { id, depth: currentDepth } = item
        const children = adjacency.get(id) || []

        for (const child of children) {
            const existingDepth = depth.get(child)
            const newDepth = currentDepth + 1
            if (existingDepth === undefined || newDepth < existingDepth) {
                depth.set(child, newDepth)
                if (!visited.has(child)) {
                    visited.add(child)
                    queue.push({ id: child, depth: newDepth })
                }
            }
        }
    }

    // Asignar profundidad 0 a nodos no alcanzados
    for (const node of nodes) {
        const nodeId = cleanId(node.id)
        if (!depth.has(nodeId)) {
            depth.set(nodeId, 0)
        }
    }

    // Agrupar por profundidad
    const nodesByDepth = new Map<number, string[]>()
    for (const [nodeId, nodeDepth] of depth) {
        if (!nodesByDepth.has(nodeDepth)) {
            nodesByDepth.set(nodeDepth, [])
        }
        nodesByDepth.get(nodeDepth)!.push(nodeId)
    }

    // Calcular posiciones
    const maxDepth = Math.max(...Array.from(depth.values()), 1)
    const startY = 100
    const endY = 700
    const spacingX = 120

    for (const [nodeDepth, nodeIds] of nodesByDepth) {
        const y = startY + (nodeDepth / maxDepth) * (endY - startY)
        const total = nodeIds.length
        const startX = 500 - ((total - 1) * spacingX) / 2

        nodeIds.forEach((nodeId, idx) => {
            positions.set(nodeId, {
                x: startX + idx * spacingX,
                y: y
            })
        })
    }

    return positions
}

/**
 * Genera un archivo GEXF válido para Gephi 0.10
 */
export function generateGexfFromGraph(
    graphData: GraphData,
    courseTitle: string,
    courseDescription: string = ''
): string {
    const timestamp = new Date().toISOString()
    const nodes = graphData.nodes || []
    const edges = graphData.edges || []

    const totalNodes = nodes.length
    const totalEdges = edges.length

    // Colores para los diferentes módulos
    const MODULE_COLORS = [
        { r: 74, g: 144, b: 217 },   // '#4A90D9' Azul
        { r: 80, g: 227, b: 194 },    // '#50E3C2' Verde agua
        { r: 245, g: 166, b: 35 },    // '#F5A623' Naranja
        { r: 208, g: 2, b: 27 },      // '#D0021B' Rojo
        { r: 155, g: 89, b: 182 },    // '#9B59B6' Púrpura
        { r: 29, g: 158, b: 117 },    // '#1D9E75' Verde
        { r: 232, g: 163, b: 23 },    // '#E8A317' Amarillo
        { r: 230, g: 126, b: 34 },    // '#E67E22' Naranja oscuro
        { r: 46, g: 204, b: 113 },    // '#2ECC71' Verde claro
        { r: 231, g: 76, b: 60 }      // '#E74C3C' Rojo claro
    ]

    function getModuleColor(moduleOrder: number): { r: number; g: number; b: number } {
        if (!moduleOrder || moduleOrder < 1) return { r: 30, g: 58, b: 95 }
        const idx = (moduleOrder - 1) % MODULE_COLORS.length
        return MODULE_COLORS[idx]
    }

    // Generar posiciones jerárquicas
    const positions = generateHierarchicalLayout(nodes, edges)

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" 
      xmlns:viz="http://www.gexf.net/1.2draft/viz" 
      version="1.2">
    <meta lastmodifieddate="${timestamp}">
        <creator>AI Learning Graph Platform</creator>
        <description>${escapeXml(courseDescription || `Grafo de aprendizaje para: ${courseTitle}`)}</description>
    </meta>
    <graph mode="static" defaultedgetype="directed">
        
        <attributes class="node">
            <attribute id="description" title="Descripción" type="string"/>
            <attribute id="difficulty" title="Dificultad" type="integer"/>
            <attribute id="phase" title="Fase" type="integer"/>
            <attribute id="topic" title="Tema" type="string"/>
            <attribute id="moduleOrder" title="Módulo" type="integer"/>
            <attribute id="courseTitle" title="Curso" type="string"/>
            <attribute id="moduleWeight" title="Peso del Módulo" type="double"/>
        </attributes>
        
        <attributes class="edge">
            <attribute id="strength" title="Fuerza" type="double"/>
        </attributes>
        
        <nodes count="${totalNodes}">
`

    // Añadir cada nodo
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const nodeId = cleanId(node.id)
        const label = escapeXml(node.label || `Nodo_${i}`)
        const description = escapeXml(node.description || '')
        const difficulty = node.difficulty || 1
        const phase = node.phase || node.moduleOrder || 1
        const topic = escapeXml(node.topic || 'General')
        const moduleOrder = node.moduleOrder || 1
        const courseTitleAttr = escapeXml(node.courseTitle || '')
        const moduleWeight = node.moduleWeight || 0.2

        // Obtener posición (jerárquica o circular)
        let posX: number, posY: number
        const position = positions.get(nodeId)

        if (position) {
            posX = position.x
            posY = position.y
        } else {
            const circularPos = generateCircularLayout(totalNodes, i)
            posX = circularPos.x
            posY = circularPos.y
        }

        const moduleColor = getModuleColor(moduleOrder)
        const size = Math.min(30, Math.max(10, 12 + (difficulty * 3) + (moduleWeight * 10)))

        xml += `            <node id="${nodeId}" label="${label}">
                <attvalues>
                    <attvalue for="description" value="${description}"/>
                    <attvalue for="difficulty" value="${difficulty}"/>
                    <attvalue for="phase" value="${phase}"/>
                    <attvalue for="topic" value="${topic}"/>
                    <attvalue for="moduleOrder" value="${moduleOrder}"/>
                    <attvalue for="courseTitle" value="${courseTitleAttr}"/>
                    <attvalue for="moduleWeight" value="${moduleWeight.toFixed(4)}"/>
                </attvalues>
                <viz:size value="${size}"/>
                <viz:position x="${posX.toFixed(1)}" y="${posY.toFixed(1)}" z="0.0"/>
                <viz:color r="${moduleColor.r}" g="${moduleColor.g}" b="${moduleColor.b}"/>
                <viz:shape value="disc"/>
            </node>
`
    }

    xml += `        </nodes>
        
        <edges count="${totalEdges}">
`

    // Añadir cada edge
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]
        const edgeId = edge.id || `e${i}`
        const source = cleanId(edge.source)
        const target = cleanId(edge.target)
        const strength = edge.strength ?? edge.prerequisite_strength ?? 0.5

        // Validar que source y target existan y sean diferentes
        if (!source || !target || source === target) continue

        // Determinar color y grosor
        const isIntermodule = edgeId.includes('intermodule') ||
            (source.startsWith('c') && target.startsWith('c') && source[1] !== target[1])

        const edgeColor = isIntermodule ? { r: 226, g: 75, b: 74 } : { r: 211, g: 209, b: 199 }
        const thickness = isIntermodule ? 3 + strength * 2 : 1 + strength * 2

        xml += `            <edge id="${edgeId}" source="${source}" target="${target}" weight="${strength.toFixed(4)}">
                <attvalues>
                    <attvalue for="strength" value="${strength.toFixed(4)}"/>
                </attvalues>
                <viz:thickness value="${thickness.toFixed(1)}"/>
                <viz:color r="${edgeColor.r}" g="${edgeColor.g}" b="${edgeColor.b}"/>
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
 * Exporta un bootcamp a GEXF desde el grafo global
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
 * Exporta un bootcamp a GEXF desde cursos individuales
 */
export async function exportBootcampToGexfLocal(
    bootcampTitle: string,
    courseIds: string[]
): Promise<boolean> {
    try {
        const allNodes: GraphNode[] = []
        const allEdges: GraphEdge[] = []
        let edgeCounter = 0
        let courseCounter = 0

        for (const courseId of courseIds) {
            const response = await fetch(`https://mygateway.up.railway.app/graph/${courseId}`)
            if (response.ok) {
                const graphData = await response.json()
                const nodes = graphData.nodes || []
                const edges = graphData.edges || []
                const prefix = `c${courseCounter++}_`

                let courseTitle = courseId
                const courseResponse = await fetch(`https://mygateway.up.railway.app/courses/${courseId}`)
                if (courseResponse.ok) {
                    const courseData = await courseResponse.json()
                    courseTitle = courseData.title || courseId
                }

                for (const node of nodes) {
                    const nodeData = node.data || node
                    allNodes.push({
                        id: `${prefix}${nodeData.id}`,
                        label: nodeData.label,
                        description: nodeData.description,
                        difficulty: nodeData.difficulty,
                        phase: nodeData.phase,
                        topic: nodeData.topic,
                        position_x: node.position?.x,
                        position_y: node.position?.y,
                        moduleOrder: courseCounter,
                        courseTitle: courseTitle,
                        moduleWeight: 1 / courseIds.length
                    })
                }

                for (const edge of edges) {
                    const edgeData = edge.data || edge
                    allEdges.push({
                        id: `e${edgeCounter++}`,
                        source: `${prefix}${edgeData.source}`,
                        target: `${prefix}${edgeData.target}`,
                        strength: edgeData.strength || edgeData.prerequisite_strength || 0.5
                    })
                }
            }
        }

        // Añadir conexiones entre módulos
        for (let i = 0; i < courseIds.length - 1; i++) {
            const prefixCurrent = `c${i}_`
            const prefixNext = `c${i + 1}_`

            const currentNodes = allNodes.filter(n => n.id.startsWith(prefixCurrent))
            const nextNodes = allNodes.filter(n => n.id.startsWith(prefixNext))

            if (currentNodes.length > 0 && nextNodes.length > 0) {
                // Conectar el último nodo del módulo actual con el primero del siguiente
                const sourceId = currentNodes[currentNodes.length - 1]?.id
                const targetId = nextNodes[0]?.id

                if (sourceId && targetId) {
                    allEdges.push({
                        id: `e${edgeCounter++}`,
                        source: sourceId,
                        target: targetId,
                        strength: 0.8
                    })
                }
            }
        }

        const gexfContent = generateGexfFromGraph(
            { nodes: allNodes, edges: allEdges },
            bootcampTitle,
            `Bootcamp: ${bootcampTitle}`
        )
        downloadGexf(gexfContent, `bootcamp_${bootcampTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`)
        return true

    } catch (error) {
        console.error('Error exporting bootcamp to GEXF:', error)
        return false
    }
}