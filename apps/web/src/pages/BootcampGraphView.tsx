import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Cytoscape from 'cytoscape'
import type { BootcampGraph, GlobalNode } from '../utils/bootcampGraphBuilder'

interface ModuleInfo {
    id: string
    title: string
    order: number
    nodeCount: number
    edgeCount: number
    weight: number
    color: string
}

// Colores para los diferentes módulos
const MODULE_COLORS = [
    '#4A90D9', // Azul
    '#50E3C2', // Verde agua
    '#F5A623', // Naranja
    '#D0021B', // Rojo
    '#9B59B6', // Púrpura
    '#1D9E75', // Verde
    '#E8A317', // Amarillo
    '#E67E22', // Naranja oscuro
    '#2ECC71', // Verde claro
    '#E74C3C'  // Rojo claro
]

function getModuleColor(moduleOrder: number): string {
    return MODULE_COLORS[(moduleOrder - 1) % MODULE_COLORS.length]
}

function getNodeSize(moduleWeight: number, difficulty: number): number {
    // Tamaño base: 20-50px según peso del módulo y dificultad
    const baseSize = 25 + (moduleWeight * 30) + (difficulty * 5)
    return Math.min(Math.max(baseSize, 20), 60)
}

export default function BootcampGraphView() {
    const navigate = useNavigate()
    const location = useLocation()
    const containerRef = useRef<HTMLDivElement>(null)
    const cyRef = useRef<Cytoscape.Core | null>(null)

    const [bootcampGraph, setBootcampGraph] = useState<BootcampGraph | null>(null)
    const [modules, setModules] = useState<ModuleInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedNode, setSelectedNode] = useState<GlobalNode | null>(null)
    const [filterModule, setFilterModule] = useState<number | null>(null)
    const [showOnlyIntermodule, setShowOnlyIntermodule] = useState(false)
    const [bootcampTitle, setBootcampTitle] = useState('')

    // Cargar datos del bootcamp desde la ubicación (state) o desde localStorage
    useEffect(() => {
        const loadBootcampGraph = async () => {
            setLoading(true)
            try {
                // Intentar obtener del state de navegación
                const state = location.state as { bootcampGraph?: BootcampGraph; title?: string }

                if (state?.bootcampGraph) {
                    setBootcampGraph(state.bootcampGraph)
                    setBootcampTitle(state.title || 'Bootcamp')

                    // Extraer información de módulos
                    const moduleMap = new Map<number, ModuleInfo>()
                    for (const node of state.bootcampGraph.nodes) {
                        if (!moduleMap.has(node.moduleOrder)) {
                            moduleMap.set(node.moduleOrder, {
                                id: `module-${node.moduleOrder}`,
                                title: node.courseTitle,
                                order: node.moduleOrder,
                                nodeCount: 0,
                                edgeCount: 0,
                                weight: node.moduleWeight,
                                color: getModuleColor(node.moduleOrder)
                            })
                        }
                        const mod = moduleMap.get(node.moduleOrder)!
                        mod.nodeCount++
                    }

                    // Contar edges por módulo
                    for (const edge of state.bootcampGraph.edges) {
                        const sourceModule = state.bootcampGraph.nodes.find(n => n.id === edge.source)?.moduleOrder
                        const targetModule = state.bootcampGraph.nodes.find(n => n.id === edge.target)?.moduleOrder

                        if (sourceModule && targetModule && sourceModule === targetModule) {
                            const mod = moduleMap.get(sourceModule)
                            if (mod) mod.edgeCount++
                        }
                    }

                    setModules(Array.from(moduleMap.values()).sort((a, b) => a.order - b.order))
                } else {
                    // Intentar recuperar de localStorage (bootcamp construido previamente)
                    const savedGraph = localStorage.getItem('bootcamp_graph')
                    if (savedGraph) {
                        const parsed = JSON.parse(savedGraph)
                        setBootcampGraph(parsed)
                        setBootcampTitle(localStorage.getItem('bootcamp_title') || 'Bootcamp')
                    } else {
                        alert('No hay datos de bootcamp para visualizar. Construye un bootcamp primero.')
                        navigate('/dashboard')
                        return
                    }
                }
            } catch (error) {
                console.error('Error loading bootcamp graph:', error)
                alert('Error al cargar el grafo del bootcamp')
            } finally {
                setLoading(false)
            }
        }

        loadBootcampGraph()
    }, [location, navigate])

    // Inicializar Cytoscape cuando los datos están listos
    useEffect(() => {
        if (!bootcampGraph || !containerRef.current || loading) return

        // Destruir instancia anterior si existe
        if (cyRef.current) {
            cyRef.current.destroy()
            cyRef.current = null
        }

        const elements: any[] = []

        // Filtrar nodos según módulo seleccionado
        let filteredNodes = bootcampGraph.nodes
        if (filterModule !== null) {
            filteredNodes = bootcampGraph.nodes.filter(n => n.moduleOrder === filterModule)
        }

        // Añadir nodos (eliminadas variables no usadas moduleColor y difficultyColor)
        for (const node of filteredNodes) {
            elements.push({
                data: {
                    id: node.id,
                    label: node.label,
                    description: node.description,
                    difficulty: node.difficulty,
                    moduleOrder: node.moduleOrder,
                    courseTitle: node.courseTitle,
                    moduleWeight: node.moduleWeight,
                    originalId: node.originalId
                },
                position: { x: node.position_x, y: node.position_y },
                classes: `module-${node.moduleOrder}`
            })
        }

        // Filtrar edges
        let filteredEdges = bootcampGraph.edges
        if (showOnlyIntermodule) {
            filteredEdges = bootcampGraph.edges.filter(e => e.type === 'intermodule')
        } else if (filterModule !== null) {
            filteredEdges = bootcampGraph.edges.filter(e => {
                const sourceNode = bootcampGraph.nodes.find(n => n.id === e.source)
                const targetNode = bootcampGraph.nodes.find(n => n.id === e.target)
                return sourceNode?.moduleOrder === filterModule || targetNode?.moduleOrder === filterModule
            })
        }

        // Añadir edges
        for (const edge of filteredEdges) {
            const edgeColor = edge.type === 'intermodule' ? '#E24B4A' : '#D3D1C7'
            const edgeWidth = edge.type === 'intermodule' ? 4 : 2

            elements.push({
                data: {
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    type: edge.type,
                    strength: edge.strength
                },
                style: {
                    'line-color': edgeColor,
                    'width': edgeWidth,
                    'target-arrow-color': edgeColor,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': edge.type === 'intermodule' ? 0.9 : 0.5
                }
            })
        }

        // Configurar Cytoscape
        const cy = Cytoscape({
            container: containerRef.current,
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'background-color': (ele: any) => {
                            const moduleOrder = ele.data('moduleOrder')
                            return getModuleColor(moduleOrder)
                        },
                        'color': '#1E3A5F',
                        'font-size': '11px',
                        'font-weight': 'bold',
                        'text-valign': 'bottom',
                        'text-margin-y': 8,
                        'width': (ele: any) => {
                            const moduleWeight = ele.data('moduleWeight') || 0.2
                            const difficulty = ele.data('difficulty') || 3
                            return getNodeSize(moduleWeight, difficulty)
                        },
                        'height': (ele: any) => {
                            const moduleWeight = ele.data('moduleWeight') || 0.2
                            const difficulty = ele.data('difficulty') || 3
                            return getNodeSize(moduleWeight, difficulty)
                        },
                        'border-width': 3,
                        'border-color': '#fff',
                        'border-opacity': 0.8
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 5,
                        'border-color': '#FFD700',
                        'border-opacity': 1
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': (ele: any) => 2 + (ele.data('strength') || 0.5) * 3,
                        'line-color': (ele: any) => ele.style()['line-color'] || '#D3D1C7',
                        'target-arrow-color': (ele: any) => ele.style()['line-color'] || '#D3D1C7',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'opacity': (ele: any) => ele.style()['opacity'] || 0.6
                    }
                },
                {
                    selector: 'edge.intermodule',
                    style: {
                        'line-color': '#E24B4A',
                        'target-arrow-color': '#E24B4A',
                        'width': 4,
                        'opacity': 0.9
                    }
                }
            ],
            layout: {
                name: 'preset',
                fit: true,
                padding: 50,
                animate: true,
                animationDuration: 500
            },
            wheelSensitivity: 0.5,
            minZoom: 0.2,
            maxZoom: 3
        })

        // Eventos
        cy.on('tap', 'node', (evt: any) => {
            const node = evt.target
            const data = node.data()
            const nodeData = bootcampGraph.nodes.find(n => n.id === data.id)
            if (nodeData) {
                setSelectedNode(nodeData)
            }
        })

        cy.on('tap', (evt: any) => {
            if (evt.target === cy) {
                setSelectedNode(null)
            }
        })

        cyRef.current = cy

        // Ajustar vista después de un momento
        setTimeout(() => {
            cy.fit(undefined, 50)
            cy.resize()
        }, 100)

    }, [bootcampGraph, loading, filterModule, showOnlyIntermodule])

    const handleFit = () => {
        if (cyRef.current) {
            cyRef.current.fit(undefined, 50)
            cyRef.current.zoom(1)
        }
    }

    const handleResetFilter = () => {
        setFilterModule(null)
        setShowOnlyIntermodule(false)
    }

    const handleExportToGephi = () => {
        if (!bootcampGraph) return

        // Guardar en localStorage para exportación
        localStorage.setItem('bootcamp_graph_export', JSON.stringify(bootcampGraph))
        localStorage.setItem('bootcamp_title_export', bootcampTitle)

        alert(`📊 Grafo listo para exportar.\n\n` +
            `Nodos: ${bootcampGraph.nodes.length}\n` +
            `Edges: ${bootcampGraph.edges.length}\n` +
            `Módulos: ${modules.length}\n\n` +
            `Usa el botón "Exportar a Gephi" en la pantalla principal.`)
    }

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p>Cargando grafo del bootcamp...</p>
            </div>
        )
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>← Volver al Dashboard</button>
                <div>
                    <h1 style={styles.title}>📊 Grafo Global del Bootcamp</h1>
                    <p style={styles.subtitle}>{bootcampTitle}</p>
                </div>
                <div style={styles.stats}>
                    <span style={styles.statBadge}>📦 {bootcampGraph?.nodes.length || 0} nodos</span>
                    <span style={styles.statBadge}>🔗 {bootcampGraph?.edges.length || 0} edges</span>
                    <span style={styles.statBadge}>📚 {modules.length} módulos</span>
                </div>
            </div>

            <div style={styles.toolbar}>
                <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Filtrar por módulo:</label>
                    <select
                        value={filterModule || ''}
                        onChange={(e) => setFilterModule(e.target.value ? Number(e.target.value) : null)}
                        style={styles.filterSelect}
                    >
                        <option value="">Todos los módulos</option>
                        {modules.map(m => (
                            <option key={m.order} value={m.order}>
                                Módulo {m.order}: {m.title.substring(0, 30)} ({m.nodeCount} nodos)
                            </option>
                        ))}
                    </select>
                </div>

                <label style={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={showOnlyIntermodule}
                        onChange={(e) => setShowOnlyIntermodule(e.target.checked)}
                    />
                    Mostrar solo edges entre módulos
                </label>

                <div style={styles.buttonGroup}>
                    <button onClick={handleFit} style={styles.actionBtn}>🔍 Centrar vista</button>
                    <button onClick={handleResetFilter} style={styles.actionBtn}>⟳ Resetear filtros</button>
                    <button onClick={handleExportToGephi} style={styles.exportBtn}>📊 Exportar a Gephi</button>
                </div>
            </div>

            <div style={styles.legend}>
                <span style={styles.legendTitle}>Módulos:</span>
                {modules.map(m => (
                    <div key={m.order} style={styles.legendItem}>
                        <div style={{...styles.legendColor, backgroundColor: m.color}} />
                        <span>M{m.order}: {m.title.substring(0, 25)}</span>
                        <span style={styles.legendWeight}>{Math.round(m.weight * 100)}%</span>
                    </div>
                ))}
            </div>

            <div style={styles.mainContainer}>
                <div ref={containerRef} style={styles.graphContainer} />

                {selectedNode && (
                    <div style={styles.sidePanel}>
                        <h3 style={styles.panelTitle}>📌 {selectedNode.label}</h3>
                        <div style={styles.panelContent}>
                            <p><strong>Curso:</strong> {selectedNode.courseTitle}</p>
                            <p><strong>Módulo:</strong> {selectedNode.moduleOrder}</p>
                            <p><strong>Dificultad:</strong> {
                                selectedNode.difficulty === 1 ? 'Básico' :
                                    selectedNode.difficulty === 2 ? 'Intermedio' :
                                        selectedNode.difficulty === 3 ? 'Avanzado' : 'Experto'
                            }</p>
                            <p><strong>Tema:</strong> {selectedNode.topic}</p>
                            <p><strong>Descripción:</strong> {selectedNode.description.substring(0, 150)}...</p>
                            <div style={styles.weightBar}>
                                <span>Peso del módulo:</span>
                                <div style={styles.barTrack}>
                                    <div style={{...styles.barFill, width: `${selectedNode.moduleWeight * 100}%`}} />
                                </div>
                                <span>{Math.round(selectedNode.moduleWeight * 100)}%</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedNode(null)}
                            style={styles.closePanelBtn}
                        >
                            Cerrar
                        </button>
                    </div>
                )}
            </div>

            <div style={styles.footer}>
                <p>💡 Los edges rojos representan dependencias entre módulos (prerrequisitos entre cursos)</p>
                <p>🎨 Cada color representa un módulo diferente del bootcamp</p>
                <p>📏 El tamaño del nodo indica la importancia relativa en su módulo</p>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: '#F1EFE8',
        overflow: 'hidden'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        background: '#1E3A5F',
        flexWrap: 'wrap',
        gap: 12
    },
    backBtn: {
        background: 'none',
        border: '1px solid rgba(255,255,255,0.3)',
        color: '#fff',
        padding: '6px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13
    },
    title: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        margin: 0
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        margin: '2px 0 0'
    },
    stats: {
        display: 'flex',
        gap: 12
    },
    statBadge: {
        background: 'rgba(255,255,255,0.2)',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        color: '#fff'
    },
    toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '12px 24px',
        background: '#fff',
        borderBottom: '1px solid #D3D1C7',
        flexWrap: 'wrap'
    },
    filterGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
    },
    filterLabel: {
        fontSize: 13,
        fontWeight: 500,
        color: '#2C2C2A'
    },
    filterSelect: {
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #D3D1C7',
        fontSize: 13,
        background: '#fff',
        minWidth: 200
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        cursor: 'pointer'
    },
    buttonGroup: {
        display: 'flex',
        gap: 8,
        marginLeft: 'auto'
    },
    actionBtn: {
        padding: '6px 12px',
        background: '#E8E6E1',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12
    },
    exportBtn: {
        padding: '6px 12px',
        background: '#9B59B6',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12
    },
    legend: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 24px',
        background: '#F9F9F8',
        borderBottom: '1px solid #E8E6E1',
        flexWrap: 'wrap',
        fontSize: 12
    },
    legendTitle: {
        fontWeight: 600,
        color: '#1E3A5F'
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
    },
    legendColor: {
        width: 14,
        height: 14,
        borderRadius: '50%'
    },
    legendWeight: {
        fontSize: 10,
        color: '#1D9E75',
        marginLeft: 4
    },
    mainContainer: {
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0
    },
    graphContainer: {
        flex: 1,
        background: '#fff',
        position: 'relative',
        height: '100%'
    },
    sidePanel: {
        width: 320,
        background: '#fff',
        borderLeft: '1px solid #D3D1C7',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
    },
    panelTitle: {
        fontSize: 16,
        fontWeight: 700,
        color: '#1E3A5F',
        margin: '0 0 12px'
    },
    panelContent: {
        flex: 1,
        fontSize: 13,
        color: '#2C2C2A',
        lineHeight: 1.5
    },
    weightBar: {
        marginTop: 12,
        padding: '8px 0'
    },
    barTrack: {
        height: 6,
        background: '#E8E6E1',
        borderRadius: 3,
        overflow: 'hidden',
        margin: '4px 0'
    },
    barFill: {
        height: '100%',
        background: '#1D9E75',
        borderRadius: 3
    },
    closePanelBtn: {
        marginTop: 16,
        padding: '8px',
        background: '#E8E6E1',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12
    },
    footer: {
        padding: '8px 24px',
        background: '#F1EFE8',
        borderTop: '1px solid #D3D1C7',
        fontSize: 11,
        color: '#888780',
        display: 'flex',
        gap: 24
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 16
    },
    spinner: {
        width: 40,
        height: 40,
        border: '3px solid #E8E6E1',
        borderTop: '3px solid #1E3A5F',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    }
}

// Añadir animación al documento
if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `
    document.head.appendChild(style)
}