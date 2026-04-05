import {useEffect, useState, useRef} from 'react'
import {useParams, useNavigate} from 'react-router-dom'
import Cytoscape from 'cytoscape'
import {getGraph, getStudentMastery, getGaps, recordEvent, updateNodePosition, getNodeContent} from '../lib/api'

interface MasteryNode {
    node_id: string
    label: string
    mastery_score: number
    attempts: number
    level: string
}

interface Gap {
    node_id: string
    label: string
    severity: number
}

interface NodeContent {
    explanation: string
    example: string
    question: string
    options: string[]
    correct_answer: number
}

function masteryColor(score: number): string {
    if (score >= 0.8) return '#1D9E75'
    if (score >= 0.6) return '#5DCAA5'
    if (score >= 0.3) return '#FAC775'
    if (score > 0) return '#F0997B'
    return '#D3D1C7'
}

function getMasteryMessage(score: number, label: string): string {
    if (score >= 0.8) return `🎉 ¡Excelente! Has dominado "${label}". ¡Sigue así!`
    if (score >= 0.6) return `📚 Vas muy bien con "${label}". ¡Continúa practicando!`
    if (score >= 0.3) return `📖 Estás progresando en "${label}". ¡Sigue adelante!`
    if (score > 0) return `🌱 Has comenzado con "${label}". ¡Cada paso cuenta!`
    return `⭐ ¡Comienza con "${label}"! Es un concepto fundamental.`
}

