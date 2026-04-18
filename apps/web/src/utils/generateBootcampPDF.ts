// src/utils/generateBootcampPDF.ts

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
    weekly_hours?: number
    weeks_duration?: number
}

interface BootcampData {
    id: string
    title: string
    description: string
    duration_weeks: number
    modules: Module[]
    total_weight: number
    created_at: string
    start_date?: string   // Nuevo campo opcional
    end_date?: string      // Nuevo campo opcional
}

/**
 * Calcula la fecha de fin basada en fecha de inicio y duración en semanas
 */
function calculateEndDate(startDate: Date, durationWeeks: number): Date {
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + (durationWeeks * 7))
    return endDate
}

/**
 * Formatea una fecha para mostrar en el PDF
 */
function formatDate(date: Date): string {
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })
}

/**
 * Obtiene la fecha de inicio por defecto (próximo lunes)
 */
function getDefaultStartDate(): Date {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = domingo, 1 = lunes, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() + daysUntilMonday)
    return nextMonday
}

/**
 * Calcula la distribución de semanas por módulo
 */
function calculateModuleWeeksDistribution(modules: Module[], totalWeeks: number): number[] {
    const totalWeight = modules.reduce((sum, m) => sum + m.weight, 0)
    const moduleWeeks: number[] = []
    let remainingWeeks = totalWeeks

    for (let i = 0; i < modules.length; i++) {
        const module = modules[i]
        let weeks = Math.round((module.weight / totalWeight) * totalWeeks)
        if (i === modules.length - 1) {
            weeks = remainingWeeks
        }
        moduleWeeks.push(Math.max(1, weeks))
        remainingWeeks -= weeks
    }

    // Ajustar para que la suma sea exactamente totalWeeks
    const totalAssigned = moduleWeeks.reduce((a, b) => a + b, 0)
    if (totalAssigned !== totalWeeks) {
        const diff = totalWeeks - totalAssigned
        moduleWeeks[moduleWeeks.length - 1] += diff
    }

    return moduleWeeks
}

/**
 * Genera el HTML del bootcamp completo con fechas
 */
