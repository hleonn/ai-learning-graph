// src/pages/ProgramView.tsx

import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { getProgram, getCourses, type Program } from '../lib/api'
import { generateAndDownloadBootcampPDF } from '../utils/generateBootcampPDF'
import CalendarDialog from '../components/CalendarDialog'

interface Course {
    id: string
    title: string
    description: string
    domain: string
    difficulty_level?: string
}

// Función para normalizar fecha a UTC
function normalizeDate(date: Date): Date {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

// Función para obtener la fecha seleccionada en el calendario o fecha actual
function getStoredStartDate(): Date {
    const savedStartDate = localStorage.getItem('bootcamp_calendar_start_date')
    if (savedStartDate) {
        const [year, month, day] = savedStartDate.split('-').map(Number)
        return new Date(Date.UTC(year, month - 1, day))
    }
    return normalizeDate(new Date())
}

export default function ProgramView() {
    const navigate = useNavigate()
    const location = useLocation()
    const { id } = useParams<{ id: string }>()

    const [program, setProgram] = useState<Program | null>(null)
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [generatedDescription, setGeneratedDescription] = useState<string>('')
    const [showCalendar, setShowCalendar] = useState(false)

    // Generar descripción automática basada en los módulos
    const generateDescriptionFromModules = (modules: any[]): string => {
        if (!modules || modules.length === 0) return ''

        const totalHours = modules.reduce((sum, m) => sum + (m.estimated_hours || 0), 0)
        const totalWeeks = program?.duration_weeks || 16
        const hoursPerWeek = Math.round(totalHours / totalWeeks)

        let description = `🎓 **Bootcamp de formación intensiva**\n\n`
        description += `Este programa está diseñado para formar profesionales en ${program?.title || 'tecnologías de vanguardia'}.\n\n`
        description += `📊 **Estructura del programa:**\n`
        description += `• ${modules.length} módulos distribuidos en ${totalWeeks} semanas\n`
        description += `• ${totalHours} horas totales de formación (${hoursPerWeek} horas/semana)\n\n`
        description += `📚 **Metodología:**\n`
        description += `• Aprendizaje basado en proyectos reales\n`
        description += `• Taxonomía de Bloom para progresión cognitiva\n`
        description += `• Evaluación continua con feedback personalizado\n\n`
        description += `🎯 **Perfil de egreso:**\n`
        description += `Al completar este bootcamp, los participantes serán capaces de:\n`

        const mainSkills = modules.slice(0, 3).map(m => {
            const skill = m.name?.split(' ').slice(0, 2).join(' ') || m.name
            return `• Dominar ${skill} y sus aplicaciones prácticas`
        })
        description += mainSkills.join('\n')
        description += `\n• Integrar conocimientos para resolver problemas complejos\n`
        description += `• Desarrollar proyectos end-to-end con estándares profesionales\n\n`
        description += `✅ **Certificación:** Al finalizar, recibirás un certificado de competencias laborales.`

        return description
    }

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            setError(null)

            try {
                const coursesData = await getCourses()
                setCourses(coursesData.courses || [])

                let programData: Program | null = null
                const state = location.state as { program?: Program }

                if (state?.program) {
                    programData = state.program
                } else if (id) {
                    programData = await getProgram(id)
                }

                if (programData) {
                    setProgram(programData)
                    if (programData.modules && programData.modules.length > 0) {
                        const autoDescription = generateDescriptionFromModules(programData.modules)
                        setGeneratedDescription(autoDescription)
                    } else {
                        setGeneratedDescription(programData.description || `Programa de formación en ${programData.title}`)
                    }
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

    const handleExportBootcampPDF = async () => {
        if (!program) return

        const bootcampData = {
            id: program.id,
            title: program.title,
            description: generatedDescription || program.description,
            duration_weeks: program.duration_weeks,
            modules: program.modules || [],
            total_weight: 1,
            created_at: program.created_at
        }

        await generateAndDownloadBootcampPDF(bootcampData)
    }

    const handleExportModulePDF = (module: any, moduleIndex: number) => {
        alert(`📄 Generando PDF del módulo ${moduleIndex + 1}: "${module.name}"...\n\nPróximamente: Exportación detallada del módulo con sus subtemas y ejercicios.`)
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
                <button onClick={() => navigate('/dashboard?tab=programs')} style={styles.backBtn}>← Volver a Programas</button>
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

    const totalHours = program.modules?.reduce((sum, m) => sum + (m.estimated_hours || 0), 0) || 0
    const totalWeeks = program.duration_weeks || 16
    const hoursPerWeek = Math.round(totalHours / totalWeeks)

    const handleGenerateIntensityPDF = async (intensity: 'intensive' | 'partial' | 'weekend') => {
        if (!program) return

        const intensityMap = {
            intensive: { name: 'Intensivo', hoursPerDay: 8, daysPerWeek: 5, icon: '🔥' },
            partial: { name: 'Parcial', hoursPerDay: 4, daysPerWeek: 5, icon: '📘' },
            weekend: { name: 'Fin de Semana', hoursPerDay: 4, daysPerWeek: 2, icon: '🌅' }
        }

        const config = intensityMap[intensity]
        const hoursPerWeekCalc = config.daysPerWeek * config.hoursPerDay
        const intensityWeeks = Math.ceil(totalHours / hoursPerWeekCalc)

        // Usar la fecha de inicio guardada en localStorage (desde el calendario)
        const startDate = getStoredStartDate()

        // Calcular fecha de fin en UTC
        const endDate = new Date(startDate)
        const configForEnd = intensityMap[intensity]
        const weeksForEnd = Math.ceil(totalHours / (configForEnd.daysPerWeek * configForEnd.hoursPerDay))
        endDate.setUTCDate(endDate.getUTCDate() + (weeksForEnd * 7) - 1)

        const formatDateForAPI = (date: Date): string => {
            return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
        }

        const bootcampData = {
            id: program.id,
            title: `${program.title} (${config.name})`,
            description: generatedDescription || program.description,
            duration_weeks: intensityWeeks,
            modules: program.modules || [],
            total_weight: 1,
            created_at: program.created_at,
            start_date: formatDateForAPI(startDate),
            end_date: formatDateForAPI(endDate)
        }

        await generateAndDownloadBootcampPDF(bootcampData)
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <button onClick={() => navigate('/dashboard?tab=programs')} style={styles.backBtn}>← Volver a Programas</button>
                <div>
                    <h1 style={styles.title}>{getTypeIcon(program.type)} {program.title}</h1>
                    <p style={styles.subtitle}>{getTypeName(program.type)} de formación</p>
                </div>
            </div>

            <div style={styles.content}>
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
                            <span style={styles.infoLabel}>⏱️ Carga horaria</span>
                            <span style={styles.infoValue}>{totalHours} horas totales</span>
                        </div>
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>📅 Creado</span>
                            <span style={styles.infoValue}>{new Date(program.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>⚡ Intensidad</span>
                            <span style={styles.infoValue}>{hoursPerWeek} horas/semana</span>
                        </div>
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>📊 Módulos</span>
                            <span style={styles.infoValue}>{program.modules?.length || 0} módulos</span>
                        </div>
                    </div>
                    <div style={{marginTop: 16, display: 'flex', justifyContent: 'flex-end'}}>
                        <button style={styles.calendarBtn} onClick={() => setShowCalendar(true)}>
                            📅 Ver Calendario
                        </button>
                    </div>
                    <div style={styles.pdfButtonsContainer}>
                        <button style={styles.pdfIntensityBtn} onClick={() => handleGenerateIntensityPDF('intensive')}>
                            🔥 Programa Intensivo (8h/día)
                        </button>
                        <button style={styles.pdfIntensityBtn} onClick={() => handleGenerateIntensityPDF('partial')}>
                            📘 Programa Parcial (4h/día)
                        </button>
                        <button style={styles.pdfIntensityBtn} onClick={() => handleGenerateIntensityPDF('weekend')}>
                            🌅 Programa Fin de Semana (4h/día)
                        </button>
                    </div>
                    <div style={styles.descriptionSection}>
                        <h3 style={styles.descriptionTitle}>📖 Sobre este programa</h3>
                        <div style={styles.description}>
                            {generatedDescription.split('\n').map((line, idx) => (
                                <p key={idx} style={styles.descriptionParagraph}>{line}</p>
                            ))}
                        </div>
                    </div>
                </div>

                {program.modules && program.modules.length > 0 && (
                    <div style={styles.section}>
                        <div style={styles.sectionHeader}>
                            <h2 style={styles.sectionTitle}>📋 Módulos del Programa</h2>
                            <button style={styles.exportAllBtn} onClick={handleExportBootcampPDF}>
                                📄 Exportar programa completo
                            </button>
                        </div>
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
                                    <button style={styles.moduleExportBtn} onClick={() => handleExportModulePDF(module, idx)}>
                                        📄 Exportar módulo a PDF
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>📚 Cursos Incluidos ({program.course_ids?.length || 0})</h2>
                    <div style={styles.coursesGrid}>
                        {program.course_ids?.map((courseId, idx) => (
                            <div key={courseId} style={styles.courseCard}>
                                <div style={styles.courseNumber}>#{idx + 1}</div>
                                <h3 style={styles.courseTitle}>{getCourseTitle(courseId)}</h3>
                                <button style={styles.viewCourseBtn} onClick={() => handleViewCourse(courseId)}>
                                    Ver grafo del curso →
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={styles.footer}>
                <button style={styles.exportBtn} onClick={handleExportBootcampPDF}>
                    📄 Exportar programa completo a PDF
                </button>
            </div>

            <CalendarDialog
                isOpen={showCalendar}
                onClose={() => setShowCalendar(false)}
                bootcampTitle={program.title}
                durationWeeks={program.duration_weeks}
                totalHours={totalHours}
                modules={program.modules || []}
            />
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
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
        fontSize: 16,
        fontWeight: 600,
        color: '#1E3A5F'
    },
    descriptionSection: {
        marginTop: 8
    },
    descriptionTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#1E3A5F',
        marginBottom: 12
    },
    description: {
        fontSize: 14,
        color: '#2C2C2A',
        lineHeight: 1.6
    },
    descriptionParagraph: {
        margin: '0 0 8px 0'
    },
    section: {
        marginBottom: 8
    },
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 600,
        color: '#2C2C2A',
        margin: 0
    },
    exportAllBtn: {
        padding: '6px 12px',
        background: '#1E3A5F',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500
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
        padding: 16,
        display: 'flex',
        flexDirection: 'column'
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
        margin: '0 0 12px',
        flex: 1
    },
    moduleMeta: {
        display: 'flex',
        gap: 12,
        fontSize: 10,
        color: '#888780',
        paddingTop: 8,
        borderTop: '1px solid #F1EFE8',
        marginBottom: 12
    },
    moduleExportBtn: {
        padding: '6px 12px',
        background: '#E8E6E1',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 500,
        color: '#1E3A5F',
        width: '100%'
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
    },
    calendarBtn: {
        padding: '8px 16px',
        background: '#9B59B6',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        marginTop: 8
    },
    pdfButtonsContainer: {
        display: 'flex',
        gap: 12,
        marginTop: 16,
        flexWrap: 'wrap',
        justifyContent: 'center'
    },
    pdfIntensityBtn: {
        padding: '8px 16px',
        background: '#1D9E75',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        flex: 1,
        minWidth: '180px'
    },
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