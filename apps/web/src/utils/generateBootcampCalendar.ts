// src/utils/generateBootcampCalendar.ts

export type IntensityMode = 'intensive' | 'partial' | 'weekend'

export interface IntensityOption {
    id: IntensityMode
    name: string
    description: string
    daysPerWeek: number
    hoursPerDay: number
    icon: string
}

export const INTENSITY_OPTIONS: IntensityOption[] = [
    {
        id: 'intensive',
        name: 'Intensivo',
        description: 'Lunes a Viernes, 8 horas por día',
        daysPerWeek: 5,
        hoursPerDay: 8,
        icon: '🔥'
    },
    {
        id: 'partial',
        name: 'Parcial',
        description: 'Lunes a Viernes, 4 horas por día',
        daysPerWeek: 5,
        hoursPerDay: 4,
        icon: '📘'
    },
    {
        id: 'weekend',
        name: 'Fin de semana',
        description: 'Sábado y Domingo, 4 horas por día',
        daysPerWeek: 2,
        hoursPerDay: 4,
        icon: '🌅'
    }
]

export interface CalendarDay {
    date: Date
    weekNumber: number
    dayOfWeek: number
    dayName: string
    hours: number
    modules: string[]
    topics: string[]
    isWeekend: boolean
}

export interface CalendarData {
    startDate: Date
    endDate: Date
    totalWeeks: number
    totalHours: number
    hoursPerWeek: number
    intensity: IntensityMode
    days: CalendarDay[]
}

/**
 * Calcula el calendario del bootcamp basado en fecha de inicio e intensidad
 */
export function calculateBootcampCalendar(
    startDate: Date,
    durationWeeks: number,
    totalHours: number,
    modules: any[],
    intensity: IntensityMode
): CalendarData {
    const intensityConfig = INTENSITY_OPTIONS.find(o => o.id === intensity) || INTENSITY_OPTIONS[0]
    const hoursPerWeek = intensityConfig.daysPerWeek * intensityConfig.hoursPerDay
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + (durationWeeks * 7))

    const days: CalendarDay[] = []
    let currentDate = new Date(startDate)
    let weekNumber = 1

    // Pre-calcular qué módulos caen en cada semana
    let currentWeekStart = 1
    const moduleSchedule: { weekStart: number; weekEnd: number; module: any }[] = []

    for (const module of modules) {
        const moduleHours = module.estimated_hours || 40
        const moduleWeeks = Math.max(1, Math.ceil(moduleHours / hoursPerWeek))
        moduleSchedule.push({
            weekStart: currentWeekStart,
            weekEnd: currentWeekStart + moduleWeeks - 1,
            module
        })
        currentWeekStart += moduleWeeks
    }

    while (currentDate <= endDate && days.length < durationWeeks * 7) {
        const dayOfWeek = currentDate.getDay() // 0 = domingo, 1 = lunes, etc.
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

        // Determinar si este día tiene clases según la intensidad
        let hasClass = false
        let hours = 0

        if (intensity === 'intensive') {
            hasClass = dayOfWeek >= 1 && dayOfWeek <= 5 // Lunes a Viernes
            hours = hasClass ? 8 : 0
        } else if (intensity === 'partial') {
            hasClass = dayOfWeek >= 1 && dayOfWeek <= 5 // Lunes a Viernes
            hours = hasClass ? 4 : 0
        } else if (intensity === 'weekend') {
            hasClass = dayOfWeek === 0 || dayOfWeek === 6 // Sábado o Domingo
            hours = hasClass ? 4 : 0
        }

        // Determinar qué módulos y temas corresponden a este día
        const currentWeek = weekNumber
        const modulesForWeek = moduleSchedule.filter(m =>
            currentWeek >= m.weekStart && currentWeek <= m.weekEnd
        )

        const modulesForDay = modulesForWeek.map(m => m.module.name.split(' ').slice(0, 2).join(' '))
        const topicsForDay = modulesForWeek.slice(0, 2).flatMap(m =>
            [`${m.module.name} - Módulo ${m.module.order}`]
        )

        days.push({
            date: new Date(currentDate),
            weekNumber,
            dayOfWeek,
            dayName: getDayName(dayOfWeek),
            hours,
            modules: modulesForDay,
            topics: topicsForDay,
            isWeekend
        })

        currentDate.setDate(currentDate.getDate() + 1)
        if (dayOfWeek === 0) { // Domingo, cambiar de semana
            weekNumber++
        }
    }

    return {
        startDate,
        endDate,
        totalWeeks: durationWeeks,
        totalHours,
        hoursPerWeek,
        intensity,
        days
    }
}

function getDayName(dayOfWeek: number): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    return days[dayOfWeek]
}

/**
 * Genera HTML del calendario para exportar a PDF
 */
