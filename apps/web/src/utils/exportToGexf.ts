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
    // NOTA: Gephi no reconoce el atributo 'type', lo eliminamos
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
 * Genera un archivo GEXF válido para Gephi 0.10
 *
 * NOTAS IMPORTANTES PARA GEPHI:
 * - No usar atributo 'type' en edges (no es estándar)
 * - Usar versión 1.2 (deprecated pero funciona)
 * - Los colores se definen con viz:color
 * - Las posiciones con viz:position
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
        '#4A90D9', '#50E3C2', '#F5A623', '#D0021B', '#9B59B6',
        '#1D9E75', '#E8A317', '#E67E22', '#2ECC71', '#E74C3C'
    ]

    function getModuleColor(moduleOrder: number): string {
        if (!moduleOrder) return '#1E3A5F'
        return MODULE_COLORS[(moduleOrder - 1) % MODULE_COLORS.length]
    }

    // Construir XML GEXF (sin atributo 'type' en edges)
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" 
      xmlns:viz="http://www.gexf.net/1.2draft/viz" 
      version="1.2">
    <meta lastmodifieddate="${timestamp}">
        <creator>AI Learning Graph Platform</creator>
        <description>${escapeXml(courseDescription || `Grafo de aprendizaje para: ${courseTitle}`)}</description>
    </meta>
    <graph mode="static" defaultedgetype="directed">
        
        <!-- Atributos de nodos -->
        <attributes class="node">
            <attribute id="description" title="Descripción" type="string"/>
            <attribute id="difficulty" title="Dificultad" type="integer"/>
            <attribute id="phase" title="Fase" type="integer"/>
            <attribute id="topic" title="Tema" type="string"/>
            <attribute id="moduleOrder" title="Módulo" type="integer"/>
            <attribute id="courseTitle" title="Curso" type="string"/>
            <attribute id="moduleWeight" title="Peso del Módulo" type="double"/>
        </attributes>
        
        <!-- Atributos de edges (solo weight, sin type) -->
        <attributes class="edge">
            <attribute id="strength" title="Fuerza" type="double"/>
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
        const moduleOrder = node.moduleOrder || 1
        const courseTitleAttr = escapeXml(node.courseTitle || '')
        const moduleWeight = node.moduleWeight || 0.2

        // Posiciones
        const posX = node.position_x ?? (Math.random() * 1000)
        const posY = node.position_y ?? (Math.random() * 800)

        // Color basado en módulo
        const moduleColor = getModuleColor(moduleOrder)

        // Tamaño basado en dificultad
        const size = 15 + (difficulty * 5)

        xml += `            <node id="${nodeId}" label="${label}">
                <attvalues>
                    <attvalue for="description" value="${description}"/>
                    <attvalue for="difficulty" value="${difficulty}"/>
                    <attvalue for="phase" value="${phase}"/>
                    <attvalue for="topic" value="${topic}"/>
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
        
        <!-- Edges (sin atributo 'type' para compatibilidad con Gephi) -->
        <edges count="${totalEdges}">
`

    // Añadir cada edge (sin atributo type)
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]
        const edgeId = edge.id || `e${i}`
        const source = escapeXml(edge.source)
        const target = escapeXml(edge.target)
        const strength = edge.strength ?? edge.prerequisite_strength ?? 0.5

        // Determinar color y grosor basado en si es intermodule (por el nombre del edge)
        const isIntermodule = edge.id?.includes('intermodule') ||
            source.includes('c1_') && target.includes('c2_') ||
            source.includes('c2_') && target.includes('c3_') ||
            source.includes('c3_') && target.includes('c4_') ||
            source.includes('c4_') && target.includes('c5_')

        const edgeColor = isIntermodule ? '#E24B4A' : '#D3D1C7'
        const thickness = isIntermodule ? 3 + strength * 2 : 1 + strength * 2

        xml += `            <edge id="${edgeId}" source="${source}" target="${target}" weight="${strength}">
                <attvalues>
                    <attvalue for="strength" value="${strength}"/>
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