function generateBootcampHTML(bootcamp: BootcampData): string {
    const totalHours = bootcamp.modules.reduce((sum, m) => sum + (m.estimated_hours || 0), 0)
    const hoursPerWeek = Math.round(totalHours / bootcamp.duration_weeks)
    const createdDate = new Date(bootcamp.created_at).toLocaleDateString('es-ES')

    // Usar fechas proporcionadas o calcular por defecto
    const startDate = bootcamp.start_date ? new Date(bootcamp.start_date) : getDefaultStartDate()
    const endDate = bootcamp.end_date ? new Date(bootcamp.end_date) : calculateEndDate(startDate, bootcamp.duration_weeks)

    const formattedStartDate = formatDate(startDate)
    const formattedEndDate = formatDate(endDate)

    // Calcular distribución de semanas por módulo
    const moduleWeeks = calculateModuleWeeksDistribution(bootcamp.modules, bootcamp.duration_weeks)

    // Calcular fechas de inicio y fin por módulo
    let currentStartDate = new Date(startDate)
    const moduleDateRanges: { start: string; end: string }[] = []

    for (let i = 0; i < bootcamp.modules.length; i++) {
        const weeks = moduleWeeks[i]
        const moduleEndDate = new Date(currentStartDate)
        moduleEndDate.setDate(moduleEndDate.getDate() + (weeks * 7) - 1)

        moduleDateRanges.push({
            start: formatDate(currentStartDate),
            end: formatDate(moduleEndDate)
        })

        currentStartDate = new Date(moduleEndDate)
        currentStartDate.setDate(currentStartDate.getDate() + 1)
    }

    // Generar HTML de los módulos con fechas
    const generateModulesHTML = () => {
        let html = '<div class="modules-container">'

        bootcamp.modules.forEach((module, idx) => {
            const complexityText = getComplexityLevel(module.complexity)
            const complexityPercent = Math.round(module.complexity * 100)
            const weightPercent = Math.round(module.weight * 100)
            const dateRange = moduleDateRanges[idx]

            html += `
            <div class="module-card">
                <div class="module-header">
                    <div class="module-number">MÓDULO ${module.order}</div>
                    <div class="module-weight">Peso: ${weightPercent}%</div>
                </div>
                <h3 class="module-title">${module.name}</h3>
                <p class="module-description">${module.description || `Curso fundamental para el bootcamp de ${bootcamp.title}`}</p>
                <div class="module-metrics">
                    <div class="metric">
                        <span class="metric-label">📊 Complejidad</span>
                        <span class="metric-value">${complexityPercent}% (${complexityText})</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${complexityPercent}%"></div>
                        </div>
                    </div>
                    <div class="metric">
                        <span class="metric-label">⏱️ Horas totales</span>
                        <span class="metric-value">${module.estimated_hours}h</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">📅 Horas/semana</span>
                        <span class="metric-value">${module.weekly_hours || 40}h</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">🗓️ Duración</span>
                        <span class="metric-value">${moduleWeeks[idx]} semanas</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">📅 Fechas</span>
                        <span class="metric-value">${dateRange.start} → ${dateRange.end}</span>
                    </div>
                </div>
                ${module.prerequisites_modules && module.prerequisites_modules.length > 0 ? `
                <div class="prerequisites">
                    <strong>🔗 Prerrequisitos:</strong> ${module.prerequisites_modules.map(p => `Módulo ${p + 1}`).join(', ')}
                </div>
                ` : '<div class="prerequisites"><strong>🔗 Prerrequisitos:</strong> Ninguno (módulo inicial)</div>'}
            </div>
            `
        })

        html += '</div>'
        return html
    }

    // Generar tabla de distribución semanal con fechas
    const generateWeeklyDistribution = () => {
        let html = '<div class="weekly-distribution"><h3>📅 Distribución Semanal Estimada</h3><div class="weekly-grid">'

        let currentWeekDate = new Date(startDate)

        for (let week = 1; week <= bootcamp.duration_weeks; week++) {
            // Determinar qué módulos caen en esta semana
            let cumulativeWeeks = 0
            let weekModules: string[] = []
            let weekHours = 0

            for (let m = 0; m < bootcamp.modules.length; m++) {
                const module = bootcamp.modules[m]
                const weeksForModule = moduleWeeks[m]
                const moduleStartWeek = cumulativeWeeks + 1
                const moduleEndWeek = cumulativeWeeks + weeksForModule

                if (week >= moduleStartWeek && week <= moduleEndWeek) {
                    weekModules.push(module.name.split(' ').slice(0, 2).join(' '))
                    weekHours = 40
                }
                cumulativeWeeks += weeksForModule
            }

            const weekStartDate = new Date(currentWeekDate)
            const weekEndDate = new Date(currentWeekDate)
            weekEndDate.setDate(weekEndDate.getDate() + 6)

            html += `
            <div class="week-card ${week === 1 ? 'current-week' : ''}">
                <div class="week-number">Semana ${week}</div>
                <div class="week-dates">${formatDate(weekStartDate)} - ${formatDate(weekEndDate)}</div>
                <div class="week-hours">${weekHours}h</div>
                <div class="week-topics">${weekModules.slice(0, 2).join(', ') || 'Continuación'}</div>
            </div>
            `

            currentWeekDate.setDate(currentWeekDate.getDate() + 7)
        }

        html += '</div></div>'
        return html
    }

    // ... resto del HTML (header, stats, etc.) ...

    // HTML completo (mantener el resto igual, solo actualizar header con fechas)
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${bootcamp.title} - Programa del Bootcamp</title>
    <style>
        /* ... estilos existentes ... */
        .week-dates {
            font-size: 0.6rem;
            color: #666;
            margin: 4px 0;
        }
        .module-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 16px;
            margin-bottom: 15px;
        }
        /* ... resto de estilos ... */
    </style>
