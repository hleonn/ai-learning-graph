import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses, getStudentMastery } from '../lib/api'
import HeatmapView from '../components/HeatmapView'
import { generateAndDownloadPDF } from '../utils/generateProgramPDF'

interface Course {
    id: string
    title: string
    description: string
    domain: string
    difficulty_level?: string
    created_at: string
    google_classroom_id?: string
    roadmap?: any
}

// Tipo para las pestañas de navegación
type TabType = 'courses' | 'programs' | 'classroom'

// Interfaz para programas (bootcamps, diplomados, etc.)
interface Program {
    id: string
    title: string
    description: string
    type: 'bootcamp' | 'diploma' | 'specialty' | 'workshop'
    duration_weeks: number
    courses_count: number
    image_url?: string
}

export default function Dashboard() {
    const navigate = useNavigate()

    // Estado de navegación
    const [activeTab, setActiveTab] = useState<TabType>('courses')

    // Estados existentes
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

    // Estados para programas (inicialmente vacíos)
    const [programs, setPrograms] = useState<Program[]>([])
    const [loadingPrograms, setLoadingPrograms] = useState(false)

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

    // Función para generar el programa del curso desde el Dashboard
    const handleGenerateCourseProgram = async (course: Course) => {
        try {
            const token = localStorage.getItem('google_token')
            if (!token) {
                alert('Debes iniciar sesión')
                return
            }

            const response = await fetch(`https://mygateway.up.railway.app/courses/${course.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (!response.ok) {
                throw new Error('Error al obtener el curso')
            }

            const courseData = await response.json()

            if (!courseData.roadmap) {
                alert('Este curso no tiene un roadmap generado')
                return
            }

            await generateAndDownloadPDF(
                courseData.roadmap,
                course.title,
                course.description || `Curso de ${course.title}`,
                course.difficulty_level || 'intermediate'
            )

        } catch (error: any) {
            console.error('Error generando programa:', error)
            alert(`Error al generar el programa: ${error.message}`)
        }
    }

    // Función para cargar programas (futura implementación)
    const loadPrograms = async () => {
        setLoadingPrograms(true)
        try {
            // TODO: Conectar con API real cuando exista
            // Por ahora datos de ejemplo para mostrar la estructura
            const mockPrograms: Program[] = [
                {
                    id: '1',
                    title: 'Data Science Bootcamp',
                    description: 'Conviértete en Científico de Datos en 12 semanas',
                    type: 'bootcamp',
                    duration_weeks: 12,
                    courses_count: 4
                },
                {
                    id: '2',
                    title: 'Diplomado en Desarrollo Full Stack',
                    description: 'Domina frontend y backend con proyectos reales',
                    type: 'diploma',
                    duration_weeks: 16,
                    courses_count: 6
                },
                {
                    id: '3',
                    title: 'Especialidad en Machine Learning',
                    description: 'Aprende los algoritmos más avanzados de ML',
                    type: 'specialty',
                    duration_weeks: 8,
                    courses_count: 3
                }
            ]
            setPrograms(mockPrograms)
        } catch (error) {
            console.error('Error loading programs:', error)
        } finally {
            setLoadingPrograms(false)
        }
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

                    if (user.role === 'student') {
                        const enrolled = await getEnrolledCourses(user.id)
                        setCourses(enrolled)
                    } else {
                        setCourses(coursesData.courses)
                    }
                } else {
                    setCourses(coursesData.courses)
                }

                // Cargar programas (datos mock por ahora)
                await loadPrograms()

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

    // Renderizar contenido según la pestaña activa
    const renderContent = () => {
        switch (activeTab) {
            case 'courses':
                return (
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Mis Cursos</h2>
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
                                                    <button
                                                        style={styles.programBtn}
                                                        onClick={() => handleGenerateCourseProgram(course)}
                                                        title="Generar programa del curso"
                                                    >
                                                        📋 Programa
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
                        {courses.length === 0 && (
                            <div style={styles.emptyState}>
                                <p>No tienes cursos disponibles. Genera uno nuevo con el botón "+ Generar currículo con AI"</p>
                            </div>
                        )}
                    </div>
                )

            case 'programs':
                return (
                    <div style={styles.section}>
                        <div style={styles.sectionHeader}>
                            <h2 style={styles.sectionTitle}>Programas de Formación</h2>
                            {isTeacher && (
                                <button style={styles.generateBtn} onClick={() => alert('Próximamente: Crear nuevo programa')}>
                                    + Crear programa
                                </button>
                            )}
                        </div>
                        <p style={styles.sectionDescription}>
                            Bootcamps, diplomados, especialidades y talleres para una formación más completa.
                        </p>

                        {loadingPrograms ? (
                            <p style={styles.muted}>Cargando programas...</p>
                        ) : (
                            <>
                                {/* Bootcamps */}
                                {programs.filter(p => p.type === 'bootcamp').length > 0 && (
                                    <div style={styles.subsection}>
                                        <h3 style={styles.subsectionTitle}>🚀 Bootcamps</h3>
                                        <div style={styles.grid4Cols}>
                                            {programs.filter(p => p.type === 'bootcamp').map((program) => (
                                                <div key={program.id} style={styles.programCard}>
                                                    <div style={styles.programBadge}>Bootcamp</div>
                                                    <h3 style={styles.cardTitle}>{program.title}</h3>
                                                    <p style={styles.cardDesc}>{program.description}</p>
                                                    <div style={styles.programMeta}>
                                                        <span>📅 {program.duration_weeks} semanas</span>
                                                        <span>📚 {program.courses_count} cursos</span>
                                                    </div>
                                                    <button style={styles.programDetailBtn} onClick={() => alert(`Detalles de ${program.title}`)}>
                                                        Ver programa →
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Diplomados */}
                                {programs.filter(p => p.type === 'diploma').length > 0 && (
                                    <div style={styles.subsection}>
                                        <h3 style={styles.subsectionTitle}>🎓 Diplomados</h3>
                                        <div style={styles.grid4Cols}>
                                            {programs.filter(p => p.type === 'diploma').map((program) => (
                                                <div key={program.id} style={styles.programCard}>
                                                    <div style={styles.programBadge}>Diplomado</div>
                                                    <h3 style={styles.cardTitle}>{program.title}</h3>
                                                    <p style={styles.cardDesc}>{program.description}</p>
                                                    <div style={styles.programMeta}>
                                                        <span>📅 {program.duration_weeks} semanas</span>
                                                        <span>📚 {program.courses_count} cursos</span>
                                                    </div>
                                                    <button style={styles.programDetailBtn} onClick={() => alert(`Detalles de ${program.title}`)}>
                                                        Ver programa →
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Especialidades */}
                                {programs.filter(p => p.type === 'specialty').length > 0 && (
                                    <div style={styles.subsection}>
                                        <h3 style={styles.subsectionTitle}>⚡ Especialidades</h3>
                                        <div style={styles.grid4Cols}>
                                            {programs.filter(p => p.type === 'specialty').map((program) => (
                                                <div key={program.id} style={styles.programCard}>
                                                    <div style={styles.programBadge}>Especialidad</div>
                                                    <h3 style={styles.cardTitle}>{program.title}</h3>
                                                    <p style={styles.cardDesc}>{program.description}</p>
                                                    <div style={styles.programMeta}>
                                                        <span>📅 {program.duration_weeks} semanas</span>
                                                        <span>📚 {program.courses_count} cursos</span>
                                                    </div>
                                                    <button style={styles.programDetailBtn} onClick={() => alert(`Detalles de ${program.title}`)}>
                                                        Ver programa →
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Talleres */}
                                {programs.filter(p => p.type === 'workshop').length === 0 && (
                                    <div style={styles.emptyState}>
                                        <p>Próximamente: Talleres prácticos de corta duración.</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )

            case 'classroom':
                return (
                    <div style={styles.section}>
                        <div style={styles.sectionHeader}>
                            <h2 style={styles.sectionTitle}>Google Classroom</h2>
                            {isTeacher && (
                                <button
                                    style={styles.generateBtn}
                                    onClick={() => {
                                        if (googleCourses.length === 0) loadGoogleCourses()
                                        setShowGoogleCourses(!showGoogleCourses)
                                    }}
                                >
                                    📚 {showGoogleCourses ? 'Ocultar' : 'Mostrar'} mis clases
                                </button>
                            )}
                        </div>

                        {showGoogleCourses && isTeacher && (
                            <>
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
                            </>
                        )}

                        {!showGoogleCourses && (
                            <div style={styles.emptyState}>
                                <p>Haz clic en "Mostrar mis clases" para ver tus cursos de Google Classroom.</p>
                            </div>
                        )}
                    </div>
                )

            default:
                return null
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h1 style={styles.title}>AI Learning Graph</h1>
                        <p style={styles.subtitle}>Plataforma de conocimiento adaptativo</p>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        {isTeacher && activeTab === 'courses' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button style={styles.generateBtn} onClick={() => navigate('/curriculum')}>
                                    + Generar currículo con AI
                                </button>
                                <button style={styles.bootcampBtn} onClick={() => navigate('/bootcamp')}>
                                    🎓 Crear Bootcamp
                                </button>
                            </div>
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

            {/* Navegación por pestañas */}
            <div style={styles.tabsContainer}>
                <button
                    style={{ ...styles.tab, ...(activeTab === 'courses' ? styles.tabActive : {}) }}
                    onClick={() => setActiveTab('courses')}
                >
                    📚 Mis Cursos
                </button>
                <button
                    style={{ ...styles.tab, ...(activeTab === 'programs' ? styles.tabActive : {}) }}
                    onClick={() => setActiveTab('programs')}
                >
                    🎓 Programas
                </button>
                <button
                    style={{ ...styles.tab, ...(activeTab === 'classroom' ? styles.tabActive : {}) }}
                    onClick={() => setActiveTab('classroom')}
                >
                    🏫 Google Classroom
                </button>
            </div>

            {/* Contenido dinámico según pestaña */}
            {renderContent()}

            {/* Modales (mantienen su funcionalidad original) */}
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
    header: { marginBottom: 32 },
    title: { fontSize: 32, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    subtitle: { fontSize: 16, color: '#888780', marginTop: 8 },

    // Navegación por pestañas
    tabsContainer: {
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid #D3D1C7',
        marginBottom: 32,
        paddingBottom: 0
    },
    tab: {
        padding: '12px 24px',
        fontSize: 15,
        fontWeight: 500,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#6B6E6A',
        borderBottom: '2px solid transparent',
        transition: 'all 0.2s ease'
    },
    tabActive: {
        color: '#1E3A5F',
        borderBottomColor: '#1E3A5F',
        fontWeight: 600
    },

    section: { marginBottom: 40 },
    sectionTitle: { fontSize: 20, fontWeight: 600, color: '#2C2C2A', marginBottom: 20 },
    sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionDescription: { fontSize: 14, color: '#888780', marginBottom: 24 },
    subsection: { marginBottom: 32 },
    subsectionTitle: { fontSize: 18, fontWeight: 600, color: '#1E3A5F', marginBottom: 16, paddingLeft: 4 },

    grid4Cols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 },

    // Tarjetas de cursos (existentes)
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
    programBtn: { background: '#6B6E6A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500, minWidth: 40 },
    deleteBtn: { background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500, width: '100%' },

    // Tarjetas de programas
    programCard: { background: 'linear-gradient(135deg, #fff 0%, #F9F9F8 100%)', border: '1px solid #D3D1C7', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', transition: 'transform 0.2s ease' },
    programBadge: { display: 'inline-block', background: '#1E3A5F', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 20, marginBottom: 10, width: 'fit-content' },
    programMeta: { display: 'flex', gap: 12, fontSize: 11, color: '#888780', margin: '8px 0', padding: '8px 0', borderTop: '1px solid #F1EFE8', borderBottom: '1px solid #F1EFE8' },
    programDetailBtn: { background: '#E8E6E1', color: '#1E3A5F', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500, marginTop: 8, width: '100%' },

    // Google Classroom
    googleCard: { background: '#fff', border: '1px solid #E8E6E1', borderRadius: 12, padding: 16, transition: 'all 0.2s ease' },
    syncBtn: { background: '#E1F5EE', color: '#1D9E75', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500, width: '100%', marginTop: 10 },

    // Estados vacíos y comunes
    emptyState: { background: '#fff', borderRadius: 12, padding: '60px 20px', textAlign: 'center', border: '1px solid #D3D1C7', color: '#6B6E6A' },
    center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted: { color: '#888780', fontSize: 16, textAlign: 'center' },
    error: { color: '#A32D2D', fontSize: 16 },
    generateBtn: { background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },

    // Usuario
    userBadge: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '4px 10px', border: '1px solid #D3D1C7' },
    userPhoto: { width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' as const },
    userName: { fontSize: 12, fontWeight: 500, color: '#1E3A5F' },
    connected: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: '#E1F5EE', color: '#1D9E75' },
    googleBtn: { background: '#fff', color: '#1E3A5F', border: '1px solid #D3D1C7', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },

    // Modales
    studentsModal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    studentsModalContent: { background: '#fff', borderRadius: 12, padding: 24, minWidth: 300, maxWidth: 500 },
    bootcampBtn: {
        background: '#9B59B6',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 16px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
    },
}