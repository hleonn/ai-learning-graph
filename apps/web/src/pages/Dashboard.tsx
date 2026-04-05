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
    const [allCourses, setAllCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const userName = localStorage.getItem('user_name')
    const userPhoto = localStorage.getItem('user_photo')
    const [courseProgress, setCourseProgress] = useState<Record<string, number>>({})
    const [courseStudentsCount, setCourseStudentsCount] = useState<Record<string, number>>({})
    const [courseAvgProgress, setCourseAvgProgress] = useState<Record<string, number>>({})
    const [userRole, setUserRole] = useState<string>('teacher')
    const [enrolledCourses, setEnrolledCourses] = useState<Set<string>>(new Set())

    // Google Classroom state
    const [googleCourses, setGoogleCourses] = useState<any[]>([])
    const [showGoogleCourses, setShowGoogleCourses] = useState(false)
    const [syncing, setSyncing] = useState<string | null>(null)
    const [loadingGoogle, setLoadingGoogle] = useState(false)

    // Students list state
    const [selectedCourseStudents, setSelectedCourseStudents] = useState<any[]>([])
    const [showStudentsFor, setShowStudentsFor] = useState<string | null>(null)

    // Heatmap state
    const [heatmapCourse, setHeatmapCourse] = useState<{ id: string; title: string } | null>(null)

    const navigate = useNavigate()

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

    const loadUserEnrollments = async (userId: string) => {
        try {
            const response = await fetch(`https://mygateway.up.railway.app/api/user/${userId}/enrollments`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('google_token')}` }
            })
            if (response.ok) {
                const data = await response.json()
                setEnrolledCourses(new Set(data.enrolledCourseIds))
            }
        } catch (error) {
            console.error('Error loading enrollments:', error)
        }
    }

    const loadAllCoursesData = async (userId: string) => {
        const progressMap: Record<string, number> = {}
        const studentsMap: Record<string, number> = {}
        const avgProgressMap: Record<string, number> = {}

        for (const course of allCourses) {
            try {
                const masteryData = await getStudentMastery(userId, course.id)
                const masteredCount = masteryData.nodes?.filter((n: any) => n.mastery_score >= 0.8).length || 0
                const totalNodes = masteryData.summary?.total_nodes || 1
                progressMap[course.id] = Math.round((masteredCount / totalNodes) * 100)

                const stats = await loadCourseStats(course.id)
                studentsMap[course.id] = stats.students || 0

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

    const getEnrolledCourses = async (userId: string): Promise<Course[]> => {
        try {
            const response = await fetch(`https://mygateway.up.railway.app/api/user/${userId}/enrolled-courses`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('google_token')}` }
            })
            if (response.ok) {
                const data = await response.json()
                return data.courses
            }
        } catch (error) {
            console.error('Error getting enrolled courses:', error)
        }
        return []
    }

    useEffect(() => {
        const init = async () => {
            try {
                const coursesData = await getCourses()
                setAllCourses(coursesData.courses)

                const user = await getCurrentUser()
                if (user) {
                    setUserRole(user.role)
                    await loadUserEnrollments(user.id)
                    if (coursesData.courses.length > 0) {
                        await loadAllCoursesData(user.id)
                    }

                    // Filtrar cursos según rol
                    if (user.role === 'student') {
                        const enrolled = await getEnrolledCourses(user.id)
                        setCourses(enrolled)
                    } else {
                        setCourses(coursesData.courses)
                    }
                } else {
                    setCourses(coursesData.courses)
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
        if (!token) return

        setLoadingGoogle(true)
        try {
            const response = await fetch('https://mygateway.up.railway.app/auth/classroom/courses', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            if (data.courses) setGoogleCourses(data.courses)
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
                setAllCourses(coursesData.courses)
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
            setShowStudentsFor(null)
        }
    }

    const deleteCourse = async (courseId: string, courseTitle: string) => {
        if (!confirm(`¿Eliminar el curso "${courseTitle}"?\n\nSe eliminarán todos los conceptos, aristas y progreso de estudiantes.`)) return

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
                setAllCourses(coursesData.courses)
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
                        {isTeacher && (
                            <button style={styles.generateBtn} onClick={() => navigate('/curriculum')}>
                                + Generar currículo con AI
                            </button>
                        )}

                        {userName && isTeacher && (
                            <button
                                style={styles.googleClassroomBtn}
                                onClick={() => {
                                    if (!showGoogleCourses && googleCourses.length === 0) loadGoogleCourses()
                                    setShowGoogleCourses(!showGoogleCourses)
                                }}
                            >
                                📚 {showGoogleCourses ? 'Ocultar' : 'Mostrar'} Google Classroom
                            </button>
                        )}

                        {userName ? (
                            <div style={styles.userBadge}>
                                {userPhoto && <img src={userPhoto} style={styles.userPhoto} alt={userName} />}
                                <span style={styles.userName}>{userName}</span>
                                <span style={styles.connected}>{isTeacher ? '👨‍🏫 Profesor' : '🎓 Estudiante'}</span>
                            </div>
                        ) : (
                            <button style={styles.googleBtn} onClick={() => window.location.href = 'https://mygateway.up.railway.app/auth/google'}>
                                Conectar Google Classroom
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Cursos disponibles</h2>
                <div style={styles.grid4Cols}>
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
                                <p style={styles.cardDesc}>{course.description.substring(0, 100)}...</p>

                                <div style={styles.progressContainer}>
                                    <div style={styles.progressBar}>
                                        <div style={{...styles.progressFill, width: `${displayProgress}%`}}/>
                                    </div>
                                    <span style={styles.progressText}>{displayProgress}% {progressLabel}</span>
                                </div>

                                <div style={styles.courseStats}>
                                    <span>📊 {displayProgress}%</span>
                                    <span>👥 {courseStudentsCount[course.id] || 0}</span>
                                    <span>{isTeacher ? '👨‍🏫' : (enrolledCourses.has(course.id) ? '🔓' : '🔒')}</span>
                                </div>

                                <div style={styles.buttonGroup}>
                                    <button style={styles.viewGraphBtn} onClick={() => navigate(`/graph/${course.id}`)}>
                                        Ver grafo →
                                    </button>
                                    {isTeacher && (
                                        <>
                                            <button style={styles.viewStudentsBtn} onClick={() => loadCourseStudents(course.id, course.title)}>
                                                👥
                                            </button>
                                            <button style={styles.heatmapBtn} onClick={() => setHeatmapCourse({ id: course.id, title: course.title })}>
                                                📊
                                            </button>
                                        </>
                                    )}
                                </div>

                                {isTeacher && (
                                    <button style={styles.deleteBtn} onClick={() => deleteCourse(course.id, course.title)}>
                                        🗑️ Eliminar
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {showGoogleCourses && isTeacher && (
                <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>Mis clases de Google Classroom</h2>
                    {loadingGoogle ? (
                        <p>Cargando cursos de Google...</p>
                    ) : googleCourses.length === 0 ? (
                        <div style={styles.emptyState}>
                            <p>No se encontraron cursos activos en Google Classroom</p>
                        </div>
                    ) : (
                        <div style={styles.grid4Cols}>
                            {googleCourses.map((course) => (
                                <div key={course.id} style={styles.googleCard}>
                                    <div style={styles.cardDomain}>Google Classroom</div>
                                    <h3 style={styles.cardTitle}>{course.name}</h3>
                                    {course.section && <p style={styles.cardDesc}>{course.section}</p>}
                                    <button style={styles.syncBtn} onClick={() => syncGoogleCourse(course.id, course.name)} disabled={syncing === course.id}>
                                        {syncing === course.id ? 'Sincronizando...' : '📥 Importar'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

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

            {heatmapCourse && isTeacher && (
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
    page: { maxWidth: 1200, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' },
    header: { marginBottom: 48 },
    title: { fontSize: 32, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    subtitle: { fontSize: 16, color: '#888780', marginTop: 8 },
    section: { marginBottom: 40 },
    sectionTitle: { fontSize: 18, fontWeight: 600, color: '#2C2C2A', marginBottom: 20 },
    grid4Cols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
    card: { background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardDomain: { fontSize: 10, fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.05em' },
    cardDifficulty: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: '#E8E6E1', color: '#1E3A5F' },
    cardTitle: { fontSize: 16, fontWeight: 600, color: '#1E3A5F', margin: '0 0 6px' },
    cardDesc: { fontSize: 12, color: '#6B6E6A', lineHeight: 1.4, margin: '0 0 12px' },
    progressContainer: { marginBottom: 10 },
    progressBar: { height: 4, background: '#F1EFE8', borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.3s' },
    progressText: { fontSize: 10, color: '#888780', marginTop: 3, display: 'block', textAlign: 'center' },
    courseStats: { display: 'flex', gap: 8, justifyContent: 'space-between', fontSize: 10, color: '#888780', marginBottom: 10, padding: '6px 0', borderTop: '1px solid #F1EFE8', borderBottom: '1px solid #F1EFE8' },
    buttonGroup: { display: 'flex', gap: 6, marginBottom: 8 },
    viewGraphBtn: { flex: 1, background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500 },
    viewStudentsBtn: { background: '#E8E6E1', color: '#1E3A5F', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500, minWidth: 40 },
    heatmapBtn: { background: '#E1F5EE', color: '#1D9E75', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500, minWidth: 40 },
    deleteBtn: { background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500, width: '100%' },
    center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted: { color: '#888780', fontSize: 16 },
    error: { color: '#A32D2D', fontSize: 16 },
    generateBtn: { background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    userBadge: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '4px 10px', border: '1px solid #D3D1C7' },
    userPhoto: { width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' as const },
    userName: { fontSize: 12, fontWeight: 500, color: '#1E3A5F' },
    connected: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: '#E1F5EE', color: '#1D9E75' },
    googleBtn: { background: '#fff', color: '#1E3A5F', border: '1px solid #D3D1C7', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    googleClassroomBtn: { background: '#fff', color: '#1E3A5F', border: '1px solid #D3D1C7', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    googleCard: { background: '#fff', border: '1px solid #E8E6E1', borderRadius: 12, padding: 16, transition: 'all 0.2s ease' },
    syncBtn: { background: '#E1F5EE', color: '#1D9E75', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500, width: '100%', marginTop: 10 },
    emptyState: { background: '#fff', borderRadius: 12, padding: '40px 20px', textAlign: 'center', border: '1px solid #D3D1C7', color: '#6B6E6A' },
    studentsModal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    studentsModalContent: { background: '#fff', borderRadius: 12, padding: 24, minWidth: 300, maxWidth: 500 },
}