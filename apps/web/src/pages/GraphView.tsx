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

interface Subtopic {
    label: string
    description: string
    difficulty: number
    prerequisites: string[]
}

interface Topic {
    topic_name: string
    subtopics: Subtopic[]
}

interface Phase {
    phase_number: number
    name: string
    months: string
    bloom_levels: string[]
    objective: string
    expected_outcomes: string[]
    skills: string[]
    tech_stack: string[]
    topics: Topic[]
}

interface RoadmapData {
    title: string
    duration_months: number
    phases: Phase[]
}

function getPhaseBorderColor(phase: number): string {
    switch(Number(phase)) {
        case 1: return '#4A90D9'
        case 2: return '#50E3C2'
        case 3: return '#F5A623'
        case 4: return '#D0021B'
        case 5: return '#9B59B6'
        default: return '#1E3A5F'
    }
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
    const [userRole, setUserRole] = useState<string>('student')
    const [nextRecommended, setNextRecommended] = useState<any>(null)
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
    const [courseProgress, setCourseProgress] = useState<number>(0)
    const [showContentModal, setShowContentModal] = useState(false)
    const [nodeContent, setNodeContent] = useState<NodeContent | null>(null)
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
    const [showAnswerFeedback, setShowAnswerFeedback] = useState(false)
    const [showLeftPanel, setShowLeftPanel] = useState(true)
    const [roadmap, setRoadmap] = useState<RoadmapData | null>(null)
    const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({})
    const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({})
    const [selectedPhase, setSelectedPhase] = useState<number | null>(null)

    const loadRoadmap = async () => {
        if (!courseId) return
        const token = localStorage.getItem('google_token')
        if (!token) return
        try {
            const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
                const courseData = await response.json()
                if (courseData.roadmap) {
                    setRoadmap(courseData.roadmap)
                    if (courseData.roadmap.phases && courseData.roadmap.phases.length > 0) {
                        setExpandedPhases({ [courseData.roadmap.phases[0].phase_number]: true })
                    }
                }
            }
        } catch (error) {
            console.error('Error loading roadmap:', error)
        }
    }

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

    const filterNodesByPhase = (phase: number | null) => {
        setSelectedPhase(phase)
        if (cyRef.current) {
            cyRef.current.nodes().forEach((node: any) => {
                const nodePhase = node.data('phase') || 1
                if (phase === null || nodePhase === phase) {
                    node.style('opacity', 1)
                    node.style('visibility', 'visible')
                    node.style('border-opacity', 0.8)
                } else {
                    node.style('opacity', 0.3)
                    node.style('visibility', 'visible')
                    node.style('border-opacity', 0.1)
                }
            })
        }
    }

    const resetFilter = () => {
        filterNodesByPhase(null)
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

    // const centerNode = (nodeId: string) => {
    //     if (cyRef.current) {
    //         const node = cyRef.current.$id(nodeId)
    //         if (node) {
    //             cyRef.current.center(node)
    //             cyRef.current.zoom(1.5)
    //             node.trigger('tap')
    //         }
    //     }
    // }

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
                const phase = n.data.phase || 1
                return {
                    data: {
                        id: n.data.id,
                        label: `${orderLabel}${n.data.label}`,
                        description: n.data.description,
                        difficulty: n.data.difficulty,
                        pagerank: n.data.pagerank,
                        mastery: score,
                        topo_order: topoOrder,
                        phase: phase,
                        topic: n.data.topic,
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
                        'border-width': 3,
                        'border-color': (ele: any) => getPhaseBorderColor(ele.data('phase')),
                        'border-opacity': 0.8,
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
                        'border-width': 5,
                        'border-color': '#1E3A5F',
                    },
                },
                {
                    selector: 'node.mastered',
                    style: {
                        'border-width': 4,
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

    const togglePhase = (phaseNumber: number) => {
        setExpandedPhases(prev => ({
            ...prev,
            [phaseNumber]: !prev[phaseNumber]
        }))
    }

    const toggleTopic = (topicKey: string) => {
        setExpandedTopics(prev => ({
            ...prev,
            [topicKey]: !prev[topicKey]
        }))
    }

    const getSubtopicProgress = (subtopicLabel: string): number => {
        const node = graphRef.current?.nodes?.find((n: any) => n.data.label === subtopicLabel)
        if (node) {
            return masteryRef.current[node.data.id]?.mastery_score || 0
        }
        return 0
    }

    const getNodeIdByLabel = (label: string): string | null => {
        const node = graphRef.current?.nodes?.find((n: any) => n.data.label === label)
        return node?.data?.id || null
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
                const roleResponse = await fetch(`https://mygateway.up.railway.app/api/user/role/${userId}`)
                if (roleResponse.ok) {
                    const roleData = await roleResponse.json()
                    setUserRole(roleData.role || 'student')
                }
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
                await loadRoadmap()
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
    const isTeacher = userRole === 'teacher'

    const getPhaseProgress = (phase: Phase): number => {
        let total = 0
        let completed = 0
        for (const topic of phase.topics) {
            for (const subtopic of topic.subtopics) {
                total++
                if (getSubtopicProgress(subtopic.label) >= 0.8) {
                    completed++
                }
            }
        }
        return total > 0 ? Math.round((completed / total) * 100) : 0
    }

    return (
        <div style={s.page}>
            <div style={{...s.leftPanel, width: showLeftPanel ? 360 : 40}}>
                <button style={s.toggleLeftBtn} onClick={() => setShowLeftPanel(!showLeftPanel)}>
                    {showLeftPanel ? '◀' : '▶'}
                </button>
                {showLeftPanel && roadmap && (
                    <div style={s.leftPanelContent}>
                        <div style={s.courseHeader}>
                            <h3 style={s.courseTitleLeft}>{roadmap.title}</h3>
                            <div style={s.courseDuration}>📅 {roadmap.duration_months} meses</div>
                        </div>
                        <div style={s.phasesList}>
                            {roadmap.phases.map((phase) => {
                                const phaseProgress = getPhaseProgress(phase)
                                return (
                                    <div key={phase.phase_number} style={{...s.phaseItem, borderLeft: `4px solid ${getPhaseBorderColor(phase.phase_number)}`}}>
                                        <div style={s.phaseHeaderLeft} onClick={() => togglePhase(phase.phase_number)}>
                                            <div style={s.phaseHeaderLeftInfo}>
                                                <span style={s.phaseNumberLeft}>Fase {phase.phase_number}</span>
                                                <span style={s.phaseNameLeft}>{phase.name}</span>
                                            </div>
                                            <div style={s.phaseHeaderRight}>
                                                <span style={s.phaseProgress}>{phaseProgress}%</span>
                                                <span style={s.expandIcon}>{expandedPhases[phase.phase_number] ? '▼' : '▶'}</span>
                                            </div>
                                        </div>
                                        <div style={s.phaseProgressBar}>
                                            <div style={{...s.phaseProgressFill, width: `${phaseProgress}%`}} />
                                        </div>
                                        {expandedPhases[phase.phase_number] && (
                                            <div style={s.phaseContentLeft}>
                                                <div style={s.bloomLevelsLeft}>
                                                    {phase.bloom_levels.map(level => (
                                                        <span key={level} style={s.bloomBadgeLeft}>{level}</span>
                                                    ))}
                                                </div>
                                                <p style={s.phaseObjectiveLeft}>{phase.objective.substring(0, 100)}...</p>
                                                {phase.topics.map((topic, topicIdx) => {
                                                    const topicKey = `${phase.phase_number}-${topicIdx}`
                                                    let topicProgress = 0
                                                    let topicTotal = 0
                                                    let topicCompleted = 0
                                                    for (const subtopic of topic.subtopics) {
                                                        topicTotal++
                                                        if (getSubtopicProgress(subtopic.label) >= 0.8) {
                                                            topicCompleted++
                                                        }
                                                    }
                                                    topicProgress = topicTotal > 0 ? Math.round((topicCompleted / topicTotal) * 100) : 0
                                                    return (
                                                        <div key={topicKey} style={s.topicItemLeft}>
                                                            <div style={s.topicHeaderLeft} onClick={() => toggleTopic(topicKey)}>
                                                                <span style={s.topicNameLeft}>{topic.topic_name}</span>
                                                                <div style={s.topicHeaderRight}>
                                                                    <span style={s.topicProgress}>{topicProgress}%</span>
                                                                    <span style={s.expandIcon}>{expandedTopics[topicKey] ? '▼' : '▶'}</span>
                                                                </div>
                                                            </div>
                                                            <div style={s.topicProgressBar}>
                                                                <div style={{...s.topicProgressFill, width: `${topicProgress}%`}} />
                                                            </div>
                                                            {expandedTopics[topicKey] && (
                                                                <div style={s.subtopicsListLeft}>
                                                                    {topic.subtopics.map((subtopic, subIdx) => {
                                                                        const subProgress = getSubtopicProgress(subtopic.label)
                                                                        const nodeId = getNodeIdByLabel(subtopic.label)
                                                                        return (
                                                                            <div
                                                                                key={subIdx}
                                                                                style={s.subtopicItemLeft}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    if (nodeId && cyRef.current) {
                                                                                        const node = cyRef.current.$id(nodeId)
                                                                                        if (node) {
                                                                                            cyRef.current.center(node)
                                                                                            cyRef.current.zoom(1.5)
                                                                                            node.style('border-width', 6)
                                                                                            node.style('border-color', '#FFD700')
                                                                                            setTimeout(() => {
                                                                                                node.style('border-width', 3)
                                                                                                node.style('border-color', getPhaseBorderColor(node.data('phase')))
                                                                                            }, 2000)
                                                                                        }
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <div style={s.subtopicHeaderLeft}>
                                                                                    <span style={s.subtopicLabelLeft}>{subtopic.label}</span>
                                                                                    <span style={{...s.subtopicProgress, color: masteryColor(subProgress)}}>
                                                                                        {Math.round(subProgress * 100)}%
                                                                                    </span>
                                                                                </div>
                                                                                <div style={s.subtopicProgressBar}>
                                                                                    <div style={{...s.subtopicProgressFill, width: `${subProgress * 100}%`, background: masteryColor(subProgress)}} />
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
                {showLeftPanel && !roadmap && (
                    <div style={s.leftPanelContent}>
                        <p style={s.noRoadmapMsg}>No hay roadmap disponible para este curso.</p>
                    </div>
                )}
            </div>

            <div style={s.mainContent}>
                <div style={s.header}>
                    <button onClick={() => navigate('/dashboard')} style={s.back}>← Volver</button>
                    <div style={{flex: 1}}>
                        <h1 style={s.title}>{graphRef.current?.course.title}</h1>
                        <p style={s.subtitle}>
                            {graphRef.current?.summary.total_nodes} conceptos · {graphRef.current?.summary.total_edges} prerequisitos
                            {isTeacher && <span style={s.teacherBadge}> 👨‍🏫 Modo Profesor</span>}
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
                            <div style={s.stat}><span style={s.statNum}>{Math.round(summary.avg_mastery * 100)}%</span><span style={s.statLbl}>Mastery</span></div>
                            <div style={s.stat}><span style={{...s.statNum, color: '#1D9E75'}}>{summary.mastered}</span><span style={s.statLbl}>Dominados</span></div>
                            <div style={s.stat}><span style={{...s.statNum, color: '#E24B4A'}}>{summary.not_started}</span><span style={s.statLbl}>Sin iniciar</span></div>
                        </div>
                    )}
                </div>

                <div style={s.phaseLegend}>
                    <span style={s.legendTitle}>Fases:</span>
                    <div style={{...s.legendItem, cursor: 'pointer', background: selectedPhase === null ? '#E1F5EE' : 'transparent', borderRadius: 4, padding: '2px 6px'}} onClick={() => filterNodesByPhase(null)}>
                        <div style={{...s.legendColor, backgroundColor: '#1E3A5F'}}/><span>Todas</span>
                    </div>
                    {roadmap?.phases.map(phase => {
                        const phaseProgressValue = getPhaseProgress(phase)
                        return (
                            <div key={phase.phase_number} style={{...s.legendItem, cursor: 'pointer', background: selectedPhase === phase.phase_number ? '#E1F5EE' : 'transparent', borderRadius: 4, padding: '2px 6px'}} onClick={() => filterNodesByPhase(phase.phase_number)}>
                                <div style={{...s.legendColor, backgroundColor: getPhaseBorderColor(phase.phase_number)}}/><span>Fase {phase.phase_number}</span><span style={s.phaseProgressBadge}>{phaseProgressValue}%</span>
                            </div>
                        )
                    })}
                    <button style={s.resetFilterBtn} onClick={resetFilter}>⟳</button>
                </div>

                {isComplete && <div style={s.completeBanner}>🎓 ¡Felicidades! Has completado el curso "{graphRef.current?.course.title}" al 100%. 🎉</div>}

                <div style={s.body}>
                    <div ref={containerRef} style={s.graphContainer}/>
                    <div style={s.panel}>
                        {selected ? (
                            <div style={s.nodeCard}>
                                <div style={s.nodeHeader}>
                                    <h2 style={s.nodeTitle}>{selected.label}</h2>
                                    <div style={{...s.phaseBadge, backgroundColor: getPhaseBorderColor(selected.phase  || 1)}}>Fase {selected.phase || 1}</div>
                                </div>
                                <div style={s.masteryBar}>
                                    <div style={s.masteryBarLabel}><span>Mastery</span><span style={{fontWeight: 600}}>{Math.round((selectedMastery?.mastery_score ?? 0) * 100)}%</span></div>
                                    <div style={s.masteryTrack}><div style={{...s.masteryFill, width: `${(selectedMastery?.mastery_score ?? 0) * 100}%`, background: masteryColor(selectedMastery?.mastery_score ?? 0)}}/></div>
                                    <div style={s.masteryLevel}>{selectedMastery?.level ?? 'not_started'} · {selectedMastery?.attempts ?? 0} intentos</div>
                                </div>
                                <p style={s.nodeDesc}>{selected.description}</p>
                                {!isTeacher && (
                                    <div style={s.answerRow}>
                                        <p style={s.answerLabel}>¿Respondiste correctamente?</p>
                                        <div style={s.btnRow}>
                                            <button style={s.btnCorrect} onClick={() => handleAnswer(true)}>✓ Sí</button>
                                            <button style={s.btnWrong} onClick={() => handleAnswer(false)}>✗ No</button>
                                        </div>
                                    </div>
                                )}
                                {isTeacher && <div style={s.teacherNote}>👨‍🏫 Como profesor, solo puedes visualizar el progreso. Los estudiantes responden preguntas.</div>}
                                {feedbackMessage && <div style={s.feedbackMessage}>{feedbackMessage}</div>}
                            </div>
                        ) : (
                            <div style={s.panelEmpty}>
                                <p style={s.muted}>Haz clic en un nodo para ver su mastery</p>
                                {nextRecommended && !isComplete && <div style={s.nextRecommended}>📍 Siguiente recomendado: <strong>{nextRecommended.label}</strong></div>}
                                {isComplete && <div style={s.completedMessage}>🎓 ¡Curso completado! Revisa tu progreso en el dashboard.</div>}
                            </div>
                        )}
                        {isTeacher && gaps.length > 0 && (
                            <div style={s.gapsSection}>
                                <h3 style={s.gapsTitle}>Gaps críticos</h3>
                                {gaps.map((gap) => (
                                    <div key={gap.node_id} style={s.gapRow}>
                                        <div style={s.gapLabel}>{gap.label}</div>
                                        <div style={s.gapBar}><div style={{...s.gapFill, width: `${Math.min(gap.severity * 100, 100)}%`}}/></div>
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
            </div>

            {showContentModal && nodeContent && (
                <div style={s.modalOverlay}>
                    <div style={s.modalContent}>
                        <h3 style={s.modalTitle}>{selected?.label}</h3>
                        <div style={s.modalSection}><h4>📖 Explicación</h4><p>{nodeContent.explanation}</p></div>
                        <div style={s.modalSection}><h4>💡 Ejemplo</h4><p>{nodeContent.example}</p></div>
                        <div style={s.modalSection}>
                            <h4>❓ Pregunta de práctica</h4>
                            <p>{nodeContent.question}</p>
                            <div style={s.optionsContainer}>
                                {nodeContent.options.map((opt, idx) => (
                                    <label key={idx} style={s.optionLabel}>
                                        <input type="radio" name="answer" value={idx} checked={selectedAnswer === idx} onChange={() => setSelectedAnswer(idx)} disabled={showAnswerFeedback || isTeacher} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                            {!showAnswerFeedback && !isTeacher ? (
                                <button style={s.submitBtn} onClick={handleAnswerQuestion}>Verificar respuesta</button>
                            ) : showAnswerFeedback && (
                                <div style={s.answerFeedback}>
                                    {selectedAnswer === nodeContent.correct_answer ? <p style={s.correctFeedback}>✅ ¡Correcto! Bien hecho.</p> : <p style={s.wrongFeedback}>❌ Incorrecto. La respuesta correcta es: {nodeContent.options[nodeContent.correct_answer]}</p>}
                                </div>
                            )}
                            {isTeacher && <div style={s.teacherNote}>👨‍🏫 Modo profesor: Las preguntas son para estudiantes.</div>}
                        </div>
                        <button style={s.closeModalBtn} onClick={() => setShowContentModal(false)}>Cerrar</button>
                    </div>
                </div>
            )}
        </div>
    )
}

const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F1EFE8', overflow: 'hidden' },
    leftPanel: { background: '#fff', borderRight: '1px solid #D3D1C7', transition: 'width 0.3s ease', overflow: 'hidden', position: 'relative', height: '100%', flexShrink: 0 },
    toggleLeftBtn: { position: 'absolute', top: 20, right: 8, width: 28, height: 28, borderRadius: '50%', background: '#F1EFE8', border: '1px solid #D3D1C7', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 },
    leftPanelContent: { padding: 16, height: '100%', overflowY: 'auto' },
    courseHeader: { marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #F1EFE8' },
    courseTitleLeft: { fontSize: 16, fontWeight: 700, color: '#1E3A5F', margin: '0 0 8px' },
    courseDuration: { fontSize: 12, color: '#1D9E75', background: '#E1F5EE', padding: '2px 8px', borderRadius: 12, display: 'inline-block' },
    phasesList: { display: 'flex', flexDirection: 'column', gap: 16 },
    phaseItem: { background: '#F9F9F8', borderRadius: 8, border: '1px solid #E8E6E1', overflow: 'hidden' },
    phaseHeaderLeft: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 12px 8px 12px', cursor: 'pointer' },
    phaseHeaderLeftInfo: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    phaseNumberLeft: { fontSize: 11, fontWeight: 700, color: '#1D9E75', background: '#E1F5EE', padding: '2px 8px', borderRadius: 12 },
    phaseNameLeft: { fontSize: 13, fontWeight: 600, color: '#1E3A5F' },
    phaseHeaderRight: { display: 'flex', alignItems: 'center', gap: 8 },
    phaseProgress: { fontSize: 12, fontWeight: 600, color: '#1D9E75' },
    phaseProgressBar: { height: 3, background: '#F1EFE8', borderRadius: 2, overflow: 'hidden', margin: '0 12px 12px 12px' },
    phaseProgressFill: { height: '100%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.3s' },
    phaseContentLeft: { padding: '0 12px 12px 12px' },
    bloomLevelsLeft: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
    bloomBadgeLeft: { fontSize: 10, background: '#E8E6E1', padding: '2px 6px', borderRadius: 10, color: '#1E3A5F' },
    phaseObjectiveLeft: { fontSize: 11, color: '#6B6E6A', marginBottom: 12, lineHeight: 1.4 },
    topicItemLeft: { marginTop: 8, background: '#fff', borderRadius: 6, border: '1px solid #E8E6E1' },
    topicHeaderLeft: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer' },
    topicNameLeft: { fontSize: 12, fontWeight: 600, color: '#1E3A5F' },
    topicHeaderRight: { display: 'flex', alignItems: 'center', gap: 8 },
    topicProgress: { fontSize: 11, fontWeight: 500, color: '#1D9E75' },
    topicProgressBar: { height: 2, background: '#F1EFE8', borderRadius: 1, overflow: 'hidden', margin: '0 12px 8px 12px' },
    topicProgressFill: { height: '100%', background: '#1D9E75', borderRadius: 1, transition: 'width 0.3s' },
    subtopicsListLeft: { padding: '8px 12px 12px 12px', borderTop: '1px solid #F1EFE8' },
    subtopicItemLeft: { marginBottom: 8, cursor: 'pointer' },
    subtopicHeaderLeft: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    subtopicLabelLeft: { fontSize: 11, color: '#2C2C2A' },
    subtopicProgress: { fontSize: 10, fontWeight: 500 },
    subtopicProgressBar: { height: 2, background: '#F1EFE8', borderRadius: 1, overflow: 'hidden' },
    subtopicProgressFill: { height: '100%', borderRadius: 1, transition: 'width 0.3s' },
    noRoadmapMsg: { fontSize: 13, color: '#888780', textAlign: 'center', marginTop: 40 },
    mainContent: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', background: '#1E3A5F', flexWrap: 'wrap' },
    back: { background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
    title: { fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 },
    subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' },
    teacherBadge: { background: '#1D9E75', padding: '2px 8px', borderRadius: 12, fontSize: 10, marginLeft: 8 },
    progressContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 100 },
    progressBar: { width: 100, height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', background: '#1D9E75', borderRadius: 3, transition: 'width 0.3s' },
    progressText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
    statsRow: { display: 'flex', gap: 20 },
    stat: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
    statNum: { fontSize: 20, fontWeight: 700, color: '#fff' },
    statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
    phaseLegend: { display: 'flex', gap: 16, alignItems: 'center', padding: '8px 16px', background: '#fff', borderBottom: '1px solid #D3D1C7', flexWrap: 'wrap' },
    legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
    legendColor: { width: 16, height: 16, borderRadius: 3 },
    completeBanner: { background: '#1D9E75', color: '#fff', textAlign: 'center', padding: '8px 16px', fontSize: 14, fontWeight: 600 },
    body: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
    graphContainer: { flex: 1, background: '#fff', position: 'relative', height: '100%', width: '100%' },
    panel: { width: 280, background: '#fff', borderLeft: '1px solid #D3D1C7', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' },
    nodeCard: { display: 'flex', flexDirection: 'column', gap: 10 },
    nodeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    nodeTitle: { fontSize: 16, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    phaseBadge: { fontSize: 10, fontWeight: 600, color: '#fff', padding: '2px 8px', borderRadius: 12 },
    nodeDesc: { fontSize: 13, color: '#5F5E5A', lineHeight: 1.5, margin: 0 },
    masteryBar: { display: 'flex', flexDirection: 'column', gap: 4 },
    masteryBarLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5F5E5A' },
    masteryTrack: { height: 8, background: '#F1EFE8', borderRadius: 4, overflow: 'hidden' },
    masteryFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
    masteryLevel: { fontSize: 11, color: '#888780' },
    answerRow: { borderTop: '1px solid #F1EFE8', paddingTop: 10 },
    answerLabel: { fontSize: 12, color: '#5F5E5A', margin: '0 0 8px' },
    btnRow: { display: 'flex', gap: 8 },
    btnCorrect: { flex: 1, padding: '8px 0', background: '#E1F5EE', color: '#085041', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    btnWrong: { flex: 1, padding: '8px 0', background: '#FAECE7', color: '#712B13', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    teacherNote: { fontSize: 12, color: '#1D9E75', background: '#E1F5EE', padding: '8px 12px', borderRadius: 8, textAlign: 'center' },
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
    phaseProgressBadge: { fontSize: 10, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', padding: '2px 6px', borderRadius: 10, marginLeft: 6 },
    resetFilterBtn: { background: '#E8E6E1', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, marginLeft: 8 },
}