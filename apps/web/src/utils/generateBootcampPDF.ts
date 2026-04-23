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
    start_date?: string
    end_date?: string
}

function normalizeDate(dateInput: string | Date): Date {
    if (typeof dateInput === 'string') {
        const [year, month, day] = dateInput.split('-').map(Number)
        return new Date(Date.UTC(year, month - 1, day))
    }
    return new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()))
}

function formatDateUTC(date: Date): string {
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    })
}

function calculateEndDate(startDate: Date, durationWeeks: number): Date {
    const endDate = new Date(startDate)
    endDate.setUTCDate(endDate.getUTCDate() + (durationWeeks * 7))
    return endDate
}

function getDefaultStartDate(): Date {
    const today = new Date()
    const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    const dayOfWeek = utcToday.getUTCDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextMonday = new Date(utcToday)
    nextMonday.setUTCDate(utcToday.getUTCDate() + daysUntilMonday)
    return nextMonday
}

function calculateModuleWeeksDistribution(modules: Module[], totalWeeks: number): number[] {
    const totalWeight = modules.reduce((sum, m) => sum + m.weight, 0)
    const moduleWeeks: number[] = []
    let remainingWeeks = totalWeeks

    for (let i = 0; i < modules.length; i++) {
        const module = modules[i]
        let weeks = Math.round((module.weight / totalWeight) * totalWeeks)
        if (i === modules.length - 1) weeks = remainingWeeks
        moduleWeeks.push(Math.max(1, weeks))
        remainingWeeks -= weeks
    }

    const totalAssigned = moduleWeeks.reduce((a, b) => a + b, 0)
    if (totalAssigned !== totalWeeks) {
        moduleWeeks[moduleWeeks.length - 1] += totalWeeks - totalAssigned
    }

    return moduleWeeks
}

function getComplexityLevel(complexity: number): string {
    if (complexity >= 0.8) return 'Avanzado'
    if (complexity >= 0.6) return 'Intermedio-Alto'
    if (complexity >= 0.4) return 'Intermedio'
    if (complexity >= 0.2) return 'Básico'
    return 'Introducción'
}

const MODULE_COLORS = [
    '#5b8dee', '#9b72e8', '#f07a3a', '#3bbf8c', '#2ab8c8', '#e85d75', '#a78bfa'
]