export function generateCalendarHTML(calendar: CalendarData, bootcampTitle: string): string {
    const intensityOption = INTENSITY_OPTIONS.find(o => o.id === calendar.intensity) || INTENSITY_OPTIONS[0]

    // Agrupar días por semana
    const weeks: CalendarDay[][] = []
    let currentWeek: CalendarDay[] = []
    for (const day of calendar.days) {
        if (day.weekNumber !== (currentWeek[0]?.weekNumber || 0) && currentWeek.length > 0) {
            weeks.push(currentWeek)
            currentWeek = []
        }
        currentWeek.push(day)
    }
    if (currentWeek.length > 0) weeks.push(currentWeek)

    const formatDate = (date: Date): string => {
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${bootcampTitle} - Calendario del Bootcamp</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px;
        }
        
        .action-container {
            width: 100%;
            max-width: 1200px;
            margin-bottom: 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        
        .action-btn {
            background: white;
            border: 1px solid #ccc;
            padding: 10px 24px;
            border-radius: 30px;
            font-size: 0.9rem;
            cursor: pointer;
        }
        
        .calendar-container {
            max-width: 1200px;
            width: 100%;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #1E3A5F 0%, #2d5a8c 100%);
            padding: 30px;
            color: white;
        }
        
        .header h1 {
            font-size: 1.8rem;
            margin-bottom: 10px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.2);
        }
        
        .info-item {
            text-align: center;
        }
        
        .info-label {
            font-size: 0.7rem;
            opacity: 0.7;
            display: block;
        }
        
        .info-value {
            font-size: 1.2rem;
            font-weight: 600;
            display: block;
            margin-top: 5px;
        }
        
        .intensity-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
        }
        
        .week-card {
            margin-bottom: 24px;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
        }
        
        .week-header {
            background: #f0f0f0;
            padding: 12px 20px;
            font-weight: 700;
            color: #1E3A5F;
            border-bottom: 2px solid #1E3A5F;
        }
        
        .days-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
        }
        
        .day-card {
            padding: 12px;
            border-right: 1px solid #e0e0e0;
            border-bottom: 1px solid #e0e0e0;
            min-height: 100px;
        }
        
        .day-card.weekend {
            background: #fafafa;
        }
        
        .day-card.no-class {
            background: #f9f9f9;
            color: #ccc;
        }
        
        .day-name {
            font-weight: 700;
            font-size: 0.8rem;
            margin-bottom: 4px;
        }
        
        .day-date {
            font-size: 0.7rem;
            color: #666;
            margin-bottom: 8px;
        }
        
        .day-hours {
            display: inline-block;
            background: #1D9E75;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.65rem;
            margin-bottom: 8px;
        }
        
        .day-modules {
            font-size: 0.65rem;
            color: #555;
        }
        
        .day-modules span {
            display: block;
            margin-top: 4px;
        }
        
        .footer {
            background: #1E3A5F;
            color: white;
            padding: 20px;
            text-align: center;
        }
        
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .action-container {
                display: none;
            }
            .calendar-container {
                box-shadow: none;
            }
            .day-card {
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
<div class="action-container">
    <button class="action-btn" onclick="window.print()">🖨️ Guardar como PDF (Imprimir)</button>
</div>

<div class="calendar-container">
    <div class="header">
        <h1>📅 ${bootcampTitle}</h1>
        <p>Calendario de formación</p>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">📅 Inicio</span>
                <span class="info-value">${formatDate(calendar.startDate)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">🏁 Fin</span>
                <span class="info-value">${formatDate(calendar.endDate)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">⏱️ Duración</span>
                <span class="info-value">${calendar.totalWeeks} semanas</span>
            </div>
            <div class="info-item">
                <span class="info-label">⚡ Intensidad</span>
                <span class="info-value"><span class="intensity-badge">${intensityOption.icon} ${intensityOption.name}</span></span>
            </div>
            <div class="info-item">
                <span class="info-label">📖 Horas totales</span>
                <span class="info-value">${calendar.totalHours}h</span>
            </div>
            <div class="info-item">
                <span class="info-label">📚 Horas/semana</span>
                <span class="info-value">${calendar.hoursPerWeek}h</span>
            </div>
        </div>
    </div>
    
    <div style="padding: 24px;">
        ${weeks.map((week, idx) => `
            <div class="week-card">
                <div class="week-header">Semana ${idx + 1}</div>
                <div class="days-grid">
                    ${week.map(day => `
                        <div class="day-card ${day.isWeekend ? 'weekend' : ''} ${day.hours === 0 ? 'no-class' : ''}">
                            <div class="day-name">${day.dayName}</div>
                            <div class="day-date">${formatDate(day.date)}</div>
                            ${day.hours > 0 ? `<div class="day-hours">${day.hours}h</div>` : '<div class="day-hours" style="background:#ccc;">Descanso</div>'}
                            <div class="day-modules">
                                ${day.modules.slice(0, 2).map(m => `<span>📘 ${m}</span>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('')}
    </div>
    
    <div class="footer">
        <p>🎓 ¡Comienza tu viaje de aprendizaje!</p>
        <small>Calendario generado por AI Learning Graph</small>
    </div>
</div>
</body>
</html>`
}

/**
 * Genera y descarga el calendario como PDF
 */
export async function generateAndDownloadCalendarPDF(
    bootcampTitle: string,
    calendar: CalendarData
): Promise<Window | null> {
    const html = generateCalendarHTML(calendar, bootcampTitle)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const printWindow = window.open(url, '_blank')

    setTimeout(() => {
        URL.revokeObjectURL(url)
    }, 1000)

    return printWindow
}