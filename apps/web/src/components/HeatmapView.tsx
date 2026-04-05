import { useState, useEffect } from 'react'

interface HeatmapData {
    students: Array<{ id: string; name: string; email: string }>
    concepts: Array<{ id: string; label: string; difficulty: number }>
    heatmap: Array<{
        student_id: string
        student_name: string
        mastery: Array<{ node_id: string; node_label: string; score: number }>
    }>
    concept_stats: Array<{
        node_id: string
        node_label: string
        difficulty: number
        avg_mastery: number
        mastered_count: number
        struggling_count: number
        not_started_count: number
    }>
    summary: {
        total_students: number
        total_concepts: number
        avg_class_mastery: number
    }
}

interface HeatmapViewProps {
    courseId: string
    courseTitle: string
    onClose: () => void
}

function getMasteryColor(score: number): string {
    if (score >= 0.8) return '#1D9E75'
    if (score >= 0.6) return '#5DCAA5'
    if (score >= 0.3) return '#FAC775'
    if (score > 0) return '#F0997B'
    return '#D3D1C7'
}

export default function HeatmapView({ courseId, courseTitle, onClose }: HeatmapViewProps) {
    const [data, setData] = useState<HeatmapData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<'name' | 'avg_mastery'>('name')

    useEffect(() => {
        const loadHeatmap = async () => {
            const token = localStorage.getItem('google_token')
            if (!token) {
                setError('No hay sesión activa')
                setLoading(false)
                return
            }

            try {
                const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}/heatmap`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!response.ok) throw new Error('Error cargando heatmap')
                const heatmapData = await response.json()
                setData(heatmapData)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error desconocido')
            } finally {
                setLoading(false)
            }
        }

        loadHeatmap()
    }, [courseId])

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={styles.modal}>
                    <p>Cargando heatmap...</p>
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div style={styles.overlay}>
                <div style={styles.modal}>
                    <p style={styles.error}>{error || 'No se pudo cargar el heatmap'}</p>
                    <button style={styles.closeBtn} onClick={onClose}>Cerrar</button>
                </div>
            </div>
        )
    }

    if (data.students.length === 0) {
        return (
            <div style={styles.overlay}>
                <div style={styles.modal}>
                    <p>No hay estudiantes inscritos en este curso.</p>
                    <p>Comparte el enlace del curso para que los estudiantes se inscriban.</p>
                    <button style={styles.closeBtn} onClick={onClose}>Cerrar</button>
                </div>
            </div>
        )
    }

    // Calcular promedio de mastery por estudiante
    const getStudentAvgMastery = (studentId: string): number => {
        const studentHeatmap = data.heatmap.find(h => h.student_id === studentId)
        if (!studentHeatmap) return 0
        const sum = studentHeatmap.mastery.reduce((s, m) => s + m.score, 0)
        return sum / data.concepts.length
    }

    const sortedStudents = [...data.students].sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name)
        const aAvg = getStudentAvgMastery(a.id)
        const bAvg = getStudentAvgMastery(b.id)
        return bAvg - aAvg
    })

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.modalHeader}>
                    <h2>Heatmap de {courseTitle}</h2>
                    <button style={styles.closeModalBtn} onClick={onClose}>✕</button>
                </div>

                <div style={styles.summaryBar}>
                    <div style={styles.summaryItem}>
                        <span style={styles.summaryValue}>{data.summary.total_students}</span>
                        <span style={styles.summaryLabel}>Estudiantes</span>
                    </div>
                    <div style={styles.summaryItem}>
                        <span style={styles.summaryValue}>{data.summary.total_concepts}</span>
                        <span style={styles.summaryLabel}>Conceptos</span>
                    </div>
                    <div style={styles.summaryItem}>
                        <span style={styles.summaryValue}>{data.summary.avg_class_mastery}%</span>
                        <span style={styles.summaryLabel}>Mastery promedio</span>
                    </div>
                </div>

                <div style={styles.sortBar}>
                    <span>Ordenar por:</span>
                    <button
                        style={{...styles.sortBtn, background: sortBy === 'name' ? '#1E3A5F' : '#E8E6E1', color: sortBy === 'name' ? '#fff' : '#1E3A5F'}}
                        onClick={() => setSortBy('name')}
                    >
                        Nombre
                    </button>
                    <button
                        style={{...styles.sortBtn, background: sortBy === 'avg_mastery' ? '#1E3A5F' : '#E8E6E1', color: sortBy === 'avg_mastery' ? '#fff' : '#1E3A5F'}}
                        onClick={() => setSortBy('avg_mastery')}
                    >
                        Mayor mastery
                    </button>
                </div>

                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                        <tr>
                            <th style={styles.thFixed}>Estudiante</th>
                            {data.concepts.map(concept => (
                                <th key={concept.id} style={styles.th} title={concept.label}>
                                    <span style={styles.conceptLabel}>{concept.label.substring(0, 15)}</span>
                                    <span style={styles.difficultyBadge}>D{concept.difficulty}</span>
                                </th>
                            ))}
                            <th style={styles.thFixed}>Promedio</th>
                        </tr>
                        </thead>
                        <tbody>
                        {sortedStudents.map(student => {
                            const studentHeatmap = data.heatmap.find(h => h.student_id === student.id)
                            const avgScore = studentHeatmap
                                ? studentHeatmap.mastery.reduce((s, m) => s + m.score, 0) / data.concepts.length
                                : 0
                            return (
                                <tr key={student.id}>
                                    <td style={styles.tdFixed}>
                                        <span style={styles.studentName}>{student.name.split(' ')[0]}</span>
                                    </td>
                                    {data.concepts.map(concept => {
                                        const mastery = studentHeatmap?.mastery.find(m => m.node_id === concept.id)?.score || 0
                                        return (
                                            <td key={concept.id} style={styles.td}>
                                                <div style={{
                                                    ...styles.cell,
                                                    backgroundColor: getMasteryColor(mastery),
                                                    width: `${mastery * 100}%`,
                                                    minWidth: 30
                                                }}>
                                                    <span style={styles.cellText}>{Math.round(mastery * 100)}%</span>
                                                </div>
                                            </td>
                                        )
                                    })}
                                    <td style={styles.tdFixed}>
                                        <span style={{ fontWeight: 600, color: '#1E3A5F' }}>{Math.round(avgScore * 100)}%</span>
                                    </td>
                                </tr>
                            )
                        })}
                        </tbody>
                    </table>
                </div>

                <div style={styles.legend}>
                    <span style={styles.legendTitle}>Mastery:</span>
                    <div style={styles.legendItem}><div style={{...styles.legendColor, background: '#D3D1C7'}}></div><span>0%</span></div>
                    <div style={styles.legendItem}><div style={{...styles.legendColor, background: '#F0997B'}}></div><span>1-29%</span></div>
                    <div style={styles.legendItem}><div style={{...styles.legendColor, background: '#FAC775'}}></div><span>30-59%</span></div>
                    <div style={styles.legendItem}><div style={{...styles.legendColor, background: '#5DCAA5'}}></div><span>60-79%</span></div>
                    <div style={styles.legendItem}><div style={{...styles.legendColor, background: '#1D9E75'}}></div><span>80-100%</span></div>
                </div>

                <div style={styles.conceptStats}>
                    <h4>Estadísticas por concepto</h4>
                    <div style={styles.statsGrid}>
                        {data.concept_stats.map(stat => (
                            <div key={stat.node_id} style={styles.statCard}>
                                <span style={styles.statConcept}>{stat.node_label}</span>
                                <div style={styles.statBar}>
                                    <div style={{...styles.statFill, width: `${stat.avg_mastery}%`, background: getMasteryColor(stat.avg_mastery / 100)}} />
                                </div>
                                <div style={styles.statNumbers}>
                                    <span>📊 {stat.avg_mastery}%</span>
                                    <span>✅ {stat.mastered_count}</span>
                                    <span>⚠️ {stat.struggling_count}</span>
                                    <span>⚪ {stat.not_started_count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button style={styles.closeBtn} onClick={onClose}>Cerrar</button>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
    },
    modal: {
        background: '#fff',
        borderRadius: 16,
        padding: 24,
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '100%'
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    closeModalBtn: {
        background: 'none',
        border: 'none',
        fontSize: 24,
        cursor: 'pointer',
        color: '#888'
    },
    summaryBar: {
        display: 'flex',
        gap: 24,
        justifyContent: 'center',
        marginBottom: 24,
        padding: 16,
        background: '#F1EFE8',
        borderRadius: 12
    },
    summaryItem: {
        textAlign: 'center'
    },
    summaryValue: {
        fontSize: 28,
        fontWeight: 700,
        color: '#1E3A5F',
        display: 'block'
    },
    summaryLabel: {
        fontSize: 12,
        color: '#888780'
    },
    sortBar: {
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        marginBottom: 16,
        justifyContent: 'flex-end'
    },
    sortBtn: {
        padding: '6px 12px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        fontSize: 12
    },
    tableContainer: {
        overflowX: 'auto',
        marginBottom: 24
    },
    table: {
        borderCollapse: 'collapse',
        width: '100%',
        fontSize: 12
    },
    th: {
        padding: '8px 4px',
        textAlign: 'center',
        borderBottom: '1px solid #D3D1C7',
        minWidth: 70
    },
    thFixed: {
        padding: '8px 12px',
        textAlign: 'left',
        borderBottom: '1px solid #D3D1C7',
        position: 'sticky',
        left: 0,
        background: '#fff',
        zIndex: 1
    },
    td: {
        padding: '2px',
        textAlign: 'center'
    },
    tdFixed: {
        padding: '8px 12px',
        borderBottom: '1px solid #F1EFE8',
        position: 'sticky',
        left: 0,
        background: '#fff'
    },
    cell: {
        height: 32,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'width 0.3s'
    },
    cellText: {
        fontSize: 11,
        fontWeight: 500,
        color: '#fff',
        textShadow: '0 0 2px rgba(0,0,0,0.3)'
    },
    studentName: {
        fontWeight: 500,
        color: '#1E3A5F'
    },
    conceptLabel: {
        fontSize: 10,
        fontWeight: 600,
        display: 'block'
    },
    difficultyBadge: {
        fontSize: 9,
        color: '#888780',
        display: 'block'
    },
    legend: {
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        padding: 12,
        background: '#F1EFE8',
        borderRadius: 8,
        flexWrap: 'wrap'
    },
    legendTitle: {
        fontSize: 12,
        fontWeight: 600,
        color: '#2C2C2A'
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
    },
    legendColor: {
        width: 20,
        height: 20,
        borderRadius: 4
    },
    conceptStats: {
        marginBottom: 24
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
        marginTop: 12
    },
    statCard: {
        background: '#F9F9F8',
        borderRadius: 8,
        padding: 12,
        border: '1px solid #E8E6E1'
    },
    statConcept: {
        fontSize: 13,
        fontWeight: 600,
        color: '#1E3A5F',
        display: 'block',
        marginBottom: 8
    },
    statBar: {
        height: 8,
        background: '#F1EFE8',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 8
    },
    statFill: {
        height: '100%',
        borderRadius: 4
    },
    statNumbers: {
        display: 'flex',
        gap: 12,
        fontSize: 11,
        color: '#888780'
    },
    closeBtn: {
        width: '100%',
        padding: '10px',
        background: '#1E3A5F',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        marginTop: 16
    },
    error: {
        color: '#A32D2D',
        textAlign: 'center',
        marginBottom: 16
    }
}