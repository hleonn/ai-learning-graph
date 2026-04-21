// src/components/CalendarDialog.tsx

import { useState } from 'react'
import { calculateBootcampCalendar, generateAndDownloadCalendarPDF, INTENSITY_OPTIONS, type IntensityMode } from '../utils/generateBootcampCalendar'

interface CalendarDialogProps {
    isOpen: boolean
    onClose: () => void
    bootcampTitle: string
    durationWeeks: number
    totalHours: number
    modules: any[]
}

// Función para normalizar fecha a UTC
function normalizeDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day))
}

// Función para formatear fecha localmente
function formatDateLocal(date: Date): string {
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    })
}

// Función para calcular fecha de finalización correctamente
function calcularFechaFin(startDateStr: string, totalWeeks: number, daysPerWeek: number): string {
    const start = normalizeDate(startDateStr)
    const totalDays = totalWeeks * daysPerWeek
    const endDate = new Date(start)
    endDate.setUTCDate(endDate.getUTCDate() + totalDays - 1)
    return formatDateLocal(endDate)
}

export default function CalendarDialog({ isOpen, onClose, bootcampTitle, durationWeeks, totalHours, modules }: CalendarDialogProps) {
    const [startDate, setStartDate] = useState<string>(() => {
        const tomorrow = new Date()
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        return tomorrow.toISOString().split('T')[0]
    })
    const [intensity, setIntensity] = useState<IntensityMode>('intensive')
    const [generating, setGenerating] = useState(false)

    if (!isOpen) return null

    const handleGenerateCalendar = async () => {
        setGenerating(true)
        try {
            localStorage.setItem('bootcamp_calendar_start_date', startDate)
            localStorage.setItem('bootcamp_calendar_intensity', intensity)

            const startDateObj = normalizeDate(startDate)
            const calendar = calculateBootcampCalendar(
                startDateObj,
                durationWeeks,
                totalHours,
                modules,
                intensity
            )
            await generateAndDownloadCalendarPDF(bootcampTitle, calendar)
        } catch (error) {
            console.error('Error generating calendar:', error)
            alert('Error al generar el calendario')
        } finally {
            setGenerating(false)
        }
    }

    const intensityOption = INTENSITY_OPTIONS.find(o => o.id === intensity) || INTENSITY_OPTIONS[0]
    const hoursPerWeek = intensityOption.daysPerWeek * intensityOption.hoursPerDay
    const totalWeeksWithIntensity = Math.ceil(totalHours / hoursPerWeek)
    const startDateObj = normalizeDate(startDate)
    const formattedStartDate = formatDateLocal(startDateObj)
    const endDate = calcularFechaFin(startDate, totalWeeksWithIntensity, intensityOption.daysPerWeek)

    return (
        <div style={styles.overlay}>
            <div style={styles.dialog}>
                <div style={styles.dialogHeader}>
                    <h3 style={styles.dialogTitle}>📅 Generar Calendario del Bootcamp</h3>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>

                <div style={styles.dialogContent}>
                    {/* 1️⃣ INTENSIDAD DEL PROGRAMA - PRIMERO */}
                    <div style={styles.field}>
                        <label style={styles.label}>⚡ Intensidad del programa</label>
                        <div style={styles.intensityGrid}>
                            {INTENSITY_OPTIONS.map(option => (
                                <button
                                    key={option.id}
                                    onClick={() => setIntensity(option.id)}
                                    style={{
                                        ...styles.intensityBtn,
                                        ...(intensity === option.id ? styles.intensityBtnActive : {})
                                    }}
                                >
                                    <span style={styles.intensityIcon}>{option.icon}</span>
                                    <div style={styles.intensityInfo}>
                                        <span style={styles.intensityName}>{option.name}</span>
                                        <span style={styles.intensityDesc}>{option.description}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 2️⃣ FECHA DE INICIO - SEGUNDO */}
                    <div style={styles.field}>
                        <label style={styles.label}>📅 Fecha de inicio</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={styles.input}
                            min={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    {/* 3️⃣ RESUMEN - TERCERO */}
                    <div style={styles.summary}>
                        <p><strong>📊 Resumen:</strong></p>
                        <p>• Duración total: <strong>{durationWeeks} semanas</strong> (base)</p>
                        <p>• Con intensidad {intensityOption.name}: <strong>{totalWeeksWithIntensity} semanas</strong></p>
                        <p>• Horas por semana: <strong>{hoursPerWeek}h</strong></p>
                        <p>• Total de horas: <strong>{totalHours}h</strong></p>
                        <p>• 📅 Fecha de Inicio: <strong>{formattedStartDate}</strong></p>
                        <p>• 🏁 Fecha de Finalización: <strong>{endDate}</strong></p>
                    </div>
                </div>

                <div style={styles.dialogFooter}>
                    <button onClick={onClose} style={styles.cancelBtn}>Cancelar</button>
                    <button onClick={handleGenerateCalendar} disabled={generating} style={styles.generateBtn}>
                        {generating ? 'Generando...' : '📅 Generar Calendario'}
                    </button>
                </div>
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
        zIndex: 1000
    },
    dialog: {
        background: '#fff',
        borderRadius: 16,
        width: '90%',
        maxWidth: 500,
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
    },
    dialogHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #E8E6E1',
        background: '#1E3A5F',
        color: '#fff',
        borderRadius: '16px 16px 0 0'
    },
    dialogTitle: {
        fontSize: 18,
        fontWeight: 600,
        margin: 0,
        color: '#fff'
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        fontSize: 20,
        cursor: 'pointer',
        color: '#fff',
        opacity: 0.7
    },
    dialogContent: {
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8
    },
    label: {
        fontSize: 13,
        fontWeight: 500,
        color: '#2C2C2A'
    },
    input: {
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #D3D1C7',
        fontSize: 14,
        fontFamily: 'inherit'
    },
    intensityGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
    },
    intensityBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px',
        borderRadius: 8,
        border: '1px solid #D3D1C7',
        background: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s'
    },
    intensityBtnActive: {
        borderColor: '#1D9E75',
        background: '#E1F5EE'
    },
    intensityIcon: {
        fontSize: 24
    },
    intensityInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2
    },
    intensityName: {
        fontWeight: 600,
        fontSize: 14,
        color: '#1E3A5F'
    },
    intensityDesc: {
        fontSize: 12,
        color: '#888780'
    },
    summary: {
        background: '#F9F9F8',
        padding: '12px',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.6
    },
    dialogFooter: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 12,
        padding: '16px 20px',
        borderTop: '1px solid #E8E6E1',
        background: '#F9F9F8',
        borderRadius: '0 0 16px 16px'
    },
    cancelBtn: {
        padding: '8px 16px',
        background: '#E8E6E1',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13
    },
    generateBtn: {
        padding: '8px 16px',
        background: '#1D9E75',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600
    }
}