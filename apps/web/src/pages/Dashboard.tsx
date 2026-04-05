import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses, getStudentMastery } from '../lib/api'
import type { Course } from '../types'

export default function Dashboard() {
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const userName = localStorage.getItem('user_name')
    const userPhoto = localStorage.getItem('user_photo')
    const [courseProgress, setCourseProgress] = useState<Record<string, number>>({})

    // Google Classroom state
    const [googleCourses, setGoogleCourses] = useState<any[]>([])
    const [showGoogleCourses, setShowGoogleCourses] = useState(false)
    const [syncing, setSyncing] = useState<string | null>(null)
    const [loadingGoogle, setLoadingGoogle] = useState(false)

    // Students list state
    const [selectedCourseStudents, setSelectedCourseStudents] = useState<any[]>([])
    const [showStudentsFor, setShowStudentsFor] = useState<string | null>(null)
    const [loadingStudents, setLoadingStudents] = useState(false)

    const navigate = useNavigate()

    // Obtener el userId actual
    const getCurrentUserId = async (): Promise<string | null> => {
        const token = localStorage.getItem('google_token')
        if (!token) return null

        try {
            const payload = JSON.parse(atob(token.split('.')[1]))
            const email = payload.email
            const response = await fetch(`https://mygateway.up.railway.app/api/user/by-email/${email}`)
            if (response.ok) {
                const data = await response.json()
                return data.id
            }
            return null
        } catch {
            return null
        }
    }

    // Cargar progreso de cada curso
    const loadCourseProgress = async (userId: string) => {
        const progressMap: Record<string, number> = {}

        for (const course of courses) {
            try {
                const masteryData = await getStudentMastery(userId, course.id)
                const masteredCount = masteryData.nodes?.filter((n: any) => n.mastery_score >= 0.8).length || 0
                const totalNodes = masteryData.summary?.total_nodes || 1
                progressMap[course.id] = Math.round((masteredCount / totalNodes) * 100)
            } catch (e) {
                progressMap[course.id] = 0
            }
        }

        setCourseProgress(progressMap)
    }

    useEffect(() => {
        const init = async () => {
            try {
                const coursesData = await getCourses()
                setCourses(coursesData.courses)

                const userId = await getCurrentUserId()
                if (userId && coursesData.courses.length > 0) {
                    await loadCourseProgress(userId)
                }
            } catch (err) {
                setError('No se pudieron cargar los cursos')
            } finally {
                setLoading(false)
            }
        }

        init()
    }, [])

    const loadGoogleCourses = async () => {
        const token = localStorage.getItem('google_token')
        if (!token) {
            console.log('No google token found')
            return
        }

        setLoadingGoogle(true)
        try {
            const response = await fetch('https://mygateway.up.railway.app/auth/classroom/courses', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            const data = await response.json()
            console.log('Google courses:', data)
            if (data.courses) {
                setGoogleCourses(data.courses)
            }
        } catch (error) {
            console.error('Error loading Google courses:', error)
        } finally {
            setLoadingGoogle(false)
        }
    }

    const syncGoogleCourse = async (courseId: string, courseName: string) => {
        setSyncing(courseId)
        const token = localStorage.getItem('google_token')
        try {
            const response = await fetch(`https://mygateway.up.railway.app/auth/classroom/courses/${courseId}/sync`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
            const data = await response.json()
            if (data.success) {
                alert(`✅ Curso "${courseName}" sincronizado con ${data.students_synced || 0} estudiantes`)
                const coursesData = await getCourses()
                setCourses(coursesData.courses)
            } else {
                alert('Error al sincronizar: ' + (data.error || data.message || 'Unknown error'))
            }
        } catch (error) {
            console.error('Sync error:', error)
            alert('Error al sincronizar el curso')
        } finally {
            setSyncing(null)
        }
    }

    const loadCourseStudents = async (courseId: string, courseTitle: string) => {
        const token = localStorage.getItem('google_token')
        if (!token) {
            alert('Debes iniciar sesión con Google para ver los estudiantes')
            return
        }

        setLoadingStudents(true)
        setShowStudentsFor(courseId)
        try {
            const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}/students`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setSelectedCourseStudents(data.students || [])
            if (data.students?.length === 0) {
                alert(`📭 El curso "${courseTitle}" no tiene estudiantes inscritos aún.\n\nComparte el enlace del curso con los estudiantes para que se inscriban automáticamente.`)
            } else {
                alert(`👥 Curso "${courseTitle}" tiene ${data.students?.length || 0} estudiantes inscritos`)
            }
        } catch (error) {
            console.error('Error loading students:', error)
            setSelectedCourseStudents([])
            alert('Error al cargar los estudiantes')
        } finally {
            setLoadingStudents(false)
        }
    }
    const deleteCourse = async (courseId: string, courseTitle: string) => {
        if (!confirm(`¿Eliminar el curso "${courseTitle}"?\n\nSe eliminarán todos los conceptos, aristas y progreso de estudiantes.`)) {
            return
        }

        const token = localStorage.getItem('google_token')
        if (!token) {
            alert('Debes iniciar sesión')
            return
        }

        try {
            // Eliminar el curso (el backend debe eliminar en cascada)
            const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })

            if (response.ok) {
                alert(`✅ Curso "${courseTitle}" eliminado correctamente`)
                // Recargar lista de cursos
                const coursesData = await getCourses()
                setCourses(coursesData.courses)
            } else {
                const error = await response.json()
                alert(`Error al eliminar: ${error.error || 'Unknown error'}`)
            }
        } catch (error) {
            console.error('Error deleting course:', error)
            alert('Error al eliminar el curso')
        }
    }
    if (loading) return (
        <div style={styles.center}>
            <p style={styles.muted}>Cargando cursos...</p>
        </div>
    )

    if (error) return (
        <div style={styles.center}>
            <p style={styles.error}>{error}</p>
        </div>
    )

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h1 style={styles.title}>AI Learning Graph</h1>
                        <p style={styles.subtitle}>Plataforma de conocimiento adaptativo</p>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button style={styles.generateBtn} onClick={() => navigate('/curriculum')}>
                            + Generar currículo con AI
                        </button>

                        {userName && (
                            <button
                                style={styles.googleClassroomBtn}
                                onClick={() => {
                                    if (!showGoogleCourses && googleCourses.length === 0) {
                                        loadGoogleCourses()
                                    }
                                    setShowGoogleCourses(!showGoogleCourses)
                                }}
                            >
                                📚 {showGoogleCourses ? 'Ocultar' : 'Mostrar'} Google Classroom
                            </button>
                        )}

                        {userName ? (
                            <div style={styles.userBadge}>
                                {userPhoto && (
                                    <img src={userPhoto} style={styles.userPhoto} alt={userName} />
                                )}
                                <span style={styles.userName}>{userName}</span>
                                <span style={styles.connected}>✓ Classroom</span>
                            </div>
                        ) : (
                            <button
                                style={styles.googleBtn}
                                onClick={() => window.location.href = 'https://mygateway.up.railway.app/auth/google'}
                            >
                                Conectar Google Classroom
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Cursos disponibles</h2>
                <div style={styles.grid}>
                    {courses.map((course) => (
                        <div key={course.id} style={styles.card}>
                            <div style={styles.cardDomain}>{course.domain}</div>
                            <h3 style={styles.cardTitle}>{course.title}</h3>
                            <p style={styles.cardDesc}>{course.description}</p>

                            {/* Barra de progreso */}
                            <div style={styles.progressContainer}>
                                <div style={styles.progressBar}>
                                    <div style={{...styles.progressFill, width: `${courseProgress[course.id] || 0}%`}}/>
                                </div>
                                <span style={styles.progressText}>{courseProgress[course.id] || 0}% completado</span>
                            </div>

                            <div style={styles.cardFooter}>
                                <button
                                    style={styles.viewGraphBtn}
                                    onClick={() => navigate(`/graph/${course.id}`)}
                                >
                                    Ver grafo →
                                </button>
                                <button
                                    style={styles.viewStudentsBtn}
                                    onClick={() => loadCourseStudents(course.id, course.title)}
                                    disabled={loadingStudents && showStudentsFor === course.id}
                                >
                                    {loadingStudents && showStudentsFor === course.id ? 'Cargando...' : '👥 Ver estudiantes inscritos'}
                                </button>

                            </div>
                            <div>
                                <button
                                    style={styles.deleteBtn}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        deleteCourse(course.id, course.title)
                                    }}
                                >
                                    🗑️ Eliminar
                                </button>

                                <button
                                    style={styles.heatmapBtn}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        // Abrir modal de heatmap
                                        const heatmapWindow = window.open('', '_blank', 'width=1200,height=800')
                                        if (heatmapWindow) {
                                            // Renderizar heatmap en nueva ventana o usar modal
                                            // Por ahora usamos alert para indicar
                                            alert('Funcionalidad Heatmap - Próximamente en modal')
                                        }
                                    }}
                                >
                                    📊 Heatmap
                                </button>
                            </div>


                        </div>
                    ))}
                </div>
            </div>

            {showGoogleCourses && (
                <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>Mis clases de Google Classroom</h2>
                    {loadingGoogle ? (
                        <p>Cargando cursos de Google...</p>
                    ) : googleCourses.length === 0 ? (
                        <div style={styles.emptyState}>
                            <p>No se encontraron cursos activos en Google Classroom</p>
                            <p style={styles.emptySubtext}>Asegúrate de tener cursos activos en Google Classroom</p>
                        </div>
                    ) : (
                        <div style={styles.grid}>
                            {googleCourses.map((course) => (
                                <div key={course.id} style={styles.googleCard}>
                                    <div style={styles.cardDomain}>Google Classroom</div>
                                    <h3 style={styles.cardTitle}>{course.name}</h3>
                                    {course.section && <p style={styles.cardDesc}>{course.section}</p>}
                                    {course.descriptionHeading && (
                                        <p style={styles.courseDescription}>{course.descriptionHeading}</p>
                                    )}
                                    <div style={styles.cardFooter}>
                                        <button
                                            style={styles.syncBtn}
                                            onClick={() => syncGoogleCourse(course.id, course.name)}
                                            disabled={syncing === course.id}
                                        >
                                            {syncing === course.id ? 'Sincronizando...' : '📥 Importar estudiantes →'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal de estudiantes */}
            {showStudentsFor && selectedCourseStudents.length > 0 && (
                <div style={styles.studentsModal}>
                    <div style={styles.studentsModalContent}>
                        <h3>Estudiantes inscritos</h3>
                        <ul>
                            {selectedCourseStudents.map((student, idx) => (
                                <li key={idx}>{student.name || student.email}</li>
                            ))}
                        </ul>
                        <button onClick={() => setShowStudentsFor(null)}>Cerrar</button>
                    </div>
                </div>
            )}
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page: { maxWidth: 960, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' },
    header: { marginBottom: 48 },
    title: { fontSize: 32, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    subtitle: { fontSize: 16, color: '#888780', marginTop: 8 },
    section: { marginBottom: 40 },
    sectionTitle: { fontSize: 18, fontWeight: 600, color: '#2C2C2A', marginBottom: 20 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
    card: { background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 24 },
    cardDomain: { fontSize: 11, fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
    cardTitle: { fontSize: 18, fontWeight: 600, color: '#1E3A5F', margin: '0 0 8px' },
    cardDesc: { fontSize: 14, color: '#888780', lineHeight: 1.5, margin: '0 0 16px' },
    progressContainer: { marginBottom: 16 },
    progressBar: { height: 6, background: '#F1EFE8', borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', background: '#1D9E75', borderRadius: 3, transition: 'width 0.3s' },
    progressText: { fontSize: 11, color: '#888780', marginTop: 4, display: 'block', textAlign: 'center' },
    cardFooter: { display: 'flex', gap: 8, marginTop: 8 },
    viewGraphBtn: { flex: 1, background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    viewStudentsBtn: { flex: 1, background: '#E8E6E1', color: '#1E3A5F', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted: { color: '#888780', fontSize: 16 },
    error: { color: '#A32D2D', fontSize: 16 },
    generateBtn: { background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    userBadge: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '6px 12px', border: '1px solid #D3D1C7' },
    userPhoto: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' as const },
    userName: { fontSize: 13, fontWeight: 500, color: '#1E3A5F' },
    connected: { fontSize: 11, color: '#1D9E75', fontWeight: 600 },
    googleBtn: { background: '#fff', color: '#1E3A5F', border: '1px solid #D3D1C7', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    googleClassroomBtn: {
        background: '#fff',
        color: '#1E3A5F',
        border: '1px solid #D3D1C7',
        borderRadius: 8,
        padding: '10px 18px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
    },
    googleCard: {
        background: '#fff',
        border: '1px solid #E8E6E1',
        borderRadius: 12,
        padding: 24,
        transition: 'all 0.2s ease'
    },
    syncBtn: {
        background: '#E1F5EE',
        color: '#1D9E75',
        border: 'none',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        width: '100%',
        marginTop: 12
    },
    emptyState: {
        background: '#fff',
        borderRadius: 12,
        padding: '48px 24px',
        textAlign: 'center',
        border: '1px solid #D3D1C7',
        color: '#6B6E6A'
    },
    emptySubtext: {
        fontSize: 13,
        marginTop: 8,
        color: '#888780'
    },
    courseDescription: {
        fontSize: 13,
        color: '#6B6E6A',
        margin: '8px 0'
    },
    studentsModal: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    },
    studentsModalContent: {
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        minWidth: 300,
        maxWidth: 500
    },
    deleteBtn: {
        background: '#FCEBEB',
        color: '#A32D2D',
        border: 'none',
        borderRadius: 6,
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        width: '100%',
        marginTop: 8
    },
    heatmapBtn: {
        background: '#E8E6E1',
        color: '#1E3A5F',
        border: 'none',
        borderRadius: 6,
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        flex: 1
    },
}