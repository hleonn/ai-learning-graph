// src/pages/ProgramView.tsx

import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { getProgram, getCourses, type Program } from '../lib/api'

interface Course {
    id: string
    title: string
    description: string
    domain: string
    difficulty_level?: string
}

export default function ProgramView() {
    const navigate = useNavigate()
    const location = useLocation()
    const { id } = useParams<{ id: string }>()

    const [program, setProgram] = useState<Program | null>(null)
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            setError(null)

            try {
                // Cargar cursos disponibles
                const coursesData = await getCourses()
                setCourses(coursesData.courses || [])

                // Cargar programa por ID
                let programData: Program | null = null

                // Intentar obtener del state de navegación
                const state = location.state as { program?: Program }
                if (state?.program) {
                    programData = state.program
                } else if (id) {
                    programData = await getProgram(id)
                }

                if (programData) {
                    setProgram(programData)
                } else {
                    setError('No se encontró el programa')
                }
            } catch (err) {
                console.error('Error loading program:', err)
                setError('Error al cargar el programa')
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [id, location])

    const getCourseTitle = (courseId: string): string => {
        const course = courses.find(c => c.id === courseId)
        return course?.title || courseId.substring(0, 8)
    }

    const handleViewCourse = (courseId: string) => {
        navigate(`/graph/${courseId}`)
    }

    if (loading) {
        return (
            <div style={styles.center}>
                <div style={styles.spinner}></div>
                <p>Cargando programa...</p>
            </div>
        )
    }

    if (error || !program) {
        return (
            <div style={styles.center}>
                <p style={styles.error}>❌ {error || 'Programa no encontrado'}</p>
                <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>← Volver al Dashboard</button>
            </div>
        )
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'bootcamp': return '🚀'
            case 'diploma': return '🎓'
            case 'specialty': return '⚡'
            case 'workshop': return '🔧'
            default: return '📚'
        }
    }

    const getTypeName = (type: string) => {
        switch (type) {
            case 'bootcamp': return 'Bootcamp'
            case 'diploma': return 'Diplomado'
            case 'specialty': return 'Especialidad'
            case 'workshop': return 'Taller'
            default: return 'Programa'
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>← Volver al Dashboard</button>
                <div>
                    <h1 style={styles.title}>{getTypeIcon(program.type)} {program.title}</h1>
                    <p style={styles.subtitle}>{getTypeName(program.type)} de formación</p>
                </div>
            </div>

            <div style={styles.content}>
                {/* Información general */}
                <div style={styles.infoCard}>
                    <div style={styles.infoGrid}>
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>📅 Duración</span>
                            <span style={styles.infoValue}>{program.duration_weeks} semanas</span>
                        </div>
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>📚 Cursos</span>
                            <span style={styles.infoValue}>{program.course_ids?.length || 0} cursos</span>
                        </div>
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>📅 Creado</span>
                            <span style={styles.infoValue}>{new Date(program.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <p style={styles.description}>{program.description}</p>
                </div>

                {/* Módulos del programa */}
                {program.modules && program.modules.length > 0 && (
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>📋 Módulos del Programa</h2>
                        <div style={styles.modulesGrid}>
                            {program.modules.map((module: any, idx: number) => (
                                <div key={idx} style={styles.moduleCard}>
                                    <div style={styles.moduleHeader}>
                                        <span style={styles.moduleOrder}>Módulo {module.order || idx + 1}</span>
                                        <span style={styles.moduleWeight}>Peso: {Math.round((module.weight || 0.2) * 100)}%</span>
                                    </div>
                                    <h3 style={styles.moduleTitle}>{module.name}</h3>
                                    <p style={styles.moduleDesc}>{module.description}</p>
                                    <div style={styles.moduleMeta}>
                                        <span>📊 Complejidad: {Math.round((module.complexity || 0.5) * 100)}%</span>
                                        <span>⏱️ {module.estimated_hours || 40}h estimadas</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Cursos del programa */}
                <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>📚 Cursos Incluidos ({program.course_ids?.length || 0})</h2>
                    <div style={styles.coursesGrid}>
                        {program.course_ids?.map((courseId, idx) => (
                            <div key={courseId} style={styles.courseCard}>
                                <div style={styles.courseNumber}>#{idx + 1}</div>
                                <h3 style={styles.courseTitle}>{getCourseTitle(courseId)}</h3>
                                <button
                                    style={styles.viewCourseBtn}
                                    onClick={() => handleViewCourse(courseId)}
                                >
                                    Ver grafo del curso →
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={styles.footer}>
                <button
                    style={styles.exportBtn}
                    onClick={() => {
                        // TODO: Exportar programa a PDF
                        alert('Próximamente: Exportar programa a PDF')
                    }}
                >
                    📄 Exportar programa a PDF
                </button>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        maxWidth: 1200,
        margin: '0 auto',
        padding: '40px 24px',
        fontFamily: 'system-ui, sans-serif',
        minHeight: '100vh',
        background: '#F1EFE8'
    },
    header: {
        marginBottom: 32
    },
    backBtn: {
        background: 'none',
        border: '1px solid #D3D1C7',
        padding: '6px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        marginBottom: 16,
        color: '#1E3A5F'
    },
    title: {
        fontSize: 32,
        fontWeight: 700,
        color: '#1E3A5F',
        margin: 0
    },
    subtitle: {
        fontSize: 16,
        color: '#888780',
        marginTop: 8
    },
    content: {
        display: 'flex',
        flexDirection: 'column',
        gap: 32
    },
    infoCard: {
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #D3D1C7',
        padding: 24
    },
    infoGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid #F1EFE8'
    },
    infoItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4
    },
    infoLabel: {
        fontSize: 12,
        color: '#888780'
    },
    infoValue: {
        fontSize: 18,
        fontWeight: 600,
        color: '#1E3A5F'
    },
    description: {
        fontSize: 14,
        color: '#2C2C2A',
        lineHeight: 1.5,
        margin: 0
    },
    section: {
        marginBottom: 8
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 600,
        color: '#2C2C2A',
        marginBottom: 16
    },
    modulesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16
    },
    moduleCard: {
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #D3D1C7',
        padding: 16
    },
    moduleHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 8
    },
    moduleOrder: {
        fontSize: 11,
        fontWeight: 600,
        color: '#1D9E75',
        background: '#E1F5EE',
        padding: '2px 8px',
        borderRadius: 12
    },
    moduleWeight: {
        fontSize: 11,
        color: '#888780'
    },
    moduleTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#1E3A5F',
        margin: '0 0 8px'
    },
    moduleDesc: {
        fontSize: 12,
        color: '#6B6E6A',
        lineHeight: 1.4,
        margin: '0 0 12px'
    },
    moduleMeta: {
        display: 'flex',
        gap: 12,
        fontSize: 10,
        color: '#888780',
        paddingTop: 8,
        borderTop: '1px solid #F1EFE8'
    },
    coursesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16
    },
    courseCard: {
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #D3D1C7',
        padding: 16,
        position: 'relative'
    },
    courseNumber: {
        position: 'absolute',
        top: -10,
        left: 16,
        background: '#1E3A5F',
        color: '#fff',
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 12
    },
    courseTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#1E3A5F',
        margin: '8px 0 12px',
        paddingTop: 8
    },
    viewCourseBtn: {
        width: '100%',
        padding: '8px',
        background: '#E8E6E1',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500,
        color: '#1E3A5F'
    },
    footer: {
        marginTop: 32,
        paddingTop: 24,
        borderTop: '1px solid #D3D1C7',
        textAlign: 'center'
    },
    exportBtn: {
        padding: '10px 24px',
        background: '#1D9E75',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600
    },
    center: {
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
    },
    error: {
        color: '#E24B4A',
        fontSize: 14,
        background: '#FCEBEB',
        padding: '12px 24px',
        borderRadius: 8
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