// ========== GANTT ==========
function generateGanttChart(modules: Module[], totalWeeks: number, moduleWeeks: number[]): string {
    const sortedModules = [...modules].sort((a, b) => a.order - b.order)

    const BAR_HEIGHT  = 40
    const ROW_HEIGHT  = 54
    const LABEL_WIDTH = 110

    // ── Escala dinámica según duración total ──────────────────────
    // Ancho disponible estimado del SVG (el contenedor .program tiene max 1000px,
    // menos padding 28px*2, menos label 110px, menos margen 30px*2 = ~774px útiles)
    const AVAILABLE_WIDTH = 774

    // PIXELS_PER_WEEK se ajusta para que el gráfico siempre quepa sin scroll
    // pero respetando un mínimo legible de 28px/semana
    const PIXELS_PER_WEEK = Math.max(28, Math.floor(AVAILABLE_WIDTH / totalWeeks))

    // Referencia por duración:
    //  8 sem → 96px/sem  (774/8)
    // 12 sem → 64px/sem  (774/12)
    // 16 sem → 48px/sem  (774/16)
    // 20 sem → 38px/sem  (774/20)
    // 24 sem → 32px/sem  (774/24)
    // ─────────────────────────────────────────────────────────────

    let currentX = 0
    const positions = sortedModules.map((mod, idx) => {
        const weeks = moduleWeeks[idx]
        const width = weeks * PIXELS_PER_WEEK   // escala siempre consistente
        const item  = { x: currentX, width, mod, weeks, color: MODULE_COLORS[idx % MODULE_COLORS.length] }
        currentX += width
        return item
    })

    const TOTAL_SVG_WIDTH = totalWeeks * PIXELS_PER_WEEK + 20
    const SVG_HEIGHT      = positions.length * ROW_HEIGHT + 40

    // Labels
    let labelsHTML = ''
    positions.forEach((item, idx) => {
        const top = idx * ROW_HEIGHT + 8
        labelsHTML += `
        <div class="gantt-label" style="top:${top}px; height:${BAR_HEIGHT}px;">
            <span class="gantt-label-name" style="color:${item.color}">Módulo ${item.mod.order}</span>
            <span class="gantt-label-dur">${item.weeks} ${item.weeks === 1 ? 'semana' : 'semanas'}</span>
        </div>`
    })

    // Bars — el texto se adapta al ancho real de cada barra
    let barsHTML = ''
    positions.forEach((item, idx) => {
        const y       = idx * ROW_HEIGHT + 8
        const words   = item.mod.name.split(' ')
        const mid     = Math.ceil(words.length / 2)
        const line1   = words.length <= 3 ? words.join(' ') : words.slice(0, mid).join(' ')
        const line2   = words.length <= 3 ? '' : words.slice(mid).join(' ')

        // chars disponibles según el ancho real de la barra
        const maxChars = Math.floor(item.width / 6.5)
        const l1 = line1.length > maxChars ? line1.slice(0, maxChars - 3) + '…' : line1
        const l2 = line2.length > maxChars ? line2.slice(0, maxChars - 3) + '…' : line2

        const textY  = y + BAR_HEIGHT / 2 + 4
        const line1Y = l2 ? textY - 7 : textY
        const line2Y = textY + 7

        // Ajuste de font-size según espacio disponible
        const fontSize = PIXELS_PER_WEEK >= 60 ? 9.5 : PIXELS_PER_WEEK >= 40 ? 8.5 : 7.5

        barsHTML += `
        <rect x="${item.x}" y="${y}" width="${item.width - 4}" height="${BAR_HEIGHT}"
              rx="6" fill="${item.color}15" stroke="${item.color}" stroke-width="1.5"/>
        <text x="${item.x + 8}" y="${line1Y}"
              font-family="DM Sans,sans-serif" font-size="${fontSize}" fill="#1a1f36" font-weight="600">${l1}</text>
        ${l2 ? `<text x="${item.x + 8}" y="${line2Y}"
              font-family="DM Sans,sans-serif" font-size="${fontSize}" fill="#1a1f36" font-weight="600">${l2}</text>` : ''}`
    })

    // Grid + eje X — usan exactamente PIXELS_PER_WEEK, en sync con las barras
    let gridHTML = '', xAxisHTML = ''

    // Marcas de semana: si hay muchas semanas, mostrar solo cada N para no saturar
    const labelEvery = totalWeeks <= 12 ? 1 : totalWeeks <= 20 ? 2 : 4

    for (let i = 0; i <= totalWeeks; i++) {
        const x = i * PIXELS_PER_WEEK
        // línea de grid siempre
        gridHTML += `<line x1="${x}" y1="0" x2="${x}" y2="${positions.length * ROW_HEIGHT}"
                           stroke="#e8edf5" stroke-width="1"/>`
        // label solo cada labelEvery semanas (y siempre el 0 y el último)
        if (i % labelEvery === 0 || i === totalWeeks) {
            xAxisHTML += `<text x="${x}" y="${positions.length * ROW_HEIGHT + 22}"
                font-family="DM Sans,sans-serif" font-size="10" fill="#9aa0b8" text-anchor="middle">${i}</text>`
        }
    }

    return `
    <div class="gantt-inner">
        <div class="gantt-labels-col" style="width:${LABEL_WIDTH}px;">
            <div style="position:relative; height:${SVG_HEIGHT}px;">
                ${labelsHTML}
            </div>
        </div>
        <div class="gantt-svg-col">
            <svg width="${TOTAL_SVG_WIDTH}" height="${SVG_HEIGHT}"
                 viewBox="0 0 ${TOTAL_SVG_WIDTH} ${SVG_HEIGHT}"
                 xmlns="http://www.w3.org/2000/svg" style="display:block; width:100%;">
                <g>${gridHTML}</g>
                ${barsHTML}
                <g>${xAxisHTML}</g>
            </svg>
        </div>
    </div>`
}