export default function GraphView() {
    const {courseId} = useParams<{ courseId: string }>()
    const navigate = useNavigate()

    const containerRef = useRef<HTMLDivElement>(null)
    const cyRef = useRef<Cytoscape.Core | null>(null)
    const masteryRef = useRef<Record<string, MasteryNode>>({})
    const graphRef = useRef<any>(null)
    const saveTimeoutRef = useRef<Record<string, number>>({})

    const [selected, setSelected] = useState<any>(null)
    const [summary, setSummary] = useState<any>(null)
    const [gaps, setGaps] = useState<Gap[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [nextRecommended, setNextRecommended] = useState<any>(null)
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
    const [courseProgress, setCourseProgress] = useState<number>(0)
    const [showContentModal, setShowContentModal] = useState(false)
    const [nodeContent, setNodeContent] = useState<NodeContent | null>(null)
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
    const [showAnswerFeedback, setShowAnswerFeedback] = useState(false)

    const saveNodePosition = async (nodeId: string, position: { x: number; y: number }) => {
        if (!courseId) return
        if (saveTimeoutRef.current[nodeId]) {
            clearTimeout(saveTimeoutRef.current[nodeId])
        }
        saveTimeoutRef.current[nodeId] = setTimeout(async () => {
            try {
                await updateNodePosition(courseId, nodeId, position)
                console.log(`Posición guardada para nodo ${nodeId}:`, position)
            } catch (error) {
                console.error(`Error guardando posición del nodo ${nodeId}:`, error)
            }
            delete saveTimeoutRef.current[nodeId]
        }, 500)
    }

    const calculateProgress = (mastery: Record<string, MasteryNode>, totalNodes: number) => {
        if (totalNodes === 0) return 0
        const masteredCount = Object.values(mastery).filter(m => m.mastery_score >= 0.8).length
        return Math.round((masteredCount / totalNodes) * 100)
    }

    const getNextRecommendedConcept = (mastery: Record<string, MasteryNode>, graph: any) => {
        if (!graph || !graph.nodes) return null
        const notMastered = graph.nodes
            .filter((n: any) => {
                const m = mastery[n.data.id]
                return !m || m.mastery_score < 0.8
            })
            .sort((a: any, b: any) => (a.data.topo_order || 999) - (b.data.topo_order || 999))
        return notMastered[0]?.data || null
    }

    const loadNodeContent = async (nodeId: string, nodeLabel: string) => {
        try {
            const content = await getNodeContent(courseId!, nodeId, nodeLabel)
            setNodeContent(content)
            setShowContentModal(true)
            setSelectedAnswer(null)
            setShowAnswerFeedback(false)
        } catch (error) {
            console.error('Error loading node content:', error)
            // Fallback content
            setNodeContent({
                explanation: `Este es el concepto "${nodeLabel}". Practica para mejorarlo.`,
                example: `Ejemplo práctico de "${nodeLabel}".`,
                question: `¿Qué aprendiste sobre "${nodeLabel}"?`,
                options: ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'],
                correct_answer: 0
            })
            setShowContentModal(true)
        }
    }

    const handleAnswerQuestion = () => {
        if (selectedAnswer === null) {
            alert('Selecciona una respuesta')
            return
        }

        const isCorrect = selectedAnswer === nodeContent?.correct_answer
        setShowAnswerFeedback(true)

        setTimeout(() => {
            setShowContentModal(false)
            if (isCorrect) {
                handleAnswer(true)
            } else {
                alert(`Respuesta incorrecta. La correcta es: ${nodeContent?.options[nodeContent?.correct_answer || 0]}`)
            }
        }, 1500)
    }

    const initCytoscape = () => {
        if (!containerRef.current || !graphRef.current) return
        containerRef.current.innerHTML = ''
        if (cyRef.current) {
            cyRef.current.destroy()
            cyRef.current = null
        }

        const graph = graphRef.current
        const mastery = masteryRef.current

        const elements = [
            ...graph.nodes.map((n: any) => {
                const score = mastery[n.data.id]?.mastery_score ?? 0
                const topoOrder = n.data.topo_order ?? -1
                const orderLabel = topoOrder >= 0 ? `${topoOrder + 1}. ` : ''
                return {
                    data: {
                        id: n.data.id,
                        label: `${orderLabel}${n.data.label}`,
                        description: n.data.description,
                        difficulty: n.data.difficulty,
                        pagerank: n.data.pagerank,
                        mastery: score,
                        topo_order: topoOrder,
                    },
                    position: {x: n.position.x, y: n.position.y},
                }
            }),
            ...graph.edges.map((e: any) => ({data: e.data})),
        ]

        const cy = Cytoscape({
            container: containerRef.current,
            elements,
            pixelRatio: 1,
            style: [
                {
                    selector: 'node',
                    style: {
                        label: 'data(label)',
                        'background-color': (ele: any) => masteryColor(ele.data('mastery')),
                        color: '#1E3A5F',
                        'font-size': 12,
                        'font-weight': 'bold',
                        'text-valign': 'bottom',
                        'text-margin-y': 6,
                        width: (ele: any) => Math.max(40, 40 + (ele.data('pagerank') || 0) * 400),
                        height: (ele: any) => Math.max(40, 40 + (ele.data('pagerank') || 0) * 400),
                    },
                },
                {
                    selector: 'edge',
                    style: {
                        width: (ele: any) => (ele.data('strength') || 0.5) * 3,
                        'line-color': '#D3D1C7',
                        'target-arrow-color': '#D3D1C7',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        opacity: 0.7,
                    },
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 3,
                        'border-color': '#1E3A5F',
                    },
                },
                {
                    selector: 'node.mastered',
                    style: {
                        'border-width': 2,
                        'border-color': '#1D9E75',
                    },
                },
            ],
            layout: {
                name: 'preset',
                fit: true,
                padding: 50,
                animate: true,
                animationDuration: 500,
            },
            userZoomingEnabled: true,
            userPanningEnabled: true,
            boxSelectionEnabled: false,
        })

        cy.on('dragfree', 'node', (event: any) => {
            const node = event.target
            const nodeId = node.data('id')
            const position = node.position()
            saveNodePosition(nodeId, position)
        })

        cy.on('tap', 'node', async (evt: any) => {
            const data = evt.target.data()
            const m = masteryRef.current[data.id]
            setSelected({...data, masteryData: m})
            setFeedbackMessage(getMasteryMessage(m?.mastery_score ?? 0, data.label))
            await loadNodeContent(data.id, data.label)
        })

        cy.on('tap', (evt: any) => {
            if (evt.target === cy) {
                setSelected(null)
                setFeedbackMessage(null)
            }
        })

        cyRef.current = cy

        setTimeout(() => {
            cy.resize()
            cy.fit(undefined, 50)
        }, 100)
    }

    const handleAnswer = async (correct: boolean) => {
        if (!selected || !courseId || !currentUserId) return
        const previousScore = selected.masteryData?.mastery_score ?? 0

        await recordEvent({
            user_id: currentUserId,
            node_id: selected.id,
            correct,
            course_id: courseId,
        })

        try {
            const [masteryData, gapsData] = await Promise.all([
                getStudentMastery(currentUserId, courseId),
                getGaps(currentUserId, courseId),
            ])

            const map: Record<string, MasteryNode> = {}
            masteryData.nodes.forEach((n: MasteryNode) => {
                map[n.node_id] = n
            })
            masteryRef.current = map
            setSummary(masteryData.summary)
            setGaps(gapsData.gaps.slice(0, 5))

            const progress = calculateProgress(map, graphRef.current?.summary.total_nodes || 0)
            setCourseProgress(progress)

            const next = getNextRecommendedConcept(map, graphRef.current)
            setNextRecommended(next)

            if (cyRef.current) {
                cyRef.current.nodes().forEach((node: any) => {
                    const nodeId = node.data('id')
                    const score = map[nodeId]?.mastery_score ?? 0
                    node.data('mastery', score)
                    node.style('background-color', masteryColor(score))
                    if (score >= 0.8) {
                        node.addClass('mastered')
                    } else {
                        node.removeClass('mastered')
                    }
                })
            }

            const updatedMastery = masteryRef.current[selected.id]
            const newScore = updatedMastery?.mastery_score ?? 0
            setSelected((prev: any) => ({...prev, masteryData: updatedMastery}))

            if (newScore >= 0.8 && previousScore < 0.8) {
                const masteredCount = Object.values(map).filter(m => m.mastery_score >= 0.8).length
                const totalNodes = graphRef.current?.summary.total_nodes || 0
                const isComplete = masteredCount === totalNodes

                let message = `🎉 ¡Felicidades! Has dominado "${selected.label}". `
                if (next && !isComplete) {
                    message += `Siguiente concepto recomendado: "${next.label}".`
                } else if (isComplete) {
                    message += `🎓 ¡Felicidades! Has completado TODOS los conceptos del curso. ¡Excelente trabajo!`
                }
                setFeedbackMessage(message)
                setTimeout(() => {
                    alert(message)
                }, 100)
            } else {
                setFeedbackMessage(getMasteryMessage(newScore, selected.label))
            }
        } catch (e) {
            console.error('Error recargando datos:', e)
        }
    }

    useEffect(() => {
        const init = async () => {
            const token = localStorage.getItem('google_token')
            if (!token) {
                window.location.href = 'https://mygateway.up.railway.app/auth/google'
                return
            }

            try {
                const payload = JSON.parse(atob(token.split('.')[1]))
                const email = payload.email

                const userResponse = await fetch(`https://mygateway.up.railway.app/api/user/by-email/${email}`)
                if (!userResponse.ok) {
                    throw new Error('Usuario no encontrado en la base de datos')
                }
                const userData = await userResponse.json()
                const userId = userData.id
                setCurrentUserId(userId)

                await fetch(`https://mygateway.up.railway.app/enroll/${courseId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                })

                setLoading(true)
                const graphData = await getGraph(courseId!)
                graphRef.current = graphData

                const [masteryData, gapsData] = await Promise.all([
                    getStudentMastery(userId, courseId!),
                    getGaps(userId, courseId!),
                ])

                const map: Record<string, MasteryNode> = {}
                masteryData.nodes.forEach((n: MasteryNode) => {
                    map[n.node_id] = n
                })
                masteryRef.current = map
                setSummary(masteryData.summary)
                setGaps(gapsData.gaps.slice(0, 5))

                const progress = calculateProgress(map, graphData.summary.total_nodes)
                setCourseProgress(progress)

                const next = getNextRecommendedConcept(map, graphData)
                setNextRecommended(next)

                setTimeout(() => {
                    initCytoscape()
                }, 100)
            } catch (error) {
                console.error('Error cargando datos:', error)
            } finally {
                setLoading(false)
            }
        }

        init()

        return () => {
            if (cyRef.current) {
                cyRef.current.destroy()
                cyRef.current = null
            }
            Object.values(saveTimeoutRef.current).forEach(timeout => clearTimeout(timeout))
            saveTimeoutRef.current = {}
        }
    }, [courseId])

    if (loading) return <div style={s.center}><p style={s.muted}>Cargando...</p></div>

    const selectedMastery = selected?.masteryData
    const isComplete = courseProgress === 100

    return (
        <div style={s.page}>
            <div style={s.header}>
                <button onClick={() => navigate('/dashboard')} style={s.back}>← Volver</button>
                <div style={{flex: 1}}>
                    <h1 style={s.title}>{graphRef.current?.course.title}</h1>
                    <p style={s.subtitle}>
                        {graphRef.current?.summary.total_nodes} conceptos
                        · {graphRef.current?.summary.total_edges} prerequisitos
                    </p>
                </div>
                <div style={s.progressContainer}>
                    <div style={s.progressBar}>
                        <div style={{...s.progressFill, width: `${courseProgress}%`}} />
                    </div>
                    <span style={s.progressText}>{courseProgress}% completado</span>
                </div>
                {summary && (
                    <div style={s.statsRow}>
                        <div style={s.stat}>
                            <span style={s.statNum}>{Math.round(summary.avg_mastery * 100)}%</span>
                            <span style={s.statLbl}>Mastery</span>
                        </div>
                        <div style={s.stat}>
                            <span style={{...s.statNum, color: '#1D9E75'}}>{summary.mastered}</span>
                            <span style={s.statLbl}>Dominados</span>
                        </div>
                        <div style={s.stat}>
                            <span style={{...s.statNum, color: '#E24B4A'}}>{summary.not_started}</span>
                            <span style={s.statLbl}>Sin iniciar</span>
                        </div>
                    </div>
                )}
            </div>

            {isComplete && (
                <div style={s.completeBanner}>
                    🎓 ¡Felicidades! Has completado el curso "{graphRef.current?.course.title}" al 100%. 🎉
                </div>
            )}

            <div style={s.body}>
                <div ref={containerRef} style={s.graphContainer}/>
                <div style={s.panel}>
                    {selected ? (
                        <div style={s.nodeCard}>
                            <h2 style={s.nodeTitle}>{selected.label}</h2>
                            <div style={s.masteryBar}>
                                <div style={s.masteryBarLabel}>
                                    <span>Mastery</span>
                                    <span style={{fontWeight: 600}}>
                                        {Math.round((selectedMastery?.mastery_score ?? 0) * 100)}%
                                    </span>
                                </div>
                                <div style={s.masteryTrack}>
                                    <div style={{
                                        ...s.masteryFill,
                                        width: `${(selectedMastery?.mastery_score ?? 0) * 100}%`,
                                        background: masteryColor(selectedMastery?.mastery_score ?? 0),
                                    }}/>
                                </div>
                                <div style={s.masteryLevel}>
                                    {selectedMastery?.level ?? 'not_started'} · {selectedMastery?.attempts ?? 0} intentos
                                </div>
                            </div>
                            <p style={s.nodeDesc}>{selected.description}</p>
                            {feedbackMessage && (
                                <div style={s.feedbackMessage}>
                                    {feedbackMessage}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={s.panelEmpty}>
                            <p style={s.muted}>Haz clic en un nodo para ver su mastery</p>
                            {nextRecommended && !isComplete && (
                                <div style={s.nextRecommended}>
                                    📍 Siguiente recomendado: <strong>{nextRecommended.label}</strong>
                                </div>
                            )}
                            {isComplete && (
                                <div style={s.completedMessage}>
                                    🎓 ¡Curso completado! Revisa tu progreso en el dashboard.
                                </div>
                            )}
                        </div>
                    )}

                    {gaps.length > 0 && (
                        <div style={s.gapsSection}>
                            <h3 style={s.gapsTitle}>Gaps críticos</h3>
                            {gaps.map((gap) => (
                                <div key={gap.node_id} style={s.gapRow}>
                                    <div style={s.gapLabel}>{gap.label}</div>
                                    <div style={s.gapBar}>
                                        <div style={{...s.gapFill, width: `${Math.min(gap.severity * 100, 100)}%`}}/>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={s.legend}>
                        <p style={s.legendTitle}>Mastery</p>
                        {[
                            {color: '#D3D1C7', label: 'Sin iniciar'},
                            {color: '#F0997B', label: 'Iniciado'},
                            {color: '#FAC775', label: 'En progreso'},
                            {color: '#5DCAA5', label: 'Aprendiendo'},
                            {color: '#1D9E75', label: 'Dominado'},
                        ].map((item) => (
                            <div key={item.label} style={s.legendRow}>
                                <div style={{...s.legendDot, background: item.color}}/>
                                <span style={s.legendLabel}>{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal de contenido educativo */}
            {showContentModal && nodeContent && (
                <div style={s.modalOverlay}>
                    <div style={s.modalContent}>
                        <h3 style={s.modalTitle}>{selected?.label}</h3>

                        <div style={s.modalSection}>
                            <h4>📖 Explicación</h4>
                            <p>{nodeContent.explanation}</p>
                        </div>

                        <div style={s.modalSection}>
                            <h4>💡 Ejemplo</h4>
                            <p>{nodeContent.example}</p>
                        </div>

                        <div style={s.modalSection}>
                            <h4>❓ Pregunta de práctica</h4>
                            <p>{nodeContent.question}</p>
                            <div style={s.optionsContainer}>
                                {nodeContent.options.map((opt, idx) => (
                                    <label key={idx} style={s.optionLabel}>
                                        <input
                                            type="radio"
                                            name="answer"
                                            value={idx}
                                            checked={selectedAnswer === idx}
                                            onChange={() => setSelectedAnswer(idx)}
                                            disabled={showAnswerFeedback}
                                        />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                            {!showAnswerFeedback ? (
                                <button style={s.submitBtn} onClick={handleAnswerQuestion}>
                                    Verificar respuesta
                                </button>
                            ) : (
                                <div style={s.answerFeedback}>
                                    {selectedAnswer === nodeContent.correct_answer ? (
                                        <p style={s.correctFeedback}>✅ ¡Correcto! Bien hecho.</p>
                                    ) : (
                                        <p style={s.wrongFeedback}>❌ Incorrecto. La respuesta correcta es: {nodeContent.options[nodeContent.correct_answer]}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <button style={s.closeModalBtn} onClick={() => setShowContentModal(false)}>
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F1EFE8', overflow: 'hidden' },
    header: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', background: '#1E3A5F', flexWrap: 'wrap' },
    back: { background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
    title: { fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 },
    subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' },
    progressContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 100 },
    progressBar: { width: 100, height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', background: '#1D9E75', borderRadius: 3, transition: 'width 0.3s' },
    progressText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
    statsRow: { display: 'flex', gap: 20 },
    stat: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
    statNum: { fontSize: 20, fontWeight: 700, color: '#fff' },
    statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
    body: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
    graphContainer: { flex: 1, background: '#fff', position: 'relative', height: '100%', width: '100%' },
    panel: { width: 280, background: '#fff', borderLeft: '1px solid #D3D1C7', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' },
    nodeCard: { display: 'flex', flexDirection: 'column', gap: 10 },
    nodeTitle: { fontSize: 16, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    nodeDesc: { fontSize: 13, color: '#5F5E5A', lineHeight: 1.5, margin: 0 },
    masteryBar: { display: 'flex', flexDirection: 'column', gap: 4 },
    masteryBarLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5F5E5A' },
    masteryTrack: { height: 8, background: '#F1EFE8', borderRadius: 4, overflow: 'hidden' },
    masteryFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
    masteryLevel: { fontSize: 11, color: '#888780' },
    feedbackMessage: { fontSize: 12, color: '#1D9E75', background: '#E1F5EE', padding: '10px 12px', borderRadius: 8, marginTop: 10, textAlign: 'center' },
    gapsSection: { borderTop: '1px solid #F1EFE8', paddingTop: 12 },
    gapsTitle: { fontSize: 12, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' },
    gapRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
    gapLabel: { fontSize: 12, color: '#2C2C2A', width: 80, flexShrink: 0 },
    gapBar: { flex: 1, height: 6, background: '#F1EFE8', borderRadius: 3, overflow: 'hidden' },
    gapFill: { height: '100%', background: '#E24B4A', borderRadius: 3 },
    legend: { marginTop: 'auto', borderTop: '1px solid #D3D1C7', paddingTop: 12 },
    legendTitle: { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', margin: '0 0 8px' },
    legendRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
    legendDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
    legendLabel: { fontSize: 12, color: '#5F5E5A' },
    panelEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 },
    nextRecommended: { fontSize: 12, color: '#1D9E75', textAlign: 'center', marginTop: 16, padding: 8, background: '#E1F5EE', borderRadius: 8 },
    completedMessage: { fontSize: 12, color: '#1D9E75', textAlign: 'center', marginTop: 16, padding: 8, background: '#E1F5EE', borderRadius: 8 },
    completeBanner: { background: '#1D9E75', color: '#fff', textAlign: 'center', padding: '8px 16px', fontSize: 14, fontWeight: 600 },
    center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted: { color: '#888780', fontSize: 14, textAlign: 'center' },
    error: { color: '#A32D2D', fontSize: 14 },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: '#fff', borderRadius: 16, padding: 24, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' },
    modalTitle: { fontSize: 20, fontWeight: 700, color: '#1E3A5F', margin: '0 0 16px' },
    modalSection: { marginBottom: 20 },
    optionsContainer: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 12 },
    optionLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
    submitBtn: { background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 12 },
    closeModalBtn: { background: '#E8E6E1', color: '#1E3A5F', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, marginTop: 16, width: '100%' },
    answerFeedback: { marginTop: 12, padding: 10, borderRadius: 8 },
    correctFeedback: { color: '#1D9E75', fontWeight: 600, margin: 0 },
    wrongFeedback: { color: '#E24B4A', fontWeight: 600, margin: 0 },
}