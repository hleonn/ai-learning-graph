import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Cytoscape from 'cytoscape'
import type { BootcampGraph, GlobalNode } from '../utils/bootcampGraphBuilder'
import { generateLearningPath } from '../utils/bootcampPathFinder'

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

function getNodeSize(moduleWeight: number, difficulty: number, isMilestone: boolean): number {
    let baseSize = 25 + (moduleWeight * 30) + (difficulty * 5)
    if (isMilestone) baseSize += 5
    return Math.min(Math.max(baseSize, 20), 70)
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
    const [error, setError] = useState<string | null>(null)
    const [learningPath, setLearningPath] = useState<{
        order: string[]
        levels: Map<string, number>
        milestones: string[]
        startNodes: string[]
        estimatedDuration: number
    } | null>(null)
    const [showLearningPanel, setShowLearningPanel] = useState(true)

    // Calcular información de aprendizaje cuando se carga el grafo
    useEffect(() => {
        if (!bootcampGraph) return

        try {
            const path = generateLearningPath(bootcampGraph.nodes, bootcampGraph.edges)
            setLearningPath(path)
        } catch (err) {
            console.error('Error calculating learning path:', err)
        }
    }, [bootcampGraph])

    // Cargar datos del bootcamp desde la ubicación (state) o desde localStorage
    useEffect(() => {
        const loadBootcampGraph = async () => {
            setLoading(true)
            setError(null)
            try {
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
                setError('Error al cargar el grafo del bootcamp')
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
            try {
                cyRef.current.destroy()
            } catch (e) {
                console.warn('Error destroying previous cytoscape instance:', e)
            }
            cyRef.current = null
        }

        try {
            const elements: any[] = []

            // Determinar qué nodos incluir
            let filteredNodeIds: Set<string>
            let filteredNodes: GlobalNode[]

            if (filterModule !== null) {
                filteredNodes = bootcampGraph.nodes.filter(n => n.moduleOrder === filterModule)
                filteredNodeIds = new Set(filteredNodes.map(n => n.id))
            } else {
                filteredNodes = bootcampGraph.nodes
                filteredNodeIds = new Set(filteredNodes.map(n => n.id))
            }

            // Filtrar edges: SOLO aquellos donde source y target existen en los nodos filtrados
            let filteredEdges = bootcampGraph.edges.filter(edge => {
                const sourceExists = filteredNodeIds.has(edge.source)
                const targetExists = filteredNodeIds.has(edge.target)
                return sourceExists && targetExists
            })

            // Aplicar filtro adicional de "solo intermodule"
            if (showOnlyIntermodule) {
                filteredEdges = filteredEdges.filter(e => e.type === 'intermodule')
            }

            // Crear conjuntos para referencia rápida
            const rootSet = new Set(learningPath?.startNodes || [])
            const milestoneSet = new Set(learningPath?.milestones || [])
            const depthMap = learningPath?.levels || new Map<string, number>()

            // Añadir nodos
            for (const node of filteredNodes) {
                const isRoot = rootSet.has(node.id)
                const isMilestone = milestoneSet.has(node.id)
                const depth = depthMap.get(node.id) || 0

                elements.push({
                    data: {
                        id: node.id,
                        label: node.label,
                        description: node.description,
                        difficulty: node.difficulty,
                        moduleOrder: node.moduleOrder,
                        courseTitle: node.courseTitle,
                        moduleWeight: node.moduleWeight,
                        originalId: node.originalId,
                        isRoot: isRoot,
                        isMilestone: isMilestone,
                        depth: depth
                    },
                    position: { x: node.position_x, y: node.position_y },
                    classes: `module-${node.moduleOrder} ${isRoot ? 'root-node' : ''} ${isMilestone ? 'milestone-node' : ''}`
                })
            }

            // Añadir edges
            for (const edge of filteredEdges) {
                const isIntermodule = edge.type === 'intermodule'
                const edgeColor = isIntermodule ? '#E24B4A' : '#D3D1C7'
                const edgeWidth = isIntermodule ? 4 : 2

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
                        'opacity': isIntermodule ? 0.9 : 0.5
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
                                const isMilestone = ele.data('isMilestone')
                                return getNodeSize(moduleWeight, difficulty, isMilestone)
                            },
                            'height': (ele: any) => {
                                const moduleWeight = ele.data('moduleWeight') || 0.2
                                const difficulty = ele.data('difficulty') || 3
                                const isMilestone = ele.data('isMilestone')
                                return getNodeSize(moduleWeight, difficulty, isMilestone)
                            },
                            'border-width': (ele: any) => {
                                if (ele.data('isRoot')) return 5
                                if (ele.data('isMilestone')) return 4
                                return 3
                            },
                            'border-color': (ele: any) => {
                                if (ele.data('isRoot')) return '#FFD700'
                                if (ele.data('isMilestone')) return '#9B59B6'
                                return '#fff'
                            },
                            'border-opacity': 0.9,

                        }
                    },
                    {
                        selector: 'node:selected',
                        style: {
                            'border-width': 6,
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

            // Centrar en el primer nodo raíz después de cargar
            setTimeout(() => {
                if (learningPath?.startNodes.length && cyRef.current) {
                    const firstRoot = cyRef.current.$id(learningPath.startNodes[0])
                    if (firstRoot && firstRoot.length > 0) {
                        cyRef.current.center(firstRoot)
                        cyRef.current.zoom(1.2)
                        // Resaltar el nodo raíz temporalmente
                        firstRoot.style('border-width', 6)
                        firstRoot.style('border-color', '#FFD700')
                        setTimeout(() => {
                            if (firstRoot && firstRoot.length > 0) {
                                firstRoot.style('border-width', 5)
                            }
                        }, 3000)
                    } else {
                        cyRef.current.fit(undefined, 50)
                    }
                } else if (cyRef.current) {
                    cyRef.current.fit(undefined, 50)
                }
                cyRef.current?.resize()
            }, 200)

        } catch (err) {
            console.error('Error creating cytoscape graph:', err)
            setError('Error al renderizar el grafo. Los datos pueden estar corruptos.')
        }

    }, [bootcampGraph, loading, filterModule, showOnlyIntermodule, learningPath])

    const handleFit = () => {
        if (cyRef.current) {
            try {
                cyRef.current.fit(undefined, 50)
                cyRef.current.zoom(1)
            } catch (e) {
                console.warn('Error fitting graph:', e)
            }
        }
    }

    const handleResetFilter = () => {
        setFilterModule(null)
        setShowOnlyIntermodule(false)
    }

    const handleCenterOnNode = (nodeId: string) => {
        if (cyRef.current) {
            const node = cyRef.current.$id(nodeId)
            if (node && node.length > 0) {
                cyRef.current.center(node)
                cyRef.current.zoom(1.5)
                node.style('border-width', 6)
                node.style('border-color', '#FFD700')
                setTimeout(() => {
                    if (node && node.length > 0) {
                        const isRoot = node.data('isRoot')
                        node.style('border-width', isRoot ? 5 : 3)
                    }
                }, 2000)
            }
        }
    }

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p>Cargando grafo del bootcamp...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div style={styles.errorContainer}>
                <p style={styles.errorMessage}>❌ {error}</p>
                <button onClick={() => navigate(-1)} style={styles.backBtn}>← Volver al Creador de Bootcamps</button>
            </div>
        )
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <button onClick={() => navigate(-1)} style={styles.backBtn}>← Volver</button>
                <div>
                    <h1 style={styles.title}>📊 Grafo Global del Bootcamp</h1>
                    <p style={styles.subtitle}>{bootcampTitle}</p>
                </div>
                <div style={styles.stats}>
                    <span style={styles.statBadge}>📦 {bootcampGraph?.nodes.length || 0} nodos</span>
                    <span style={styles.statBadge}>🔗 {bootcampGraph?.edges.length || 0} edges</span>
                    <span style={styles.statBadge}>📚 {modules.length} módulos</span>
                    <span style={styles.statBadge}>⭐ {learningPath?.startNodes.length || 0} inicio</span>
                    <span style={styles.statBadge}>⏱️ {learningPath?.estimatedDuration || 0}h</span>
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

                <button onClick={() => setShowLearningPanel(!showLearningPanel)} style={styles.actionBtn}>
                    {showLearningPanel ? '📖 Ocultar ruta' : '📖 Mostrar ruta'}
                </button>

                <div style={styles.buttonGroup}>
                    <button onClick={handleFit} style={styles.actionBtn}>🔍 Centrar vista</button>
                    <button onClick={handleResetFilter} style={styles.actionBtn}>⟳ Resetear filtros</button>
                </div>
            </div>

            {/* Panel de ruta de aprendizaje */}
            {showLearningPanel && learningPath && (
                <div style={styles.learningPanel}>
                    <div style={styles.learningPanelHeader}>
                        <span>📖 Ruta de Aprendizaje Recomendada</span>
                        <span style={styles.learningPanelDuration}>⏱️ Duración estimada: {learningPath.estimatedDuration} horas</span>
                    </div>
                    <div style={styles.learningPanelContent}>
                        <div style={styles.startNodesSection}>
                            <strong>⭐ Puntos de inicio ({learningPath.startNodes.length}):</strong>
                            <div style={styles.startNodesList}>
                                {learningPath.startNodes.slice(0, 5).map(nodeId => {
                                    const node = bootcampGraph?.nodes.find(n => n.id === nodeId)
                                    return node ? (
                                        <button
                                            key={nodeId}
                                            style={styles.startNodeBtn}
                                            onClick={() => handleCenterOnNode(nodeId)}
                                        >
                                            {node.courseTitle}: {node.label.substring(0, 25)}
                                        </button>
                                    ) : null
                                })}
                                {learningPath.startNodes.length > 5 && (
                                    <span style={styles.moreText}>+{learningPath.startNodes.length - 5} más</span>
                                )}
                            </div>
                        </div>

                        <div style={styles.milestonesSection}>
                            <strong>🏆 Hitos importantes ({learningPath.milestones.length}):</strong>
                            <div style={styles.milestonesList}>
                                {learningPath.milestones.slice(0, 5).map(nodeId => {
                                    const node = bootcampGraph?.nodes.find(n => n.id === nodeId)
                                    return node ? (
                                        <button
                                            key={nodeId}
                                            style={styles.milestoneBtn}
                                            onClick={() => handleCenterOnNode(nodeId)}
                                        >
                                            {node.label.substring(0, 30)}
                                        </button>
                                    ) : null
                                })}
                                {learningPath.milestones.length > 5 && (
                                    <span style={styles.moreText}>+{learningPath.milestones.length - 5} más</span>
                                )}
                            </div>
                        </div>

                        <div style={styles.orderSection}>
                            <strong>📋 Orden sugerido (primeros 10 conceptos):</strong>
                            <ol style={styles.orderList}>
                                {learningPath.order.slice(0, 10).map((nodeId, ) => {
                                    const node = bootcampGraph?.nodes.find(n => n.id === nodeId)
                                    return node ? (
                                        <li key={nodeId} style={styles.orderItem}>
                                            <button
                                                style={styles.orderNodeBtn}
                                                onClick={() => handleCenterOnNode(nodeId)}
                                            >
                                                {node.label}
                                            </button>
                                            <span style={styles.orderModule}>[{node.courseTitle.substring(0, 15)}]</span>
                                        </li>
                                    ) : null
                                })}
                                {learningPath.order.length > 10 && (
                                    <li style={styles.orderMore}>... y {learningPath.order.length - 10} conceptos más</li>
                                )}
                            </ol>
                        </div>
                    </div>
                </div>
            )}

            <div style={styles.legend}>
                <span style={styles.legendTitle}>Módulos:</span>
                {modules.slice(0, 6).map(m => (
                    <div key={m.order} style={styles.legendItem}>
                        <div style={{...styles.legendColor, backgroundColor: m.color}} />
                        <span>M{m.order}</span>
                    </div>
                ))}
                {modules.length > 6 && <span>+{modules.length - 6} más</span>}
                <div style={styles.legendDivider} />
                <div style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: '#FFD700', border: '2px solid #1E3A5F'}} />
                    <span>⭐ Inicio</span>
                </div>
                <div style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: '#9B59B6', }} />
                    <span>🏆 Hito</span>
                </div>
                <div style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: '#E24B4A'}} />
                    <span>🔗 Entre módulos</span>
                </div>
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
                            {learningPath?.startNodes.includes(selectedNode.id) && (
                                <p style={styles.rootBadge}>⭐ Este es un punto de inicio recomendado</p>
                            )}
                            {learningPath?.milestones.includes(selectedNode.id) && (
                                <p style={styles.milestoneBadge}>🏆 Este es un hito importante en el aprendizaje</p>
                            )}
                            <div style={styles.weightBar}>
                                <span>Peso del módulo:</span>
                                <div style={styles.barTrack}>
                                    <div style={{...styles.barFill, width: `${selectedNode.moduleWeight * 100}%`}} />
                                </div>
                                <span>{Math.round(selectedNode.moduleWeight * 100)}%</span>
                            </div>
                        </div>
                        <button onClick={() => setSelectedNode(null)} style={styles.closePanelBtn}>Cerrar</button>
                    </div>
                )}
            </div>

            <div style={styles.footer}>
                <p>💡 Los edges rojos representan dependencias entre módulos (prerrequisitos entre cursos)</p>
                <p>⭐ Nodos dorados con borde: puntos de inicio (sin dependencias previas)</p>
                <p>🏆 Nodos morados con borde: hitos importantes en el aprendizaje</p>
                <p>📖 El panel lateral muestra el orden recomendado para aprender</p>
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
        gap: 12,
        flexWrap: 'wrap'
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
    learningPanel: {
        background: '#fff',
        borderBottom: '2px solid #1E3A5F',
        maxHeight: 250,
        overflowY: 'auto'
    },
    learningPanelHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: '#1E3A5F',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600
    },
    learningPanelDuration: {
        fontSize: 11,
        fontWeight: 'normal',
        opacity: 0.8
    },
    learningPanelContent: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        padding: 16,
        fontSize: 12
    },
    startNodesSection: {
        borderRight: '1px solid #E8E6E1',
        paddingRight: 16
    },
    startNodesList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 8
    },
    startNodeBtn: {
        textAlign: 'left',
        padding: '4px 8px',
        background: '#FFF8E1',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 11,
        color: '#F5A623'
    },
    milestonesSection: {
        borderRight: '1px solid #E8E6E1',
        paddingRight: 16
    },
    milestonesList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 8
    },
    milestoneBtn: {
        textAlign: 'left',
        padding: '4px 8px',
        background: '#F3E5F5',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 11,
        color: '#9B59B6'
    },
    orderSection: {
        paddingRight: 16
    },
    orderList: {
        margin: '8px 0 0 20px',
        padding: 0
    },
    orderItem: {
        marginBottom: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap'
    },
    orderNodeBtn: {
        background: 'none',
        border: 'none',
        color: '#1E3A5F',
        cursor: 'pointer',
        fontSize: 11,
        textDecoration: 'underline'
    },
    orderModule: {
        fontSize: 10,
        color: '#888780'
    },
    orderMore: {
        color: '#888780',
        fontStyle: 'italic',
        marginTop: 4
    },
    moreText: {
        fontSize: 10,
        color: '#888780',
        marginTop: 4
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
    legendDivider: {
        width: 1,
        height: 20,
        background: '#D3D1C7'
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
    rootBadge: {
        marginTop: 8,
        padding: '6px 12px',
        background: '#FFF8E1',
        borderRadius: 8,
        color: '#F5A623',
        fontSize: 12,
        textAlign: 'center'
    },
    milestoneBadge: {
        marginTop: 8,
        padding: '6px 12px',
        background: '#F3E5F5',
        borderRadius: 8,
        color: '#9B59B6',
        fontSize: 12,
        textAlign: 'center'
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
        gap: 24,
        flexWrap: 'wrap'
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 16
    },
    errorContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 16
    },
    errorMessage: {
        color: '#E24B4A',
        fontSize: 14,
        background: '#FCEBEB',
        padding: '16px 24px',
        borderRadius: 8
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
        .root-node {
            animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
        }
    `
    document.head.appendChild(style)
}