// ========== BLOOM CHART ==========
function generateBloomProgressChart(
    modules: Module[],
    totalWeeks: number,
    startDate: string,
    endDate: string
): string {
    const sortedModules = [...modules].sort((a, b) => a.order - b.order)
    const moduleCount = sortedModules.length

    const svgWidth    = 800
    const marginTop   = 60
    const chartTop    = 20
    const chartBottom = 240
    const chartHeight = chartBottom - chartTop
    const viewBoxH    = 330
    const totalVH     = viewBoxH + marginTop   // 390

    let cumulativeWeight = 0
    const moduleData = sortedModules.map((mod, idx) => {
        cumulativeWeight += mod.weight
        const progressPercent = Math.round(cumulativeWeight * 100)
        const yInViewBox = chartBottom - (progressPercent / 100) * chartHeight
        const yAbsolute  = marginTop + yInViewBox
        const topPct     = (yAbsolute / totalVH) * 100
        return { ...mod, progressPercent, color: MODULE_COLORS[idx % MODULE_COLORS.length], yInViewBox, topPct }
    })

    const bloomLevels = [
        'Evaluar y Crear', 'Analizar y Evaluar', 'Aplicar y Analizar',
        'Comprender y Aplicar', 'Recordar y Comprender'
    ]
    const bloomTopPcts = bloomLevels.map((_, i) => {
        const yInViewBox = chartTop + (i / (bloomLevels.length - 1)) * chartHeight
        const yAbsolute  = marginTop + yInViewBox
        return (yAbsolute / totalVH) * 100
    })

    const points = moduleData.map((mod, idx) => ({
        x: 40 + (idx / (moduleCount - 1 || 1)) * (svgWidth - 80),
        y: mod.yInViewBox
    }))

    const curvePath = points.map((p, i) => {
        if (i === 0) return `M${p.x},${p.y}`
        const prev = points[i - 1]
        const cpx  = prev.x + (p.x - prev.x) * 0.5
        return `C${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`
    }).join(' ')

    const areaPath = `${curvePath} L${points[points.length-1].x},${chartBottom} L40,${chartBottom} Z`

    let modulesHTML = ''
    moduleData.forEach(mod => {
        modulesHTML += `
        <div class="bloom-y-item" style="top:${mod.topPct.toFixed(2)}%; transform:translateY(-50%);">
            <span class="bloom-y-name" style="color:${mod.color}">Módulo ${mod.order}</span>
            <span class="bloom-y-percent" style="color:${mod.color}; background:${mod.color}15">${mod.progressPercent}%</span>
        </div>`
    })

    let bloomHTML = ''
    bloomLevels.forEach((level, i) => {
        bloomHTML += `
        <div class="bloom-item" style="top:${bloomTopPcts[i].toFixed(2)}%; transform:translateY(-50%);">
            <span class="bloom-level">${level}</span>
        </div>`
    })

    let pointsHTML = ''
    points.forEach((p, idx) => {
        const mod = moduleData[idx]
        const isFirst = idx === 0
        const isLast  = idx === moduleCount - 1
        let tx = p.x - 38
        if (isFirst) tx = p.x + 10
        if (isLast)  tx = p.x - 85
        pointsHTML += `
        <g>
            <circle cx="${p.x}" cy="${p.y}" r="5.5" fill="white" stroke="${mod.color}" stroke-width="2.5"/>
            <g transform="translate(${tx},${p.y-45})">
                <rect x="0" y="0" width="76" height="36" rx="8" fill="white" stroke="${mod.color}" stroke-width="1.5"/>
                <text x="38" y="14" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="10" font-weight="700" fill="${mod.color}">Módulo ${mod.order}</text>
                <text x="38" y="28" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="12" font-weight="800" fill="#1a1f36">${mod.progressPercent}%</text>
            </g>
        </g>`
    })

    let xAxisHTML = ''
    for (let i = 0; i <= totalWeeks; i++) {
        const x = 40 + (i / totalWeeks) * (svgWidth - 80)
        xAxisHTML += `<text x="${x}" y="${chartBottom+25}">${i}</text>`
    }

    let gridV = '', gridH = '', modLines = '', areaStops = '', lineStops = ''
    points.forEach(p => {
        gridV    += `<line x1="${p.x}" y1="${chartTop}" x2="${p.x}" y2="${chartBottom}"/>`
        modLines += `<line x1="${p.x}" y1="${chartTop}" x2="${p.x}" y2="${chartBottom}"/>`
    })
    ;[0,25,50,75,100].forEach(pct => {
        const y = chartBottom - (pct/100)*chartHeight
        gridH += `<line x1="40" y1="${y}" x2="${svgWidth-40}" y2="${y}"/>`
    })
    moduleData.forEach((mod, idx) => {
        const off = (idx / (moduleCount-1||1)) * 100
        areaStops += `<stop offset="${off}%" stop-color="${mod.color}" stop-opacity="0.15"/>`
        lineStops += `<stop offset="${off}%" stop-color="${mod.color}"/>`
    })

    return `
    <div class="bloom-chart-container">
        <div class="bloom-chart-header">
            <div class="bloom-chart-title">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="margin-right:8px">
                    <polyline points="1,14 5,8 9,10 13,4 17,6" stroke="#5b8dee" stroke-width="2"
                        stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                </svg>
                <span>Avance Programado del ${startDate} al ${endDate}</span>
            </div>
            <div class="bloom-chart-subtitle">Progresión pedagógica por módulo</div>
        </div>

        <div class="bloom-chart-layout">
            <div class="bloom-y-axis-left">
                ${modulesHTML}
            </div>
            <div class="bloom-svg-container">
                <svg viewBox="0 -${marginTop} ${svgWidth} ${viewBoxH}" class="bloom-main-svg">
                    <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="1" y2="0">${areaStops}</linearGradient>
                        <linearGradient id="lineGrad"  x1="0" y1="0" x2="1" y2="0">${lineStops}</linearGradient>
                    </defs>
                    <g stroke="#e8edf5" stroke-width="1">${gridV}</g>
                    <g stroke="#e8edf5" stroke-width="1" stroke-dasharray="3,4">${gridH}</g>
                    <g stroke="#c5cde0" stroke-width="1.2" stroke-dasharray="4,4">${modLines}</g>
                    <line x1="40" y1="${chartBottom}" x2="${svgWidth-40}" y2="${chartBottom}" stroke="#c5cde0" stroke-width="1.5"/>
                    <path d="${areaPath}" fill="url(#areaGrad)"/>
                    <path d="${curvePath}" fill="none" stroke="url(#lineGrad)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                    ${pointsHTML}
                    <g font-family="DM Sans,sans-serif" font-size="11" fill="#6b7394" text-anchor="middle">${xAxisHTML}</g>
                    <text x="${svgWidth/2}" y="${chartBottom+42}" text-anchor="middle"
                          font-family="DM Sans,sans-serif" font-size="12" fill="#6b7394" font-weight="500">Semanas</text>
                </svg>
            </div>
            <div class="bloom-y-axis-right">
                ${bloomHTML}
            </div>
        </div>

        <div class="bloom-chart-footer">
            <div class="bloom-stat">
                <span class="bloom-stat-icon">📊</span>
                <div><span class="bloom-stat-label">Total módulos</span><span class="bloom-stat-value">${moduleCount}</span></div>
            </div>
            <div class="bloom-stat-divider"></div>
            <div class="bloom-stat">
                <span class="bloom-stat-icon">⏱️</span>
                <div><span class="bloom-stat-label">Carga horaria</span><span class="bloom-stat-value">${modules.reduce((s,m)=>s+(m.estimated_hours||0),0)}h</span></div>
            </div>
            <div class="bloom-stat-divider"></div>
            <div class="bloom-stat">
                <span class="bloom-stat-icon">📅</span>
                <div><span class="bloom-stat-label">Duración</span><span class="bloom-stat-value">${totalWeeks} semanas</span></div>
            </div>
        </div>
    </div>`
}

