// utils/exportToGexf.ts

interface GraphNode {
    id: string
    label: string
    description?: string
    difficulty?: number
    phase?: number
    topic?: string
    mastery?: number
    position_x?: number
    position_y?: number
}

interface GraphEdge {
    id: string
    source: string
    target: string
    strength?: number
    prerequisite_strength?: number
}

interface GraphData {
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

    // Determinar rangos de dificultad y fase
    const difficulties = nodes.map(n => n.difficulty || 0)
    // const _phases = nodes.map(n => n.phase || 0)
    const maxDifficulty = Math.max(...difficulties, 1)

    // Colores por fase (igual que en GraphView)
    const getPhaseColor = (phase: number): string => {
        const colors: Record<number, string> = {
            1: '#4A90D9',  // Azul
            2: '#50E3C2',  // Verde agua
            3: '#F5A623',  // Naranja
            4: '#D0021B',  // Rojo
            5: '#9B59B6',  // Púrpura
        }
        return colors[phase] || '#1E3A5F'
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
            <attribute id="difficulty" title="Dificultad" type="integer"/>
            <attribute id="phase" title="Fase" type="integer"/>
            <attribute id="topic" title="Tema" type="string"/>
            <attribute id="mastery" title="Mastery" type="double"/>
            <attribute id="pagerank" title="PageRank" type="double"/>
        </attributes>
        
        <!-- Atributos de edges -->
        <attributes class="edge">
            <attribute id="strength" title="Fuerza" type="double"/>
            <attribute id="prerequisite_strength" title="Fuerza de prerrequisito" type="double"/>
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
        const phase = node.phase || 1
        const topic = escapeXml(node.topic || 'General')
        const mastery = node.mastery || 0
        const pagerank = 0

        // Posiciones
        const posX = node.position_x ?? (Math.random() * 1000)
        const posY = node.position_y ?? (Math.random() * 800)

        // Colores
        const phaseColor = getPhaseColor(phase)

        // Tamaño basado en dificultad
        const size = 10 + (difficulty / maxDifficulty) * 20

        xml += `            <node id="${nodeId}" label="${label}">
                <attvalues>
                    <attvalue for="description" value="${description}"/>
                    <attvalue for="difficulty" value="${difficulty}"/>
                    <attvalue for="phase" value="${phase}"/>
                    <attvalue for="topic" value="${topic}"/>
                    <attvalue for="mastery" value="${mastery}"/>
                    <attvalue for="pagerank" value="${pagerank}"/>
                </attvalues>
                <viz:size value="${size}"/>
                <viz:position x="${posX}" y="${posY}" z="0.0"/>
                <viz:color r="${parseInt(phaseColor.slice(1, 3), 16)}" 
                           g="${parseInt(phaseColor.slice(3, 5), 16)}" 
                           b="${parseInt(phaseColor.slice(5, 7), 16)}"/>
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

        // Grosor basado en fuerza
        const thickness = 1 + strength * 3

        xml += `            <edge id="${edgeId}" source="${source}" target="${target}" weight="${strength}">
                <attvalues>
                    <attvalue for="strength" value="${strength}"/>
                    <attvalue for="prerequisite_strength" value="${strength}"/>
                </attvalues>
                <viz:thickness value="${thickness}"/>
                <viz:color r="211" g="209" b="199"/>
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

        for (const node of graphData.nodes) {
            allNodes.push({
                ...node,
                id: `${prefix}${node.id}`,
                label: node.label,
            })
        }

        for (const edge of graphData.edges) {
            allEdges.push({
                ...edge,
                id: `e${edgeCounter++}`,
                source: `${prefix}${edge.source}`,
                target: `${prefix}${edge.target}`,
            })
        }
    }

    // Añadir edges entre módulos del bootcamp si existen
    if (bootcampData.modules) {
        for (let i = 0; i < bootcampData.modules.length - 1; i++) {
            const currentModule = bootcampData.modules[i]
            const nextModule = bootcampData.modules[i + 1]

            // Conectar módulos secuencialmente
            if (currentModule.node_ids?.length && nextModule?.node_ids?.length) {
                // Buscar nodos representativos de cada módulo
                const sourceNodeId = `${coursePrefixes.get(currentModule.course_id) || ''}${currentModule.node_ids[0]}`
                const targetNodeId = `${coursePrefixes.get(nextModule.course_id) || ''}${nextModule.node_ids[0]}`

                if (sourceNodeId && targetNodeId) {
                    allEdges.push({
                        id: `e${edgeCounter++}`,
                        source: sourceNodeId,
                        target: targetNodeId,
                        strength: 0.8,
                        prerequisite_strength: 0.8
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
            // Intentar usar la API primero
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
 * Exporta un bootcamp a GEXF (generación local)
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
                coursesGraphs.set(courseId, {
                    nodes: graphData.nodes || [],
                    edges: graphData.edges || [],
                    course: graphData.course
                })
            }
        }

        // Obtener información del bootcamp
        const token = localStorage.getItem('google_token')
        const bootcampResponse = await fetch(`https://mygateway.up.railway.app/bootcamp/${bootcampId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        let bootcampInfo = { id: bootcampId, title: bootcampTitle, description: '', modules: [] }
        if (bootcampResponse.ok) {
            bootcampInfo = await bootcampResponse.json()
        }

        const gexfContent = generateBootcampGexf(bootcampInfo, coursesGraphs)
        downloadGexf(gexfContent, `bootcamp_${bootcampTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`)
        return true

    } catch (error) {
        console.error('Error exporting bootcamp to GEXF:', error)
        return false
    }
}