import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses } from '../lib/api'

interface Course {
    id: string
    title: string
    description: string
    domain: string
    difficulty_level?: string
}

interface RecommendedCourse {
    title: string
    description: string
    domain: string
    difficulty_level: string
}

interface Module {
    id: string
    name: string
    order: number
    description: string
    node_ids: string[]
    weight: number
    complexity: number
    prerequisites_modules: number[]
    estimated_hours: number
}

interface Bootcamp {
    id: string
    title: string
    description: string
    duration_weeks: number
    modules: Module[]
    total_weight: number
}

export default function BootcampCreator() {
    const navigate = useNavigate()
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(false)
    const [bootcampTitle, setBootcampTitle] = useState('')
    const [bootcampDescription, setBootcampDescription] = useState('')
    const [durationWeeks, setDurationWeeks] = useState(16)
    const [selectedCourses, setSelectedCourses] = useState<string[]>([])
    const [recommendation, setRecommendation] = useState<{
        existing_courses: Course[]
        missing_courses: RecommendedCourse[]
        suggested_bootcamp: Bootcamp | null
        learning_path_personalized: any
    } | null>(null)
    const [bootcampId, setBootcampId] = useState<string | null>(null)
    const [createdBootcamp, setCreatedBootcamp] = useState<Bootcamp | null>(null)

    // Estados del nuevo flujo
    const [generatingCourses, setGeneratingCourses] = useState(false)
    const [checkingGraphs, setCheckingGraphs] = useState(false)
    const [buildingBootcamp, setBuildingBootcamp] = useState(false)
    const [allCoursesHaveGraphs, setAllCoursesHaveGraphs] = useState(false)
    const [generatedCourseIds, setGeneratedCourseIds] = useState<string[]>([])
    const [bootcampBuilt, setBootcampBuilt] = useState(false)

    // Cargar cursos disponibles
    useEffect(() => {
        const loadCourses = async () => {
            try {
                const data = await getCourses()
                setCourses(data.courses || [])
            } catch (error) {
                console.error('Error loading courses:', error)
            }
        }
        loadCourses()
    }, [])

    const handleRecommend = async () => {
        if (!bootcampTitle.trim()) {
            alert('Ingresa un título para el bootcamp')
            return
        }

        setLoading(true)
        try {
            const token = localStorage.getItem('google_token')
            const response = await fetch('https://mygateway.up.railway.app/bootcamp/recommend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: bootcampTitle,
                    description: bootcampDescription,
                    target_duration_weeks: durationWeeks,
                    required_course_ids: selectedCourses
                })
            })

            const data = await response.json()
            setRecommendation(data)
            setBootcampId(data.suggested_bootcamp?.id || null)
        } catch (error) {
            console.error('Error:', error)
            alert('Error al recomendar bootcamp')
        } finally {
            setLoading(false)
        }
    }

    const handleExportGEXF = async () => {
        if (!bootcampId) return

        try {
            const token = localStorage.getItem('google_token')
            const response = await fetch(`https://mygateway.up.railway.app/bootcamp/export/gexf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    bootcamp_id: bootcampId,
                    include_weights: true
                })
            })

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `bootcamp_${bootcampTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gexf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            alert('✅ Archivo GEXF exportado correctamente. Puedes abrirlo con Gephi.')

        } catch (error) {
            console.error('Error:', error)
            alert('Error al exportar a GEXF')
        }
    }

    const checkCoursesGraphs = async (courseIds: string[]) => {
        setCheckingGraphs(true)
        try {
            let allHaveGraphs = true
            for (const courseId of courseIds) {
                const response = await fetch(`https://mygateway.up.railway.app/graph/${courseId}`)
                const data = await response.json()
                if (!data.nodes || data.nodes.length === 0) {
                    allHaveGraphs = false
                    break
                }
            }
            setAllCoursesHaveGraphs(allHaveGraphs)
            return allHaveGraphs
        } catch (error) {
            console.error('Error checking graphs:', error)
            return false
        } finally {
            setCheckingGraphs(false)
        }
    }

    // Generar cursos faltantes con sus grafos
    const generateMissingCourses = async () => {
        if (!recommendation?.missing_courses?.length) return

        setGeneratingCourses(true)
        const newCourseIds = [...selectedCourses]
        const newGeneratedIds: string[] = []

        for (const missingCourse of recommendation.missing_courses) {
            try {
                // Generar roadmap
                const genResponse = await fetch('https://mygateway.up.railway.app/ai/roadmap/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: missingCourse.title,
                        description: missingCourse.description,
                        domain: missingCourse.domain,
                        difficulty_level: missingCourse.difficulty_level
                    })
                })
                const courseData = await genResponse.json()

                // Guardar curso
                const saveResponse = await fetch('https://mygateway.up.railway.app/courses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: missingCourse.title,
                        description: missingCourse.description,
                        domain: missingCourse.domain,
                        difficulty_level: missingCourse.difficulty_level,
                        roadmap: courseData
                    })
                })
                const savedCourse = await saveResponse.json()
                const newCourseId = savedCourse[0]?.id || savedCourse.id

                if (newCourseId) {
                    newCourseIds.push(newCourseId)
                    newGeneratedIds.push(newCourseId)
                }
            } catch (error) {
                console.error(`Error generando curso ${missingCourse.title}:`, error)
            }
        }

        setSelectedCourses(newCourseIds)
        setGeneratedCourseIds(newGeneratedIds)
        setGeneratingCourses(false)

        // Mostrar feedback de cursos generados
        if (newGeneratedIds.length > 0) {
            alert(`✅ Se generaron ${newGeneratedIds.length} cursos correctamente. Ahora verifica los grafos.`)
        }

        // Verificar grafos después de generar
        await checkCoursesGraphs(newCourseIds)
    }

    // Construcción discreta del bootcamp
    const buildBootcampDiscrete = async () => {
        if (!bootcampId || !allCoursesHaveGraphs) return

        setBuildingBootcamp(true)
        try {
            const token = localStorage.getItem('google_token')
            const composeResponse = await fetch('https://mygateway.up.railway.app/bootcamp/compose', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    bootcamp_id: bootcampId,
                    course_ids: selectedCourses,
                    student_id: null
                })
            })

            const bootcamp = await composeResponse.json()
            setCreatedBootcamp(bootcamp)
            setBootcampBuilt(true)
            alert(`✅ Bootcamp "${bootcampTitle}" construido exitosamente con ${bootcamp.modules?.length || 0} módulos`)

        } catch (error) {
            console.error('Error building bootcamp:', error)
            alert('Error al construir el bootcamp')
        } finally {
            setBuildingBootcamp(false)
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <button onClick={() => navigate('/dashboard')} style={styles.back}>← Volver al Dashboard</button>
                <h1 style={styles.title}>🎓 Creador de Bootcamps</h1>
                <p style={styles.subtitle}>Crea programas de formación combinando cursos existentes</p>
            </div>

            <div style={styles.container}>
                <div style={styles.formCard}>
                    <h2 style={styles.formTitle}>Información del Bootcamp</h2>

                    <div style={styles.field}>
                        <label style={styles.label}>Título del Bootcamp *</label>
                        <input
                            style={styles.input}
                            placeholder="Ej. Ingeniería en Inteligencia Artificial"
                            value={bootcampTitle}
                            onChange={e => setBootcampTitle(e.target.value)}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Descripción</label>
                        <textarea
                            style={styles.textarea}
                            placeholder="Describe el objetivo y contenido del bootcamp..."
                            value={bootcampDescription}
                            onChange={e => setBootcampDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Duración (semanas)</label>
                        <select
                            style={styles.select}
                            value={durationWeeks}
                            onChange={e => setDurationWeeks(Number(e.target.value))}
                        >
                            <option value={4}>1 mes</option>
                            <option value={8}>2 meses</option>
                            <option value={12}>3 meses</option>
                            <option value={16}>4 meses</option>
                            <option value={24}>6 meses</option>
                        </select>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Cursos disponibles para incluir</label>
                        <div style={styles.checkboxGroup}>
                            {courses.length === 0 ? (
                                <p style={styles.mutedText}>No hay cursos disponibles. Genera algunos primero.</p>
                            ) : (
                                courses.map(course => (
                                    <label key={course.id} style={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={selectedCourses.includes(course.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedCourses([...selectedCourses, course.id])
                                                } else {
                                                    setSelectedCourses(selectedCourses.filter(id => id !== course.id))
                                                }
                                            }}
                                        />
                                        <span>{course.title}</span>
                                        <span style={styles.courseBadge}>{course.domain}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    <button
                        style={styles.primaryBtn}
                        onClick={handleRecommend}
                        disabled={loading}
                    >
                        {loading ? '🔍 Analizando...' : '🔍 Recomendar estructura'}
                    </button>
                </div>

                {recommendation && (
                    <div style={styles.resultCard}>
                        <h2 style={styles.formTitle}>Recomendación IA</h2>

                        {/* Feedback de cursos generados */}
                        {generatedCourseIds.length > 0 && (
                            <div style={styles.successMessage}>
                                ✅ {generatedCourseIds.length} cursos generados correctamente.
                            </div>
                        )}

                        {/* Cursos existentes */}
                        <div style={styles.recommendationSection}>
                            <h3>📚 Cursos existentes</h3>
                            {recommendation.existing_courses?.length > 0 ? (
                                <ul>{recommendation.existing_courses.map(c => <li key={c.id}>✅ {c.title}</li>)}</ul>
                            ) : <p>No hay cursos seleccionados</p>}
                        </div>

                        {/* Cursos faltantes */}
                        <div style={styles.recommendationSection}>
                            <h3>⚠️ Cursos recomendados (faltantes)</h3>
                            {recommendation.missing_courses?.length > 0 ? (
                                <>
                                    <ul>{recommendation.missing_courses.map((c: RecommendedCourse, idx:number) =>
                                        <li key={idx}>📖 {c.title}</li>)}
                                    </ul>
                                    <button
                                        style={styles.warningBtn}
                                        onClick={generateMissingCourses}
                                        disabled={generatingCourses}
                                    >
                                        {generatingCourses ? '⏳ Generando cursos...' : '🔧 Generar cursos faltantes'}
                                    </button>
                                </>
                            ) : <p style={styles.successText}>✅ Tienes todos los cursos necesarios</p>}
                        </div>

                        {/* Botones de verificación y construcción */}
                        <div style={styles.buttonGroup}>
                            <button
                                style={styles.secondaryBtn}
                                onClick={() => checkCoursesGraphs(selectedCourses)}
                                disabled={checkingGraphs || selectedCourses.length === 0}
                            >
                                {checkingGraphs ? '🔍 Verificando grafos...' : '🔍 Verificar Grafos de Cursos'}
                            </button>

                            {allCoursesHaveGraphs && (
                                <button
                                    style={styles.successBtn}
                                    onClick={buildBootcampDiscrete}
                                    disabled={buildingBootcamp}
                                >
                                    {buildingBootcamp ? '🏗️ Construyendo bootcamp...' : '🏗️ Construcción Discreta de Bootcamp'}
                                </button>
                            )}
                        </div>

                        {/* Mostrar mensaje si los grafos están verificados */}
                        {allCoursesHaveGraphs && !bootcampBuilt && (
                            <div style={styles.successMessage}>
                                ✅ Todos los cursos tienen sus grafos. Puedes proceder con la construcción.
                            </div>
                        )}

                        {/* Módulos generados después de construcción */}
                        {createdBootcamp && (
                            <div style={styles.recommendationSection}>
                                <h3 style={styles.sectionSubtitle}>📋 Módulos generados</h3>
                                {createdBootcamp.modules?.map((module: Module) => (
                                    <div key={module.id} style={styles.modulePreview}>
                                        <div style={styles.moduleHeader}>
                                            <span style={styles.moduleOrder}>Módulo {module.order}</span>
                                            <span style={styles.moduleWeight}>Peso: {Math.round(module.weight * 100)}%</span>
                                        </div>
                                        <div style={styles.moduleName}>{module.name}</div>
                                        <div style={styles.moduleDesc}>{module.description}</div>
                                        <div style={styles.moduleMeta}>
                                            <span>📦 {module.node_ids.length} conceptos</span>
                                            <span>📊 Complejidad: {Math.round(module.complexity * 100)}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Botón de exportación */}
                        <div style={styles.buttonGroup}>
                            <button
                                style={styles.secondaryBtn}
                                onClick={handleExportGEXF}
                                disabled={!bootcampBuilt}
                            >
                                📊 Exportar a Gephi (GEXF)
                            </button>
                        </div>
                    </div>
                )}
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
    header: { marginBottom: 32 },
    back: {
        background: 'none',
        border: '1px solid #D3D1C7',
        padding: '6px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        marginBottom: 16,
        color: '#1E3A5F'
    },
    title: { fontSize: 32, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    subtitle: { fontSize: 16, color: '#888780', marginTop: 8 },
    container: { display: 'flex', gap: 32, flexWrap: 'wrap' },
    formCard: { flex: 1, minWidth: 320, background: '#fff', borderRadius: 12, border: '1px solid #D3D1C7', padding: 24 },
    resultCard: { flex: 1, minWidth: 320, background: '#fff', borderRadius: 12, border: '1px solid #D3D1C7', padding: 24 },
    formTitle: { fontSize: 20, fontWeight: 600, color: '#1E3A5F', marginBottom: 20 },
    field: { marginBottom: 16 },
    label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 },
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, fontFamily: 'inherit' },
    textarea: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' },
    select: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, background: '#fff', fontFamily: 'inherit' },
    checkboxGroup: { display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 200, overflowY: 'auto', padding: 10, border: '1px solid #F1EFE8', borderRadius: 8, background: '#F9F9F8' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '2px 4px' },
    courseBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#E8E6E1', color: '#1E3A5F', marginLeft: 6 },
    primaryBtn: { width: '100%', padding: '10px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    secondaryBtn: { width: '100%', padding: '10px', background: '#6B6E6A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    warningBtn: {
        width: '100%',
        padding: '10px',
        background: '#F5A623',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        marginTop: 12,
    },
    successBtn: {
        width: '100%',
        padding: '10px',
        background: '#1D9E75',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        marginTop: 8,
    },
    successMessage: {
        marginTop: 12,
        padding: '10px',
        background: '#E1F5EE',
        color: '#1D9E75',
        borderRadius: 8,
        fontSize: 13,
        textAlign: 'center',
    },
    buttonGroup: { display: 'flex', gap: 12, marginTop: 16, flexDirection: 'column' },
    recommendationSection: { marginBottom: 20, padding: 12, background: '#F9F9F8', borderRadius: 8 },
    sectionSubtitle: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', marginBottom: 10 },
    courseList: { marginTop: 8, paddingLeft: 20, color: '#2C2C2A', fontSize: 13, lineHeight: 1.6 },
    mutedText: { fontSize: 13, color: '#888780', textAlign: 'center', padding: 10 },
    successText: { fontSize: 13, color: '#1D9E75', textAlign: 'center', padding: 10 },
    modulePreview: { background: '#fff', border: '1px solid #E8E6E1', borderRadius: 8, padding: 12, marginBottom: 10 },
    moduleHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
    moduleOrder: { fontSize: 11, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', padding: '2px 8px', borderRadius: 12 },
    moduleWeight: { fontSize: 11, color: '#888780' },
    moduleName: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', marginBottom: 4 },
    moduleDesc: { fontSize: 12, color: '#6B6E6A', marginBottom: 8, lineHeight: 1.4 },
    moduleMeta: { display: 'flex', gap: 12, fontSize: 10, color: '#888780', paddingTop: 6, borderTop: '1px solid #F1EFE8' },
}