// ========== CSS ==========
const BLOOM_CHART_STYLES = `
/* ── Bloom chart ─────────────────────────────────────── */
.bloom-chart-container {
    background: white;
    border-radius: 16px;
    border: 1px solid #e4e8f0;
    padding: 24px 28px;
    margin: 0 30px 24px 30px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.bloom-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
}
.bloom-chart-title {
    display: flex;
    align-items: center;
    font-size: 18px;
    font-weight: 700;
    color: #1a1f36;
}
.bloom-chart-subtitle {
    font-size: 13px;
    color: #6b7394;
    font-weight: 500;
}
.bloom-chart-layout {
    display: flex;
    align-items: stretch;
}
.bloom-y-axis-left,
.bloom-y-axis-right {
    position: relative;
    flex-shrink: 0;
}
.bloom-y-axis-left  { min-width: 100px; padding-right: 10px; }
.bloom-y-axis-right { min-width: 150px; padding-left: 10px; }
.bloom-y-item,
.bloom-item {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    white-space: nowrap;
}
.bloom-y-item { justify-content: flex-end; gap: 8px; }
.bloom-item   { justify-content: flex-start; gap: 6px; }
.bloom-y-name    { font-size: 11.5px; font-weight: 600; }
.bloom-y-percent {
    font-size: 12px;
    font-weight: 700;
    border-radius: 5px;
    padding: 2px 7px;
}
.bloom-level {
    font-size: 11px;
    font-weight: 600;
    color: #8b5cf6;
    background: #f3e8ff;
    padding: 2px 8px;
    border-radius: 12px;
}
.bloom-svg-container { flex: 1; min-width: 0; }
.bloom-main-svg { width: 100%; display: block; }
.bloom-chart-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1.5px solid #e4e8f0;
    padding-top: 18px;
    margin-top: 20px;
    flex-wrap: wrap;
    gap: 16px;
}
.bloom-stat { display: flex; align-items: center; gap: 10px; }
.bloom-stat-icon {
    width: 34px; height: 34px;
    background: #f7f8fc;
    border-radius: 9px;
    border: 1.5px solid #e4e8f0;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
}
.bloom-stat-label { font-size: 10.5px; color: #6b7394; font-weight: 500; display: block; }
.bloom-stat-value {
    font-size: 17px; font-weight: 700;
    font-family: 'DM Mono', monospace; color: #1a1f36;
}
.bloom-stat-divider { width: 1px; height: 36px; background: #e4e8f0; }

/* ── Gantt ────────────────────────────────────────────── */
.gantt-chart-container {
    background: white;
    border-radius: 16px;
    border: 1px solid #e4e8f0;
    padding: 24px 28px;
    margin: 0 30px 24px 30px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.gantt-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}
.gantt-chart-title {
    display: flex;
    align-items: center;
    font-size: 18px;
    font-weight: 700;
    color: #1a1f36;
}
.gantt-chart-subtitle {
    font-size: 13px;
    color: #6b7394;
    font-weight: 500;
}
.gantt-inner {
    display: flex;
    align-items: flex-start;
    gap: 0;
}
.gantt-labels-col {
    flex-shrink: 0;
    padding-right: 12px;
}
.gantt-label {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.gantt-label-name {
    font-size: 11px;
    font-weight: 700;
    line-height: 1.3;
}
.gantt-label-dur {
    font-size: 9.5px;
    color: #6b7394;
    font-weight: 400;
    margin-top: 2px;
}
.gantt-svg-col {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
}

@media print {
    .bloom-chart-container,
    .gantt-chart-container {
        box-shadow: none;
        border: 1px solid #ccc;
        break-inside: avoid;
        page-break-inside: avoid;
    }
}
`

