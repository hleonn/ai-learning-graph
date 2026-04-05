import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses, getStudentMastery } from '../lib/api'
import HeatmapView from '../components/HeatmapView'

interface Course {
    id: string
    title: string
    description: string
    domain: string
    difficulty_level?: string
    created_at: string
    google_classroom_id?: string
}

export default function Dashboard() {
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const userName = localStorage.getItem('user_name')
    const userPhoto = localStorage.getItem('user_photo')
    const [courseProgress, setCourseProgress] = useState<Record<string, number>>({})
    const [courseStudentsCount, setCourseStudentsCount] = useState<Record<string, number>>({})
    const [courseAvgProgress, setCourseAvgProgress] = useState<Record<string, number>>({})
    const [userRole, setUserRole] = useState<string>('teacher')

    // Google Classroom state
    const [googleCourses, setGoogleCourses] = useState<any[]>([])
    const [showGoogleCourses, setShowGoogleCourses] = useState(false)
    const [syncing, setSyncing] = useState<string | null>(null)
    const [loadingGoogle, setLoadingGoogle] = useState(false)

    // Students list state
    const [selectedCourseStudents, setSelectedCourseStudents] = useState<any[]>([])
    const [showStudentsFor, setShowStudentsFor] = useState<string | null>(null)
    const [loadingStudents, setLoadingStudents] = useState(false)

    // Heatmap state
    const [heatmapCourse, setHeatmapCourse] = useState<{ id: string; title: string } | null>(null)

    const navigate = useNavigate()

    // Obtener el userId actual y rol
    const getCurrentUser = async (): Promise<{ id: string; role: string } | null> => {
        const token = localStorage.getItem('google_token')
        if (!token) return null

        try {
            const payload = JSON.parse(atob(token.split('.')[1]))
            const email = payload.email
            const response = await fetch(`https://mygateway.up.railway.app/api/user/by-email/${email}`)
            if (response.ok) {
                const userData = await response.json()
                const roleResponse = await fetch(`https://mygateway.up.railway.app/api/user/role/${userData.id}`)
                if (roleResponse.ok) {
                    const roleData = await roleResponse.json()
                    return { id: userData.id, role: roleData.role }
                }
                return { id: userData.id, role: 'student' }
            }
            return null
        } catch {
            return null
        }
    }

    // Cargar estadísticas de un curso
    const loadCourseStats = async (courseId: string) => {
        const token = localStorage.getItem('google_token')
        if (!token) return { students: 0 }

        try {
            const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}/students`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                return { students: data.total || 0 }
            }
        } catch (error) {
            console.error('Error loading course stats:', error)
        }
        return { students: 0 }
    }

    // Cargar progreso promedio de la clase
    const loadAvgClassProgress = async (courseId: string) => {
        const token = localStorage.getItem('google_token')
        if (!token) return 0

        try {
            const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}/avg-progress`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                return data.avgProgress || 0
            }
        } catch (error) {
            console.error('Error loading avg progress:', error)
        }
        return 0
    }

    // Cargar datos de todos los cursos
    const loadAllCoursesData = async (userId: string) => {
        const progressMap: Record<string, number> = {}
        const studentsMap: Record<string, number> = {}
        const avgProgressMap: Record<string, number> = {}

        for (const course of courses) {
            try {
                // Progreso individual del usuario (para estudiantes)
                const masteryData = await getStudentMastery(userId, course.id)
                const masteredCount = masteryData.nodes?.filter((n: any) => n.mastery_score >= 0.8).length || 0
                const totalNodes = masteryData.summary?.total_nodes || 1
                progressMap[course.id] = Math.round((masteredCount / totalNodes) * 100)

                // Estadísticas del curso
                const stats = await loadCourseStats(course.id)
                studentsMap[course.id] = stats.students || 0

                // Progreso promedio de la clase (para profesores)
                const avgProgress = await loadAvgClassProgress(course.id)
                avgProgressMap[course.id] = avgProgress
            } catch (e) {
                progressMap[course.id] = 0
                studentsMap[course.id] = 0
                avgProgressMap[course.id] = 0
            }
        }

        setCourseProgress(progressMap)
        setCourseStudentsCount(studentsMap)
        setCourseAvgProgress(avgProgressMap)
    }

    useEffect(() => {
        const init = async () => {
            try {
                const coursesData = await getCourses()
                setCourses(coursesData.courses)

                const user = await getCurrentUser()
                if (user) {
                    setUserRole(user.role)
                    if (coursesData.courses.length > 0) {
                        await loadAllCoursesData(user.id)
                    }
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
            const response = await fetch(`https://mygateway.up.railway.app/courses/${courseId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })

            if (response.ok) {
                alert(`✅ Curso "${courseTitle}" eliminado correctamente`)
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

    const isTeacher = userRole === 'teacher'

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
                                <span style={styles.connected}>✓ {isTeacher ? 'Profesor' : 'Classroom'}</span>
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
                    {courses.map((course) => {
                        const displayProgress = isTeacher ? courseAvgProgress[course.id] || 0 : courseProgress[course.id] || 0
                        const progressLabel = isTeacher ? 'promedio clase' : 'completado'

                        return (
                            <div key={course.id} style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <div style={styles.cardDomain}>{course.domain}</div>
                                    <div style={styles.cardDifficulty}>
                                        {course.difficulty_level === 'beginner' && '🔰 Principiante'}
                                        {course.difficulty_level === 'intermediate' && '📘 Intermedio'}
                                        {course.difficulty_level === 'advanced' && '🚀 Avanzado'}
                                        {course.difficulty_level === 'expert' && '🎓 Certificación'}
                                        {!course.difficulty_level && '📚 Estándar'}
                                    </div>
                                </div>
                                <h3 style={styles.cardTitle}>{course.title}</h3>
                                <p style={styles.cardDesc}>{course.description}</p>

                                {/* Barra de progreso */}
                                <div style={styles.progressContainer}>
                                    <div style={styles.progressBar}>
                                        <div style={{...styles.progressFill, width: `${displayProgress}%`}}/>
                                    </div>
                                    <span style={styles.progressText}>{displayProgress}% {progressLabel}</span>
                                </div>

                                {/* Estadísticas del curso */}
                                <div style={styles.courseStats}>
                                    <span>📊 {displayProgress}% {progressLabel}</span>
                                    <span>👥 {courseStudentsCount[course.id] || 0} estudiantes</span>
                                    <span>{isTeacher ? '👨‍🏫 Profesor' : (courseStudentsCount[course.id] ? '🔓 Inscrito' : '🔒 No inscrito')}</span>
                                </div>

                                <div style={styles.buttonGroup}>
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
                                        {loadingStudents && showStudentsFor === course.id ? 'Cargando...' : '👥 Estudiantes'}
                                    </button>
                                    <button
                                        style={styles.heatmapBtn}
                                        onClick={() => setHeatmapCourse({ id: course.id, title: course.title })}
                                    >
                                        📊 Heatmap
                                    </button>
                                </div>

                                <button
                                    style={styles.deleteBtn}
                                    onClick={() => deleteCourse(course.id, course.title)}
                                >
                                    🗑️ Eliminar curso
                                </button>
                            </div>
                        )
                    })}
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

            {/* Modal de Heatmap */}
            {heatmapCourse && (
                <HeatmapView
                    courseId={heatmapCourse.id}
                    courseTitle={heatmapCourse.title}
                    onClose={() => setHeatmapCourse(null)}
                />
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
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 },
    card: { background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cardDomain: { fontSize: 11, fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.05em' },
    cardDifficulty: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: '#E8E6E1', color: '#1E3A5F' },
    cardTitle: { fontSize: 18, fontWeight: 600, color: '#1E3A5F', margin: '0 0 8px' },
    cardDesc: { fontSize: 13, color: '#6B6E6A', lineHeight: 1.4, margin: '0 0 16px' },
    progressContainer: { marginBottom: 12 },
    progressBar: { height: 6, background: '#F1EFE8', borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', background: '#1D9E75', borderRadius: 3, transition: 'width 0.3s' },
    progressText: { fontSize: 11, color: '#888780', marginTop: 4, display: 'block', textAlign: 'center' },
    courseStats: { display: 'flex', gap: 12, justifyContent: 'space-between', fontSize: 11, color: '#888780', marginBottom: 12, padding: '8px 0', borderTop: '1px solid #F1EFE8', borderBottom: '1px solid #F1EFE8' },
    buttonGroup: { display: 'flex', gap: 8, marginBottom: 8 },
    viewGraphBtn: { flex: 1, background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
    viewStudentsBtn: { flex: 1, background: '#E8E6E1', color: '#1E3A5F', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
    heatmapBtn: { flex: 1, background: '#E1F5EE', color: '#1D9E75', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
    deleteBtn: { background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500, width: '100%' },
    center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted: { color: '#888780', fontSize: 16 },
    error: { color: '#A32D2D', fontSize: 16 },
    generateBtn: { background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    userBadge: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '6px 12px', border: '1px solid #D3D1C7' },
    userPhoto: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' as const },
    userName: { fontSize: 13, fontWeight: 500, color: '#1E3A5F' },
    connected: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: '#E1F5EE', color: '#1D9E75' },
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
        padding: 20,
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
}