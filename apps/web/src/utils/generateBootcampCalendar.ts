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

function formatDateUTC(date: Date): string {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${day}/${month}/${year}`
}

export function calculateBootcampCalendar(
    startDate: Date,
    durationWeeks: number,
    totalHours: number,
    modules: any[],
    intensity: IntensityMode
): CalendarData {
    const intensityConfig = INTENSITY_OPTIONS.find(o => o.id === intensity) || INTENSITY_OPTIONS[0]
    const hoursPerWeek = intensityConfig.daysPerWeek * intensityConfig.hoursPerDay

    const totalWeeks = (() => {
        switch (intensity) {
            case 'intensive': return durationWeeks
            case 'partial': return durationWeeks * 2
            case 'weekend': return durationWeeks * 5
            default: return durationWeeks
        }
    })()

    const endDate = new Date(startDate)
    endDate.setUTCDate(endDate.getUTCDate() + (totalWeeks * 7) - 1)

    const days: CalendarDay[] = []
    let currentDate = new Date(startDate)
    let weekNumber = 1

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

    const totalDaysToGenerate = totalWeeks * 7
    let daysGenerated = 0

    while (daysGenerated < totalDaysToGenerate) {
        const dayOfWeek = currentDate.getUTCDay()
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

        let hours = 0

        if (intensity === 'intensive') {
            hours = (dayOfWeek >= 1 && dayOfWeek <= 5) ? 8 : 0
        } else if (intensity === 'partial') {
            hours = (dayOfWeek >= 1 && dayOfWeek <= 5) ? 4 : 0
        } else if (intensity === 'weekend') {
            hours = (dayOfWeek === 6 || dayOfWeek === 0) ? 4 : 0
        }

        const currentWeek = weekNumber
        const modulesForWeek = moduleSchedule.filter(m =>
            currentWeek >= m.weekStart && currentWeek <= m.weekEnd
        )

        const modulesForDay = modulesForWeek.map(m => m.module.name)
        const topicsForDay = modulesForWeek.map(m => `${m.module.name} - Módulo ${m.module.order}`)

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

        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
        daysGenerated++

        if (dayOfWeek === 0) {
            weekNumber++
        }
    }

    return {
        startDate,
        endDate,
        totalWeeks,
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

export function generateCalendarHTML(calendar: CalendarData, bootcampTitle: string): string {
    const intensityOption = INTENSITY_OPTIONS.find(o => o.id === calendar.intensity) || INTENSITY_OPTIONS[0]

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
        return formatDateUTC(date)
    }

    const formattedStartDate = formatDate(calendar.startDate)
    const formattedEndDate = formatDate(calendar.endDate)

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${bootcampTitle} - Calendario del Bootcamp</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
            background: #ffffff;
            padding: 30px 35px;
            color: #1a1f36;
            display: flex;
            align-items: center;
            gap: 24px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .header-logo {
            width: 64px;
            height: 64px;
            border-radius: 14px;
            background: white;
            padding: 6px;
            flex-shrink: 0;
            border: 1px solid #e0e0e0;
        }
        
        .header-logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        
        .header-content {
            flex: 1;
        }
        
        .header h1 {
            font-size: 1.8rem;
            margin-bottom: 6px;
            color: #1a1f36;
            font-weight: 700;
        }
        
        .header p {
            color: #555;
            font-size: 0.95rem;
            font-weight: 400;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #e0e0e0;
        }
        
        .info-item {
            text-align: center;
        }
        
        .info-label {
            font-size: 0.65rem;
            color: #888;
            display: block;
            margin-bottom: 3px;
        }
        
        .info-value {
            font-size: 1rem;
            font-weight: 600;
            color: #1a1f36;
            display: block;
        }
        
        .intensity-badge {
            display: inline-block;
            background: #f0f0f0;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            color: #1a1f36;
            border: 1px solid #d4d4d4;
        }
        
        .week-card {
            margin-bottom: 24px;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
        }
        
        .week-header {
            background: #f5f5f5;
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
            min-height: 120px;
        }
        
        .day-card.weekend {
            background: #fafafa;
        }
        
        .day-card.no-class {
            background: #f9f9f9;
            color: #999;
        }
        
        .day-name {
            font-weight: 700;
            font-size: 0.8rem;
            margin-bottom: 4px;
            color: #1a1f36;
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
            font-size: 0.7rem;
            color: #555;
            line-height: 1.3;
        }
        
        .day-modules span {
            display: block;
            margin-top: 4px;
        }
        
        .footer {
            background: #ffffff;
            color: #1a1f36;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #e0e0e0;
        }
        
        .footer p {
            color: #1a1f36;
            font-size: 1rem;
            font-weight: 600;
        }
        
        .footer small {
            color: #888;
            font-size: 0.7rem;
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
                border-radius: 0;
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
        <div class="header-logo">
            <img src="https://ai-learning-graph.vercel.app/logo.png" alt="Logo" />
        </div>
        <div class="header-content">
            <h1>📅 ${bootcampTitle}</h1>
            <p>Calendario de formación</p>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">📅 Inicio</span>
                    <span class="info-value">${formattedStartDate}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">🏁 Fin</span>
                    <span class="info-value">${formattedEndDate}</span>
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
                            ${day.hours > 0 ? `
                            <div class="day-modules">
                                ${day.modules.map(m => `<span>📘 ${m}</span>`).join('')}
                            </div>
                            ` : ''}
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