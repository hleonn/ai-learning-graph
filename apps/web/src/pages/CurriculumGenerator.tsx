import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Subtopic {
    label: string
    description: string
    difficulty: number
    prerequisites: string[]
    content?: string
    examples?: string[]
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

function diffColor(d: number): string {
    return ['', '#1D9E75', '#5DCAA5', '#FAC775', '#F0997B', '#E24B4A'][d] ?? '#D3D1C7'
}

function diffLabel(d: number): string {
    return ['', 'Introductorio', 'Básico', 'Intermedio', 'Avanzado', 'Experto'][d] ?? ''
}

const API_URL = 'https://mygateway.up.railway.app'

function calculatePositionsFromRoadmap(roadmap: RoadmapData): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {}

    const allSubtopics: { label: string; prerequisites: string[]; phase: number }[] = []
    for (const phase of roadmap.phases) {
        for (const topic of phase.topics) {
            for (const subtopic of topic.subtopics) {
                allSubtopics.push({
                    label: subtopic.label,
                    prerequisites: subtopic.prerequisites,
                    phase: phase.phase_number
                })
            }
        }
    }

    const levels: Record<string, number> = {}
    const processed = new Set<string>()
    let currentLevel = 0

    let currentNodes = allSubtopics.filter(s => s.prerequisites.length === 0).map(s => s.label)
    currentNodes.forEach(label => { levels[label] = 0; processed.add(label) })

    while (currentNodes.length > 0) {
        const nextNodes: string[] = []
        for (const nodeLabel of currentNodes) {
            for (const subtopic of allSubtopics) {
                if (!processed.has(subtopic.label) && subtopic.prerequisites.includes(nodeLabel)) {
                    if (!nextNodes.includes(subtopic.label)) {
                        nextNodes.push(subtopic.label)
                    }
                }
            }
        }
        currentLevel++
        nextNodes.forEach(label => { levels[label] = currentLevel; processed.add(label) })
        currentNodes = nextNodes
    }

    const nodesPerLevel: Record<number, string[]> = {}
    Object.entries(levels).forEach(([label, level]) => {
        if (!nodesPerLevel[level]) nodesPerLevel[level] = []
        nodesPerLevel[level].push(label)
    })

    Object.entries(nodesPerLevel).forEach(([levelStr, labels]) => {
        const levelNum = parseInt(levelStr)
        const y = 100 + levelNum * 120
        const total = labels.length
        const startX = 400 - (total - 1) * 80

        labels.forEach((label, idx) => {
            positions[label] = {
                x: startX + idx * 160,
                y: y
            }
        })
    })

    return positions
}

