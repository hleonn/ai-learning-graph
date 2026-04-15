import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses, createCourseWithRoadmap, checkMultipleCoursesGraphs, exportBootcampToGEXF } from '../lib/api'

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

interface GenerationProgress {
    current: number
    total: number
    courseName: string
    status: 'generating' | 'building_graph' | 'completed' | 'failed'
    nodeCount?: number
    edgeCount?: number
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

    // Estados del nuevo flujo con feedback mejorado
    const [generatingCourses, setGeneratingCourses] = useState(false)
    const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null)
    const [checkingGraphs, setCheckingGraphs] = useState(false)
    const [graphCheckResults, setGraphCheckResults] = useState<Map<string, { hasGraph: boolean; nodeCount: number; edgeCount: number }>>(new Map())
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
        if (!bootcampId || !bootcampBuilt) {
            alert('Primero debes construir el bootcamp')
            return
        }

        try {
            await exportBootcampToGEXF(bootcampId, bootcampTitle)
            alert('✅ Archivo GEXF exportado correctamente. Puedes abrirlo con Gephi.')
        } catch (error) {
            console.error('Error:', error)
            alert('Error al exportar a GEXF')
        }
    }

    // Verificar grafos con información detallada usando la nueva API
    const checkCoursesGraphs = async (courseIds: string[]) => {
        setCheckingGraphs(true)

        const results = await checkMultipleCoursesGraphs(courseIds)
        setGraphCheckResults(results)

        const allHaveGraphs = Array.from(results.values()).every(r => r.hasGraph)
        setAllCoursesHaveGraphs(allHaveGraphs)
        setCheckingGraphs(false)

        // Mostrar feedback detallado
        const courseNames = courses.filter(c => courseIds.includes(c.id))
        const missingGraphs = Array.from(results.entries())
            .filter(([, result]) => !result.hasGraph)
            .map(([id]) => courseNames.find(c => c.id === id)?.title || id)

        if (missingGraphs.length > 0) {
            alert(`⚠️ Los siguientes cursos NO tienen grafos:\n${missingGraphs.join('\n')}\n\nDebes generarlos primero usando "Generar cursos faltantes".`)
        } else {
            const totalNodes = Array.from(results.values()).reduce((sum, r) => sum + r.nodeCount, 0)
            const totalEdges = Array.from(results.values()).reduce((sum, r) => sum + r.edgeCount, 0)
            alert(`✅ Todos los ${courseIds.length} cursos tienen sus grafos correctamente.\n📊 Total: ${totalNodes} nodos, ${totalEdges} edges`)
        }

        return allHaveGraphs
    }

    // Generar un curso completo usando la nueva API
    const generateFullCourse = async (courseInfo: RecommendedCourse, index: number, total: number): Promise<string | null> => {
        try {
            // 1. Generar roadmap con IA
            setGenerationProgress({
                current: index,
                total: total,
                courseName: courseInfo.title,
                status: 'generating'
            })

            const roadmapResponse = await fetch('https://mygateway.up.railway.app/ai/roadmap/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: courseInfo.title,
                    description: courseInfo.description,
                    domain: courseInfo.domain,
                    difficulty_level: courseInfo.difficulty_level
                })
            })

            if (!roadmapResponse.ok) {
                throw new Error(`Error generando roadmap: ${roadmapResponse.status}`)
            }

            const roadmapData = await roadmapResponse.json()

            // Extraer fases correctamente
            let phases = null
            if (roadmapData.phases && Array.isArray(roadmapData.phases)) {
                phases = roadmapData.phases
            } else if (roadmapData.data && roadmapData.data.phases) {
                phases = roadmapData.data.phases
            } else if (Array.isArray(roadmapData) && roadmapData[0]?.phases) {
                phases = roadmapData[0].phases
            }

            if (!phases || phases.length === 0) {
                throw new Error('No se generaron fases para el curso')
            }

            const finalRoadmap = {
                title: courseInfo.title,
                duration_months: phases.length,
                phases: phases
            }

            // 2. Construir el grafo
            setGenerationProgress({
                current: index,
                total: total,
                courseName: courseInfo.title,
                status: 'building_graph'
            })

            // Usar la nueva función que crea curso + grafo
            const result = await createCourseWithRoadmap({
                title: courseInfo.title,
                description: courseInfo.description,
                domain: courseInfo.domain,
                difficulty_level: courseInfo.difficulty_level,
                roadmap: finalRoadmap
            })

            if (!result.success) {
                throw new Error(result.message)
            }

            setGenerationProgress(prev => prev ? {
                ...prev,
                status: 'completed',
                nodeCount: result.nodeCount,
                edgeCount: result.edgeCount
            } : null)

            return result.id

        } catch (error) {
            console.error(`Error generando curso ${courseInfo.title}:`, error)
            setGenerationProgress(prev => prev ? { ...prev, status: 'failed' } : null)
            return null
        }
    }

    // Generar cursos faltantes con feedback visual detallado
    const generateMissingCourses = async () => {
        if (!recommendation?.missing_courses?.length) {
            alert('No hay cursos faltantes para generar')
            return
        }

        const missingCourses = recommendation.missing_courses
        const totalCourses = missingCourses.length
        const existingSelected = [...selectedCourses]
        const newGeneratedIds: string[] = []

        setGeneratingCourses(true)

        for (let i = 0; i < totalCourses; i++) {
            const course = missingCourses[i]
            const courseId = await generateFullCourse(course, i + 1, totalCourses)

            if (courseId) {
                newGeneratedIds.push(courseId)
                existingSelected.push(courseId)
            }

            // Pequeña pausa entre cursos
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        // Actualizar estados
        setSelectedCourses(existingSelected)
        setGeneratedCourseIds(newGeneratedIds)
        setGeneratingCourses(false)

        // Limpiar progreso después de un momento
        setTimeout(() => setGenerationProgress(null), 2000)

        // Recargar lista de cursos disponibles
        try {
            const refreshedCourses = await getCourses()
            setCourses(refreshedCourses.courses || [])
        } catch (error) {
            console.error('Error refreshing courses:', error)
        }

        // Mostrar resumen final
        const successCount = newGeneratedIds.length
        if (successCount === totalCourses) {
            alert(`✅ Éxito: Se generaron ${totalCourses} cursos con sus grafos correctamente.\n\nAhora puedes verificar los grafos y construir el bootcamp.`)
        } else {
            alert(`⚠️ Parcial: ${successCount} de ${totalCourses} cursos generados. Revisa la consola para más detalles.`)
        }

        // Verificar automáticamente los grafos después de generar
        if (existingSelected.length > 0) {
            await checkCoursesGraphs(existingSelected)
        }
    }

    // Construcción discreta del bootcamp
    const buildBootcampDiscrete = async () => {
        if (!bootcampId) {
            alert('Primero debes obtener una recomendación')
            return
        }

        if (!allCoursesHaveGraphs) {
            alert('Verifica que todos los cursos tengan grafos primero')
            return
        }

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

            if (!composeResponse.ok) {
                throw new Error(`Error: ${composeResponse.status}`)
            }

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

    // Obtener nombre del curso por ID
    const getCourseName = (courseId: string): string => {
        const course = courses.find(c => c.id === courseId)
        return course?.title || courseId.substring(0, 8)
    }

    // Calcular estadísticas de grafos
    const getGraphStats = () => {
        let totalNodes = 0
        let totalEdges = 0
        let withGraphs = 0

        for (const [, result] of graphCheckResults) {
            if (result.hasGraph) {
                withGraphs++
                totalNodes += result.nodeCount
                totalEdges += result.edgeCount
            }
        }

        return { withGraphs, totalNodes, totalEdges, total: graphCheckResults.size }
    }

    const graphStats = getGraphStats()

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
                                courses.map(course => {
                                    const graphInfo = graphCheckResults.get(course.id)
                                    let statusBadge = ''
                                    let statusColor = {}

                                    if (graphInfo) {
                                        if (graphInfo.hasGraph) {
                                            statusBadge = `✅ ${graphInfo.nodeCount} nodos`
                                            statusColor = { color: '#1D9E75' }
                                        } else {
                                            statusBadge = '⚠️ sin grafo'
                                            statusColor = { color: '#E24B4A' }
                                        }
                                    }

                                    return (
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
                                            {statusBadge && <span style={{...styles.graphBadge, ...statusColor}}>{statusBadge}</span>}
                                        </label>
                                    )
                                })
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

                        {/* Feedback visual de generación de cursos */}
                        {generationProgress && (
                            <div style={styles.progressContainer}>
                                <div style={styles.progressHeader}>
                                    <strong>📚 Generando curso {generationProgress.current} de {generationProgress.total}</strong>
                                    <span style={styles.progressCourseName}>{generationProgress.courseName}</span>
                                </div>
                                <div style={styles.progressBarTrack}>
                                    <div
                                        style={{
                                            ...styles.progressBarFill,
                                            width: `${(generationProgress.current / generationProgress.total) * 100}%`
                                        }}
                                    />
                                </div>
                                <div style={styles.progressStatus}>
                                    {generationProgress.status === 'generating' && (
                                        <span>🔄 Generando roadmap con IA... (puede tomar hasta 60s)</span>
                                    )}
                                    {generationProgress.status === 'building_graph' && (
                                        <span>🏗️ Construyendo grafo de aprendizaje...</span>
                                    )}
                                    {generationProgress.status === 'completed' && generationProgress.nodeCount && (
                                        <span style={{ color: '#1D9E75' }}>
                                            ✅ Curso completado: {generationProgress.nodeCount} nodos, {generationProgress.edgeCount} edges
                                        </span>
                                    )}
                                    {generationProgress.status === 'failed' && (
                                        <span style={{ color: '#E24B4A' }}>❌ Error en la generación</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Feedback de verificación de grafos */}
                        {checkingGraphs && (
                            <div style={styles.checkingContainer}>
                                <div style={styles.spinner}></div>
                                <span>🔍 Verificando grafos de los cursos seleccionados...</span>
                            </div>
                        )}

                        {/* Resumen de verificación de grafos */}
                        {graphCheckResults.size > 0 && !checkingGraphs && graphStats.total > 0 && (
                            <div style={styles.graphSummary}>
                                <details open>
                                    <summary style={styles.graphSummaryTitle}>
                                        📊 Estado de Grafos ({graphStats.withGraphs}/{graphStats.total} cursos con grafo)
                                        {graphStats.totalNodes > 0 && ` · ${graphStats.totalNodes} nodos · ${graphStats.totalEdges} edges`}
                                    </summary>
                                    <div style={styles.graphSummaryList}>
                                        {Array.from(graphCheckResults.entries()).map(([courseId, result]) => (
                                            <div key={courseId} style={styles.graphSummaryItem}>
                                                <span>{result.hasGraph ? '✅' : '❌'}</span>
                                                <span style={{ flex: 1 }}>{getCourseName(courseId)}</span>
                                                {result.hasGraph ? (
                                                    <span style={styles.graphNodeCount}>{result.nodeCount} nodos, {result.edgeCount} edges</span>
                                                ) : (
                                                    <span style={{ color: '#E24B4A', fontSize: 11 }}>Sin grafo</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Cursos existentes */}
                        <div style={styles.recommendationSection}>
                            <h3>📚 Cursos existentes</h3>
                            {recommendation.existing_courses?.length > 0 ? (
                                <ul>
                                    {recommendation.existing_courses.map(c => {
                                        const graphInfo = graphCheckResults.get(c.id)
                                        const hasGraph = graphInfo?.hasGraph
                                        return (
                                            <li key={c.id}>
                                                {hasGraph ? '✅' : '⚠️'} {c.title}
                                                {!hasGraph && <span style={{ color: '#E24B4A', fontSize: 11, marginLeft: 8 }}>(sin grafo)</span>}
                                            </li>
                                        )
                                    })}
                                </ul>
                            ) : <p>No hay cursos seleccionados</p>}
                        </div>

                        {/* Cursos faltantes */}
                        <div style={styles.recommendationSection}>
                            <h3>⚠️ Cursos recomendados (faltantes)</h3>
                            {recommendation.missing_courses?.length > 0 ? (
                                <>
                                    <ul>
                                        {recommendation.missing_courses.map((c: RecommendedCourse, idx:number) => (
                                            <li key={idx}>
                                                📖 {c.title}
                                                {generatedCourseIds.length > idx && <span style={styles.generatedBadge}> ✅ Generado</span>}
                                                <span style={styles.courseDomainBadge}>{c.domain}</span>
                                            </li>
                                        ))}
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
                        {allCoursesHaveGraphs && !bootcampBuilt && selectedCourses.length > 0 && (
                            <div style={styles.successMessage}>
                                ✅ Todos los cursos tienen sus grafos. Puedes proceder con la construcción.
                            </div>
                        )}

                        {/* Mostrar mensaje si faltan grafos */}
                        {!allCoursesHaveGraphs && graphCheckResults.size > 0 && !checkingGraphs && (
                            <div style={styles.warningMessage}>
                                ⚠️ Algunos cursos no tienen grafos. Usa "Generar cursos faltantes" para crearlos.
                            </div>
                        )}

                        {/* Módulos generados después de construcción */}
                        {createdBootcamp && (
                            <div style={styles.recommendationSection}>
                                <h3 style={styles.sectionSubtitle}>📋 Módulos generados ({createdBootcamp.modules?.length || 0})</h3>
                                <div style={styles.modulesList}>
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
                                                <span>⏱️ {module.estimated_hours}h estimadas</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Botón de exportación */}
                        <div style={styles.buttonGroup}>
                            <button
                                style={styles.exportBtn}
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
        maxWidth: 1400,
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
    resultCard: { flex: 1, minWidth: 360, background: '#fff', borderRadius: 12, border: '1px solid #D3D1C7', padding: 24, maxHeight: '80vh', overflowY: 'auto' },
    formTitle: { fontSize: 20, fontWeight: 600, color: '#1E3A5F', marginBottom: 20 },
    field: { marginBottom: 16 },
    label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 },
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, fontFamily: 'inherit' },
    textarea: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' },
    select: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D3D1C7', fontSize: 14, background: '#fff', fontFamily: 'inherit' },
    checkboxGroup: { display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 250, overflowY: 'auto', padding: 10, border: '1px solid #F1EFE8', borderRadius: 8, background: '#F9F9F8' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: '#fff', border: '1px solid #E8E6E1' },
    courseBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#E8E6E1', color: '#1E3A5F' },
    graphBadge: { fontSize: 10, marginLeft: 'auto' },
    courseDomainBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#E1F5EE', color: '#1D9E75', marginLeft: 8 },
    primaryBtn: { width: '100%', padding: '12px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    secondaryBtn: { width: '100%', padding: '10px', background: '#6B6E6A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8 },
    warningBtn: {
        width: '100%',
        padding: '12px',
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
        padding: '12px',
        background: '#1D9E75',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        marginTop: 8,
    },
    exportBtn: {
        width: '100%',
        padding: '10px',
        background: '#9B59B6',
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
        padding: '12px',
        background: '#E1F5EE',
        color: '#1D9E75',
        borderRadius: 8,
        fontSize: 13,
        textAlign: 'center',
    },
    warningMessage: {
        marginTop: 12,
        padding: '12px',
        background: '#FCEBEB',
        color: '#E24B4A',
        borderRadius: 8,
        fontSize: 13,
        textAlign: 'center',
    },
    buttonGroup: { display: 'flex', gap: 12, marginTop: 16, flexDirection: 'column' },
    recommendationSection: { marginBottom: 20, padding: 12, background: '#F9F9F8', borderRadius: 8 },
    sectionSubtitle: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', marginBottom: 10 },
    mutedText: { fontSize: 13, color: '#888780', textAlign: 'center', padding: 10 },
    successText: { fontSize: 13, color: '#1D9E75', textAlign: 'center', padding: 10 },
    modulesList: { maxHeight: 300, overflowY: 'auto' },
    modulePreview: { background: '#fff', border: '1px solid #E8E6E1', borderRadius: 8, padding: 12, marginBottom: 10 },
    moduleHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
    moduleOrder: { fontSize: 11, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', padding: '2px 8px', borderRadius: 12 },
    moduleWeight: { fontSize: 11, color: '#888780' },
    moduleName: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', marginBottom: 4 },
    moduleDesc: { fontSize: 12, color: '#6B6E6A', marginBottom: 8, lineHeight: 1.4 },
    moduleMeta: { display: 'flex', gap: 12, fontSize: 10, color: '#888780', paddingTop: 6, borderTop: '1px solid #F1EFE8', flexWrap: 'wrap' },
    progressContainer: {
        marginBottom: 16,
        padding: '16px',
        background: '#F9F9F8',
        borderRadius: 8,
        border: '1px solid #D3D1C7'
    },
    progressHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 10,
        fontSize: 13,
        flexWrap: 'wrap',
        gap: 8
    },
    progressCourseName: {
        color: '#1E3A5F',
        fontWeight: 500
    },
    progressBarTrack: {
        height: 8,
        background: '#E8E6E1',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 10
    },
    progressBarFill: {
        height: '100%',
        background: '#1D9E75',
        borderRadius: 4,
        transition: 'width 0.3s ease'
    },
    progressStatus: {
        fontSize: 12,
        color: '#6B6E6A'
    },
    checkingContainer: {
        marginBottom: 16,
        padding: '12px',
        background: '#E8F0FE',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12
    },
    spinner: {
        width: 20,
        height: 20,
        border: '2px solid #D3D1C7',
        borderTop: '2px solid #1E3A5F',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },
    graphSummary: {
        marginBottom: 16,
        padding: '8px 12px',
        background: '#F1EFE8',
        borderRadius: 8
    },
    graphSummaryTitle: {
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        color: '#1E3A5F'
    },
    graphSummaryList: {
        marginTop: 8,
        fontSize: 12,
        maxHeight: 200,
        overflowY: 'auto'
    },
    graphSummaryItem: {
        display: 'flex',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid #E8E6E1',
        alignItems: 'center'
    },
    graphNodeCount: {
        fontSize: 10,
        color: '#888780'
    },
    generatedBadge: {
        fontSize: 10,
        color: '#1D9E75',
        marginLeft: 8
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