</head>
<body>
<div class="action-container">
    <button class="action-btn" onclick="window.print()">🖨️ Guardar como PDF (Imprimir)</button>
</div>

<div class="program">
    <div class="header">
        <h1>🚀 ${bootcamp.title}</h1>
        <h2>Programa de formación intensiva en ${bootcamp.title}</h2>
        <div class="badge-container">
            <span class="badge">📅 ${bootcamp.duration_weeks} semanas</span>
            <span class="badge">📚 ${bootcamp.modules.length} módulos</span>
            <span class="badge">⏱️ ${totalHours} horas totales</span>
            <span class="badge">📖 ${hoursPerWeek}h/semana</span>
            <span class="badge">🎓 Bootcamp</span>
        </div>
        <div class="date-range">
            <span class="date-badge">📅 Inicio: ${formattedStartDate}</span>
            <span class="date-badge">🏁 Fin: ${formattedEndDate}</span>
        </div>
    </div>

    <div class="stats">
        <div class="stat">
            <div class="stat-number">${bootcamp.modules.length}</div>
            <div class="stat-label">Módulos</div>
        </div>
        <div class="stat">
            <div class="stat-number">${totalHours}</div>
            <div class="stat-label">Horas Totales</div>
        </div>
        <div class="stat">
            <div class="stat-number">${bootcamp.duration_weeks}</div>
            <div class="stat-label">Semanas</div>
        </div>
        <div class="stat">
            <div class="stat-number">${hoursPerWeek}</div>
            <div class="stat-label">Horas/Semana</div>
        </div>
    </div>

    <div class="description-section">
        <h3>📖 Sobre este Bootcamp</h3>
        <div class="description-text">
            ${bootcamp.description || `Bootcamp diseñado para formar profesionales en ${bootcamp.title}.`}
            <br><br>
            <strong>🎯 Objetivo:</strong> Al finalizar el programa, los participantes serán capaces de desarrollar soluciones completas aplicando los conocimientos adquiridos en cada módulo.
            <br><br>
            <strong>✅ Incluye:</strong> ${bootcamp.modules.length} módulos con ${totalHours} horas de formación, proyectos prácticos y certificación.
            <br><br>
            <strong>📅 Calendario:</strong> Inicio: ${formattedStartDate} | Fin: ${formattedEndDate}
        </div>
    </div>

    <div class="modules-section">
        <h3>📋 Módulos del Programa</h3>
        ${generateModulesHTML()}
    </div>

    ${generateWeeklyDistribution()}

    <div class="footer">
        <h3>🎓 ¿Listo para comenzar tu viaje de aprendizaje?</h3>
        <div class="footer-info">
            <span>Inicio: ${formattedStartDate}</span>
            <span>Duración: ${bootcamp.duration_weeks} semanas</span>
            <span>Certificación incluida</span>
        </div>
        <small>Programa diseñado con AI Learning Graph</small><br>
        <small>${bootcamp.title} · Creado el ${createdDate}</small>
    </div>
</div>
</body>
</html>`
}

// Mantener las funciones auxiliares existentes...
function getComplexityLevel(complexity: number): string {
    if (complexity >= 0.8) return 'Avanzado'
    if (complexity >= 0.6) return 'Intermedio-Alto'
    if (complexity >= 0.4) return 'Intermedio'
    if (complexity >= 0.2) return 'Básico'
    return 'Introducción'
}

// Exportar funciones
export async function generateAndDownloadBootcampPDF(bootcamp: BootcampData): Promise<Window | null> {
    const html = generateBootcampHTML(bootcamp)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const printWindow = window.open(url, '_blank')

    setTimeout(() => {
        URL.revokeObjectURL(url)
    }, 1000)

    return printWindow
}

export function downloadBootcampAsHTML(bootcamp: BootcampData): void {
    const html = generateBootcampHTML(bootcamp)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${bootcamp.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_bootcamp.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}