export default function CurriculumGenerator() {
    const navigate = useNavigate()

    const [form, setForm] = useState({
        title: '',
        description: '',
        domain: 'generic',
        difficulty_level: 'intermediate',
    })

    const [roadmap, setRoadmap] = useState<RoadmapData | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({})
    const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({})
    const [savedCourseId, setSavedCourseId] = useState<string | null>(null)
    const [isSaved, setIsSaved] = useState(false)

    const handleGenerate = async () => {
        if (!form.title.trim()) {
            setError('El título del curso es requerido')
            return
        }
        setLoading(true)
        setError(null)
        setRoadmap(null)
        setSavedCourseId(null)
        setIsSaved(false)

        try {
            const response = await fetch('https://mygateway.up.railway.app/ai/roadmap/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description,
                    domain: form.domain,
                    difficulty_level: form.difficulty_level,
                }),
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const roadmapData = await response.json()

            // Verificación simple sin Object.keys
            if (!roadmapData) {
                throw new Error('Respuesta vacía del servidor')
            }

            // Buscar phases en diferentes lugares
            let phases = null
            let actualData = null

            if (roadmapData.phases && Array.isArray(roadmapData.phases)) {
                phases = roadmapData.phases
                actualData = roadmapData
            } else if (roadmapData.data && roadmapData.data.phases && Array.isArray(roadmapData.data.phases)) {
                phases = roadmapData.data.phases
                actualData = roadmapData.data
            } else if (Array.isArray(roadmapData) && roadmapData.length > 0 && roadmapData[0].phases) {
                phases = roadmapData[0].phases
                actualData = roadmapData[0]
            }

            if (!phases || phases.length === 0) {
                // Si no encuentra phases, intenta usar el roadmapData directamente si tiene estructura similar
                if (roadmapData.title && roadmapData.duration_months && !roadmapData.phases) {
                    // Posiblemente el servidor devolvió una estructura diferente
                    console.error('Estructura inesperada, intentando usar directamente:', roadmapData)
                    throw new Error('La respuesta del servidor no contiene "phases". Contacta al administrador.')
                }
                throw new Error('No se encontraron fases en la respuesta del servidor')
            }

            // Asegurar que actualData tenga la estructura correcta
            if (!actualData) {
                actualData = {
                    title: form.title,
                    duration_months: 4,
                    phases: phases
                }
            }

            setRoadmap(actualData)
            if (phases.length > 0) {
                setExpandedPhases({ [phases[0].phase_number]: true })
            }

        } catch (e: any) {
            console.error('Error:', e)
            setError(`Error generando el roadmap: ${e.message}`)
        } finally {
            setLoading(false)
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

    const handleSaveCourse = async () => {
        if (!roadmap) return

        setLoading(true)
        setError(null)

        try {
            const positions = calculatePositionsFromRoadmap(roadmap)
            console.log('Posiciones calculadas:', positions)

            const courseResponse = await fetch('https://mygateway.up.railway.app/courses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || `Curso de ${form.title}`,
                    domain: form.domain,
                    difficulty_level: form.difficulty_level,
                    roadmap: roadmap,
                })
            })

            if (!courseResponse.ok) {
                throw new Error(`Error creating course: ${courseResponse.status}`)
            }

            const courseData = await courseResponse.json()
            const courseId = courseData[0]?.id || courseData.id

            if (!courseId) {
                throw new Error('No se pudo obtener el ID del curso')
            }

            console.log('Curso creado con ID:', courseId)
            setSavedCourseId(courseId)
            setIsSaved(true)

            let nodeCount = 0
            let edgeCount = 0

            for (const phase of roadmap.phases) {
                for (const topic of phase.topics) {
                    for (const subtopic of topic.subtopics) {
                        const pos = positions[subtopic.label] || { x: 100, y: 100 }

                        const nodeResponse = await fetch(`${API_URL}/graph/${courseId}/nodes`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                label: subtopic.label,
                                description: subtopic.description,
                                difficulty: subtopic.difficulty,
                                phase: phase.phase_number,
                                topic: topic.topic_name,
                                bloom_levels: phase.bloom_levels,
                                expected_outcomes: phase.expected_outcomes,
                                skills: phase.skills,
                                position_x: pos.x,
                                position_y: pos.y,
                                content: subtopic.content || '',
                                examples: subtopic.examples || []
                            })
                        })

                        if (nodeResponse.ok) {
                            nodeCount++
                        } else {
                            console.error(`Error creating node ${subtopic.label}:`, await nodeResponse.text())
                        }

                        for (const prereq of subtopic.prerequisites) {
                            const edgeResponse = await fetch(`${API_URL}/graph/${courseId}/edges`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    source: prereq,
                                    target: subtopic.label,
                                    prerequisite_strength: 0.9,
                                })
                            })

                            if (edgeResponse.ok) {
                                edgeCount++
                            }
                        }
                    }
                }
            }

            alert(`✅ Curso "${form.title}" guardado exitosamente con ${nodeCount} conceptos y ${edgeCount} relaciones`)

        } catch (error: any) {
            console.error('Error saving course:', error)
            setError(`Error al guardar: ${error.message}`)
            alert(`Error al guardar el curso: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const createClassroomMaterials = async (classroomCourseId: string) => {
        const token = localStorage.getItem('google_token')
        let materialCount = 0
        let failedCount = 0

        for (const phase of roadmap!.phases) {
            for (const topic of phase.topics) {
                for (const subtopic of topic.subtopics) {
                    let educationalContent = ""

                    try {
                        const contentResponse = await fetch('https://mygateway.up.railway.app/api/ai/generate-subtopic-content', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                subtopic_label: subtopic.label,
                                subtopic_description: subtopic.description,
                                difficulty: subtopic.difficulty,
                                phase_number: phase.phase_number,
                                prerequisites: subtopic.prerequisites,
                                course_title: form.title,
                                domain: form.domain
                            })
                        })

                        if (contentResponse.ok) {
                            const contentData = await contentResponse.json()

                            educationalContent = `
## 🎯 ¿Por qué aprender esto?

${contentData.motivation || `Dominar ${subtopic.label} es fundamental para avanzar en ${form.title}.`}

## 📖 Explicación detallada

${contentData.explanation || subtopic.description}

## 💡 Analogía

${contentData.analogy || `Piensa en ${subtopic.label} como...`}

## 📚 Ejemplos prácticos

${contentData.examples?.map((ex: string, idx: number) => `${idx + 1}. ${ex}`).join('\n\n') || '• Ejemplo práctico disponible en clase.'}

## 🤔 Preguntas para reflexionar

${contentData.critical_questions?.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n\n') || '• ¿Cómo aplicarías este concepto en un proyecto real?\n• ¿Qué relación tiene con lo aprendido anteriormente?'}

## ✅ Ejercicio práctico

${contentData.practice_task || `Realiza un ejercicio que aplique ${subtopic.label} en un contexto real.`}

## 📖 Recursos adicionales

${contentData.resources?.map((r: string) => `• ${r}`).join('\n') || '• Documentación oficial\n• Tutoriales en línea'}
`
                        } else {
                            educationalContent = generateFallbackContent(subtopic)
                        }
                    } catch (error) {
                        console.error(`Error generando contenido para ${subtopic.label}:`, error)
                        educationalContent = generateFallbackContent(subtopic)
                    }

                    try {
                        const response = await fetch(`https://mygateway.up.railway.app/api/classroom/${classroomCourseId}/material-by-subtopic`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                title: subtopic.label,
                                description: subtopic.description,
                                content: educationalContent,
                                phaseNumber: phase.phase_number,
                                topicName: topic.topic_name
                            })
                        })

                        if (response.ok) {
                            materialCount++
                            console.log(`✅ Material creado: ${subtopic.label}`)
                        } else {
                            failedCount++
                            console.error(`❌ Error creando material ${subtopic.label}:`, await response.text())
                        }
                    } catch (error) {
                        failedCount++
                        console.error(`❌ Error creando material ${subtopic.label}:`, error)
                    }

                    await new Promise(resolve => setTimeout(resolve, 300))
                }
            }
        }

        return { materialCount, failedCount }
    }

    function generateFallbackContent(subtopic: any): string {
        return `
## 🎯 ¿Por qué aprender esto?

${subtopic.description}

## 📖 Explicación detallada

Este concepto es fundamental para entender ${subtopic.label}. 
Para dominarlo completamente, practica los ejercicios relacionados y asegúrate de comprender los prerrequisitos antes de avanzar.

## 📚 Ejemplos prácticos

• Ejemplo 1: Aplicación práctica de ${subtopic.label}
• Ejemplo 2: Caso de uso real en la industria
• Ejemplo 3: Ejercicio resuelto paso a paso

## 🤔 Preguntas para reflexionar

1. ¿Cómo se aplica ${subtopic.label} en un contexto real?
2. ¿Qué relación tiene con otros conceptos del curso?

## ✅ Ejercicio práctico

Realiza un proyecto pequeño que utilice ${subtopic.label} para resolver un problema real.

## 📖 Recursos adicionales

• Documentación oficial
• Tutoriales en video
• Foro de discusión
`
    }

    const publishToClassroom = async () => {
        if (!roadmap) {
            alert('Primero debes generar un roadmap')
            return
        }

        const token = localStorage.getItem('google_token')
        if (!token) {
            alert('Primero debes conectar tu cuenta de Google Classroom')
            return
        }

        setLoading(true)
        try {
            let courseIdForClassroom = savedCourseId

            if (!courseIdForClassroom) {
                console.log('Curso no guardado localmente, guardando primero...')

                const positions = calculatePositionsFromRoadmap(roadmap)

                const courseResponse = await fetch('https://mygateway.up.railway.app/courses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: form.title,
                        description: form.description || `Curso de ${form.title}`,
                        domain: form.domain,
                        difficulty_level: form.difficulty_level,
                        roadmap: roadmap,
                    })
                })

                if (!courseResponse.ok) {
                    throw new Error(`Error creating course: ${courseResponse.status}`)
                }

                const courseData = await courseResponse.json()
                courseIdForClassroom = courseData[0]?.id || courseData.id
                setSavedCourseId(courseIdForClassroom)

                for (const phase of roadmap.phases) {
                    for (const topic of phase.topics) {
                        for (const subtopic of topic.subtopics) {
                            const pos = positions[subtopic.label] || { x: 100, y: 100 }
                            await fetch(`${API_URL}/graph/${courseIdForClassroom}/nodes`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    label: subtopic.label,
                                    description: subtopic.description,
                                    difficulty: subtopic.difficulty,
                                    phase: phase.phase_number,
                                    topic: topic.topic_name,
                                    bloom_levels: phase.bloom_levels,
                                    expected_outcomes: phase.expected_outcomes,
                                    skills: phase.skills,
                                    position_x: pos.x,
                                    position_y: pos.y,
                                    content: subtopic.content || '',
                                    examples: subtopic.examples || []
                                })
                            })

                            for (const prereq of subtopic.prerequisites) {
                                await fetch(`${API_URL}/graph/${courseIdForClassroom}/edges`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        source: prereq,
                                        target: subtopic.label,
                                        prerequisite_strength: 0.9,
                                    })
                                })
                            }
                        }
                    }
                }
                setIsSaved(true)
                alert(`✅ Curso "${form.title}" guardado localmente`)
            }

            const classroomResponse = await fetch('https://mygateway.up.railway.app/api/classroom/create-course', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || `Curso de ${form.title}`,
                    section: `Nivel: ${form.difficulty_level}`
                })
            })

            const classroomData = await classroomResponse.json()

            if (!classroomData.success) {
                throw new Error(classroomData.error || 'Error al crear el curso en Classroom')
            }

            const { materialCount, failedCount } = await createClassroomMaterials(classroomData.courseId)

            alert(`✅ Curso publicado en Google Classroom!\n\n📎 Enlace: ${classroomData.alternateLink}\n🔑 Código de clase: ${classroomData.enrollmentCode}\n📚 Materiales creados: ${materialCount} (${failedCount} fallaron)\n\n⚠️ IMPORTANTE: El curso está en modo PROVISIONED. Actívalo manualmente desde Google Classroom.`)

            window.open(classroomData.alternateLink, '_blank')

        } catch (error: any) {
            console.error('Error publishing to Classroom:', error)
            alert(`Error al publicar: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={s.page}>
            <div style={s.header}>
                <button onClick={() => navigate('/dashboard')} style={s.back}>← Volver</button>
                <div>
                    <h1 style={s.title}>AI Curriculum Generator</h1>
                    <p style={s.subtitle}>Genera un roadmap de aprendizaje estructurado por fases</p>
                </div>
            </div>

            <div style={s.body}>
                <div style={s.formPanel}>
                    <div style={s.field}>
                        <label style={s.label}>Título del curso *</label>
                        <input
                            style={s.input}
                            placeholder="ej. Arquitectura de Software"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Descripción</label>
                        <textarea
                            style={s.textarea}
                            placeholder="Describe brevemente el contenido del curso..."
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={4}
                        />
                    </div>

                    <div style={s.row}>
                        <div style={{ ...s.field, flex: 1 }}>
                            <label style={s.label}>Dominio</label>
                            <select
                                style={s.select}
                                value={form.domain}
                                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                            >
                                <option value="generic">Genérico</option>
                                <option value="programming">Programación</option>
                                <option value="data-science">Ciencia de Datos</option>
                                <option value="cloud">Cloud Computing</option>
                                <option value="devops">DevOps</option>
                                <option value="architecture">Arquitectura</option>
                            </select>
                        </div>

                        <div style={{ ...s.field, flex: 1 }}>
                            <label style={s.label}>Nivel de dificultad</label>
                            <select
                                style={s.select}
                                value={form.difficulty_level}
                                onChange={e => setForm(f => ({ ...f, difficulty_level: e.target.value }))}
                            >
                                <option value="beginner">Principiante (2 meses)</option>
                                <option value="intermediate">Intermedio (4 meses)</option>
                                <option value="advanced">Avanzado (6 meses)</option>
                                <option value="expert">Experto / Certificación (6 meses)</option>
                            </select>
                        </div>
                    </div>

                    {error && <p style={s.error}>{error}</p>}

                    <button
                        style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}
                        onClick={handleGenerate}
                        disabled={loading}
                    >
                        {loading ? 'Generando roadmap con IA...' : 'Generar roadmap'}
                    </button>

                    {loading && (
                        <div style={s.loadingNote}>
                            La IA está generando un roadmap estructurado por fases...
                            <br />Esto puede tomar hasta 60 segundos.
                        </div>
                    )}
                </div>

                {roadmap && (
                    <div style={s.resultPanel}>
                        <div style={s.statsRow}>
                            <div style={s.statCard}>
                                <span style={s.statNum}>{roadmap.duration_months}</span>
                                <span style={s.statLbl}>Meses</span>
                            </div>
                            <div style={s.statCard}>
                                <span style={s.statNum}>{roadmap.phases.length}</span>
                                <span style={s.statLbl}>Fases</span>
                            </div>
                            <div style={s.statCard}>
                                <span style={s.statNum}>
                                    {roadmap.phases.reduce((acc, p) => acc + p.topics.reduce((tacc, t) => tacc + t.subtopics.length, 0), 0)}
                                </span>
                                <span style={s.statLbl}>Conceptos</span>
                            </div>
                        </div>

                        <div style={s.buttonContainer}>
                            <button
                                style={{ ...s.saveBtn }}
                                onClick={handleSaveCourse}
                                disabled={loading}
                            >
                                {loading ? 'Guardando...' : '💾 1. Guardar curso'}
                            </button>
                            <button
                                style={{ ...s.classroomBtn }}
                                onClick={publishToClassroom}
                                disabled={loading}
                            >
                                {loading ? 'Publicando...' : '📚 2. Publicar en Classroom'}
                            </button>
                        </div>

                        {isSaved && savedCourseId && (
                            <div style={s.successBadge}>
                                ✅ Curso guardado localmente (ID: {savedCourseId.substring(0, 8)}...)
                            </div>
                        )}

                        <div style={s.roadmapContainer}>
                            {roadmap.phases.map((phase) => (
                                <div key={phase.phase_number} style={s.phaseCard}>
                                    <div style={s.phaseHeader} onClick={() => togglePhase(phase.phase_number)}>
                                        <span style={s.phaseNumber}>Fase {phase.phase_number}</span>
                                        <span style={s.phaseName}>{phase.name}</span>
                                        <span style={s.phaseDuration}>📅 {phase.months} meses</span>
                                        <span style={s.expandIcon}>{expandedPhases[phase.phase_number] ? '▼' : '▶'}</span>
                                    </div>

                                    {expandedPhases[phase.phase_number] && (
                                        <div style={s.phaseContent}>
                                            <div style={s.bloomLevels}>
                                                <span style={s.bloomLabel}>Niveles Bloom:</span>
                                                {phase.bloom_levels.map(level => (
                                                    <span key={level} style={s.bloomBadge}>{level}</span>
                                                ))}
                                            </div>
                                            <p style={s.phaseObjective}>🎯 {phase.objective}</p>

                                            <div style={s.phaseDetails}>
                                                <div style={s.detailColumn}>
                                                    <strong>Resultados esperados:</strong>
                                                    <ul style={s.list}>
                                                        {phase.expected_outcomes.map((outcome, idx) => (
                                                            <li key={idx}>{outcome}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div style={s.detailColumn}>
                                                    <strong>Skills adquiridas:</strong>
                                                    <ul style={s.list}>
                                                        {phase.skills.map((skill, idx) => (
                                                            <li key={idx}>{skill}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div style={s.detailColumn}>
                                                    <strong>Tech stack:</strong>
                                                    <ul style={s.list}>
                                                        {phase.tech_stack.map((tech, idx) => (
                                                            <li key={idx}>{tech}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>

                                            <div style={s.topicsContainer}>
                                                {phase.topics.map((topic, topicIdx) => {
                                                    const topicKey = `${phase.phase_number}-${topicIdx}`
                                                    return (
                                                        <div key={topicKey} style={s.topicCard}>
                                                            <div style={s.topicHeader} onClick={() => toggleTopic(topicKey)}>
                                                                <span style={s.topicName}>{topic.topic_name}</span>
                                                                <span style={s.subtopicCount}>{topic.subtopics.length} conceptos</span>
                                                                <span style={s.expandIcon}>{expandedTopics[topicKey] ? '▼' : '▶'}</span>
                                                            </div>
                                                            {expandedTopics[topicKey] && (
                                                                <div style={s.subtopicsList}>
                                                                    {topic.subtopics.map((subtopic, subIdx) => (
                                                                        <div key={subIdx} style={s.subtopicCard}>
                                                                            <div style={s.subtopicHeader}>
                                                                                <span style={s.subtopicLabel}>{subtopic.label}</span>
                                                                                <span style={{ ...s.diffBadge, background: diffColor(subtopic.difficulty) }}>
                                                                                    {diffLabel(subtopic.difficulty)}
                                                                                </span>
                                                                            </div>
                                                                            <p style={s.subtopicDesc}>{subtopic.description}</p>
                                                                            {subtopic.prerequisites.length > 0 && (
                                                                                <div style={s.prereqs}>
                                                                                    <strong>Prerrequisitos:</strong> {subtopic.prerequisites.join(', ')}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F1EFE8' },
    header: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', background: '#1E3A5F' },
    back: { background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
    title: { fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 },
    subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' },
    body: { display: 'flex', gap: 24, padding: 24, alignItems: 'flex-start', flexWrap: 'wrap' },
    formPanel: { background: '#fff', borderRadius: 12, border: '0.5px solid #D3D1C7', padding: 24, width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 },
    field: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 13, fontWeight: 500, color: '#2C2C2A' },
    input: { padding: '8px 12px', borderRadius: 8, border: '0.5px solid #D3D1C7', fontSize: 14, fontFamily: 'system-ui, sans-serif', outline: 'none' },
    textarea: { padding: '8px 12px', borderRadius: 8, border: '0.5px solid #D3D1C7', fontSize: 14, fontFamily: 'system-ui, sans-serif', outline: 'none', resize: 'vertical' },
    select: { padding: '8px 12px', borderRadius: 8, border: '0.5px solid #D3D1C7', fontSize: 14, fontFamily: 'system-ui, sans-serif', background: '#fff', outline: 'none' },
    row: { display: 'flex', gap: 12 },
    btn: { padding: '10px 0', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
    loadingNote: { fontSize: 12, color: '#888780', textAlign: 'center', lineHeight: 1.6 },
    error: { fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 8 },
    resultPanel: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 },
    statsRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
    statCard: { background: '#fff', borderRadius: 8, border: '0.5px solid #D3D1C7', padding: '12px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
    statNum: { fontSize: 24, fontWeight: 700, color: '#1E3A5F' },
    statLbl: { fontSize: 11, color: '#888780' },
    buttonContainer: { display: 'flex', gap: 12, marginTop: 8, marginBottom: 8 },
    saveBtn: {
        background: '#1D9E75',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        padding: '10px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        flex: 1
    },
    classroomBtn: {
        background: '#4285F4',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        padding: '10px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        flex: 1
    },
    successBadge: {
        background: '#E1F5EE',
        color: '#1D9E75',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 12,
        textAlign: 'center'
    },
    roadmapContainer: { display: 'flex', flexDirection: 'column', gap: 20 },
    phaseCard: { background: '#fff', borderRadius: 12, border: '1px solid #D3D1C7', overflow: 'hidden' },
    phaseHeader: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: '#F9F9F8', cursor: 'pointer', borderBottom: '1px solid #F1EFE8', flexWrap: 'wrap' },
    phaseNumber: { fontSize: 14, fontWeight: 700, color: '#1D9E75', background: '#E1F5EE', padding: '4px 12px', borderRadius: 20 },
    phaseName: { fontSize: 16, fontWeight: 600, color: '#1E3A5F', flex: 1 },
    phaseDuration: { fontSize: 12, color: '#888780' },
    expandIcon: { fontSize: 12, color: '#888780' },
    phaseContent: { padding: '16px 20px' },
    bloomLevels: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
    bloomLabel: { fontSize: 12, fontWeight: 600, color: '#888780' },
    bloomBadge: { fontSize: 11, background: '#E8E6E1', padding: '4px 10px', borderRadius: 16, color: '#1E3A5F' },
    phaseObjective: { fontSize: 13, color: '#5F5E5A', marginBottom: 16, lineHeight: 1.5 },
    phaseDetails: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 },
    detailColumn: { fontSize: 12 },
    list: { marginTop: 8, paddingLeft: 20, marginBottom: 0 },
    topicsContainer: { display: 'flex', flexDirection: 'column', gap: 12 },
    topicCard: { background: '#F9F9F8', borderRadius: 8, border: '1px solid #E8E6E1' },
    topicHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', justifyContent: 'space-between', flexWrap: 'wrap' },
    topicName: { fontSize: 14, fontWeight: 600, color: '#1E3A5F', flex: 1 },
    subtopicCount: { fontSize: 11, color: '#888780' },
    subtopicsList: { padding: '12px 16px', borderTop: '1px solid #E8E6E1', display: 'flex', flexDirection: 'column', gap: 12 },
    subtopicCard: { background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #F1EFE8' },
    subtopicHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 },
    subtopicLabel: { fontSize: 13, fontWeight: 600, color: '#1E3A5F' },
    diffBadge: { fontSize: 10, fontWeight: 600, color: '#fff', padding: '2px 8px', borderRadius: 20 },
    subtopicDesc: { fontSize: 12, color: '#6B6E6A', lineHeight: 1.4, marginBottom: 8 },
    prereqs: { fontSize: 11, color: '#1D9E75', background: '#E1F5EE', padding: '4px 8px', borderRadius: 4, display: 'inline-block' },
}