function generateBootcampHTML(bootcamp: BootcampData): string {
    const totalHours   = bootcamp.modules.reduce((sum, m) => sum + (m.estimated_hours || 0), 0)
    const hoursPerWeek = Math.round(totalHours / bootcamp.duration_weeks)
    const createdDate  = formatDateUTC(normalizeDate(bootcamp.created_at))

    const startDate = bootcamp.start_date ? normalizeDate(bootcamp.start_date) : getDefaultStartDate()
    const endDate   = bootcamp.end_date   ? normalizeDate(bootcamp.end_date)   : calculateEndDate(startDate, bootcamp.duration_weeks)

    const formattedStartDate = formatDateUTC(startDate)
    const formattedEndDate   = formatDateUTC(endDate)

    const moduleWeeks = calculateModuleWeeksDistribution(bootcamp.modules, bootcamp.duration_weeks)

    let currentStartDate = new Date(startDate)
    const moduleDateRanges: { start: string; end: string }[] = []

    for (let i = 0; i < bootcamp.modules.length; i++) {
        const weeks = moduleWeeks[i]
        const moduleEndDate = new Date(currentStartDate)
        moduleEndDate.setUTCDate(moduleEndDate.getUTCDate() + (weeks * 7) - 1)
        moduleDateRanges.push({
            start: formatDateUTC(currentStartDate),
            end:   formatDateUTC(moduleEndDate)
        })
        currentStartDate = new Date(moduleEndDate)
        currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1)
    }

    const generateModulesHTML = () => {
        let html = '<div class="modules-container">'
        bootcamp.modules.forEach((module, idx) => {
            const complexityText    = getComplexityLevel(module.complexity)
            const complexityPercent = Math.round(module.complexity * 100)
            const weightPercent     = Math.round(module.weight * 100)
            const dateRange         = moduleDateRanges[idx]

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
                        <div class="progress-bar"><div class="progress-fill" style="width:${complexityPercent}%"></div></div>
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
                ${module.prerequisites_modules && module.prerequisites_modules.length > 0
                ? `<div class="prerequisites"><strong>🔗 Prerrequisitos:</strong> ${module.prerequisites_modules.map(p => `Módulo ${p+1}`).join(', ')}</div>`
                : '<div class="prerequisites"><strong>🔗 Prerrequisitos:</strong> Ninguno (módulo inicial)</div>'
            }
            </div>`
        })
        html += '</div>'
        return html
    }

    // El Gantt ya no vive dentro de .gantt-section — ahora tiene su propio container igual que Bloom
    const ganttInnerHTML = generateGanttChart(bootcamp.modules, bootcamp.duration_weeks, moduleWeeks)

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${bootcamp.title} - Programa del Bootcamp</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px;
            min-height: 100vh;
        }
        .action-container {
            width: 100%; max-width: 1000px;
            margin-bottom: 20px;
            display: flex; justify-content: flex-end; gap: 10px;
        }
        .action-btn {
            background: white; border: 1px solid #ccc;
            padding: 10px 24px; border-radius: 30px;
            font-size: 0.9rem; cursor: pointer; transition: all 0.2s;
        }
        .action-btn:hover { background: #f0f0f0; border-color: #999; }

        .program {
            max-width: 1000px; width: 100%;
            background: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            border-radius: 16px; overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1E3A5F 0%, #2d5a8c 100%);
            padding: 40px 35px; color: white;
        }
        .header h1 { font-size: 2.2rem; margin-bottom: 10px; font-weight: 700; }
        .header h2 { font-size: 1rem; font-weight: 400; opacity: 0.9; margin-bottom: 20px; }
        .badge-container { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 15px; }
        .badge {
            background: rgba(255,255,255,0.15);
            padding: 6px 14px; border-radius: 30px;
            font-size: 0.75rem; font-weight: 500;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .date-range { display: flex; gap: 20px; margin-top: 10px; }
        .date-badge { background: rgba(255,255,255,0.2); padding: 5px 12px; border-radius: 20px; font-size: 0.7rem; }

        .stats {
            display: grid; grid-template-columns: repeat(4,1fr);
            background: #f8f8f8; padding: 20px 30px;
            border-bottom: 1px solid #e0e0e0;
        }
        .stat { text-align: center; }
        .stat-number { font-size: 2rem; font-weight: 700; color: #1E3A5F; margin-bottom: 5px; }
        .stat-label  { font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }

        .description-section { padding: 25px 30px; background: #fff; border-bottom: 1px solid #e0e0e0; }
        .description-section h3 { color: #1E3A5F; margin-bottom: 12px; font-size: 1.2rem; }
        .description-text { color: #333; line-height: 1.6; font-size: 0.9rem; }

        .modules-section { padding: 25px 30px; }
        .modules-section h3 { color: #1E3A5F; margin-bottom: 20px; font-size: 1.3rem; }
        .modules-container { display: flex; flex-direction: column; gap: 20px; }

        .module-card {
            border: 1px solid #e0e0e0; border-radius: 12px;
            padding: 20px; background: #fafafa; transition: transform 0.2s;
        }
        .module-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .module-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1E3A5F;
        }
        .module-number {
            font-size: 0.7rem; font-weight: 700; color: #1D9E75;
            background: #E1F5EE; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px;
        }
        .module-weight { font-size: 0.8rem; color: #666; background: #f0f0f0; padding: 4px 10px; border-radius: 20px; }
        .module-title { font-size: 1.2rem; font-weight: 700; color: #1E3A5F; margin-bottom: 8px; }
        .module-description { color: #555; font-size: 0.85rem; line-height: 1.5; margin-bottom: 15px; }
        .module-metrics { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 15px; }
        .metric { flex: 1; min-width: 120px; }
        .metric-label { display: block; font-size: 0.7rem; color: #888; margin-bottom: 4px; }
        .metric-value { display: block; font-size: 1rem; font-weight: 600; color: #1E3A5F; margin-bottom: 4px; }
        .progress-bar { height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; background: #1D9E75; border-radius: 3px; }
        .prerequisites {
            font-size: 0.75rem; color: #666;
            padding-top: 10px; border-top: 1px dashed #e0e0e0; margin-top: 10px;
        }
        .prerequisites strong { color: #1E3A5F; }

        ${BLOOM_CHART_STYLES}

        .footer { background: #1E3A5F; color: white; padding: 20px 30px; text-align: center; }
        .footer h3 { font-size: 1.1rem; margin-bottom: 10px; }
        .footer-info { display: flex; justify-content: center; gap: 20px; margin: 10px 0; font-size: 0.75rem; opacity: 0.8; }
        .footer small { font-size: 0.65rem; opacity: 0.6; }

        @media print {
            @page { size: letter; margin: 0.5cm; }
            body { background: white; padding: 0; margin: 0; }
            .action-container { display: none; }
            .program { max-width: 100%; box-shadow: none; border-radius: 0; }
            .module-card { break-inside: avoid; page-break-inside: avoid; }
            .badge { background: #f0f0f0; color: black; border: 1px solid #999; }
        }
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
        <div class="stat"><div class="stat-number">${bootcamp.modules.length}</div><div class="stat-label">Módulos</div></div>
        <div class="stat"><div class="stat-number">${totalHours}</div><div class="stat-label">Horas Totales</div></div>
        <div class="stat"><div class="stat-number">${bootcamp.duration_weeks}</div><div class="stat-label">Semanas</div></div>
        <div class="stat"><div class="stat-number">${hoursPerWeek}</div><div class="stat-label">Horas/Semana</div></div>
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

    ${generateBloomProgressChart(bootcamp.modules, bootcamp.duration_weeks, formattedStartDate, formattedEndDate)}

    <!-- Gantt: mismo tratamiento visual que Bloom -->
    <div class="gantt-chart-container">
        <div class="gantt-chart-header">
            <div class="gantt-chart-title">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="margin-right:8px">
                    <rect x="1" y="4" width="16" height="2" rx="1" fill="#5b8dee"/>
                    <rect x="1" y="9" width="11" height="2" rx="1" fill="#9b72e8"/>
                    <rect x="1" y="14" width="13" height="2" rx="1" fill="#3bbf8c"/>
                </svg>
                <span>Duración y distribución por módulo</span>
            </div>
            <div class="gantt-chart-subtitle">Semanas por módulo</div>
        </div>
        ${ganttInnerHTML}
    </div>

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

export async function generateAndDownloadBootcampPDF(bootcamp: BootcampData): Promise<Window | null> {
    const html = generateBootcampHTML(bootcamp)
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const printWindow = window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return printWindow
}

export function downloadBootcampAsHTML(bootcamp: BootcampData): void {
    const html = generateBootcampHTML(bootcamp)
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${bootcamp.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_bootcamp.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}