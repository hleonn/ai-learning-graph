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

    const AVAILABLE_WIDTH = 774
    const PIXELS_PER_WEEK = Math.max(28, Math.floor(AVAILABLE_WIDTH / totalWeeks))

    let currentX = 0
    const positions = sortedModules.map((mod, idx) => {
        const weeks = moduleWeeks[idx]
        const width = weeks * PIXELS_PER_WEEK
        const item  = { x: currentX, width, mod, weeks, color: MODULE_COLORS[idx % MODULE_COLORS.length] }
        currentX += width
        return item
    })

    const TOTAL_SVG_WIDTH = totalWeeks * PIXELS_PER_WEEK + 20
    const SVG_HEIGHT      = positions.length * ROW_HEIGHT + 40

    let labelsHTML = ''
    positions.forEach((item, idx) => {
        const top = idx * ROW_HEIGHT + 8
        labelsHTML += `
        <div class="gantt-label" style="top:${top}px; height:${BAR_HEIGHT}px;">
            <span class="gantt-label-name" style="color:${item.color}">Módulo ${item.mod.order}</span>
            <span class="gantt-label-dur">${item.weeks} ${item.weeks === 1 ? 'semana' : 'semanas'}</span>
        </div>`
    })

    let barsHTML = ''
    positions.forEach((item, idx) => {
        const y       = idx * ROW_HEIGHT + 8
        const words   = item.mod.name.split(' ')
        const mid     = Math.ceil(words.length / 2)
        const line1   = words.length <= 3 ? words.join(' ') : words.slice(0, mid).join(' ')
        const line2   = words.length <= 3 ? '' : words.slice(mid).join(' ')

        const maxChars = Math.floor(item.width / 6.5)
        const l1 = line1.length > maxChars ? line1.slice(0, maxChars - 3) + '…' : line1
        const l2 = line2.length > maxChars ? line2.slice(0, maxChars - 3) + '…' : line2

        const textY  = y + BAR_HEIGHT / 2 + 4
        const line1Y = l2 ? textY - 7 : textY
        const line2Y = textY + 7

        const fontSize = PIXELS_PER_WEEK >= 60 ? 9.5 : PIXELS_PER_WEEK >= 40 ? 8.5 : 7.5

        barsHTML += `
        <rect x="${item.x}" y="${y}" width="${item.width - 4}" height="${BAR_HEIGHT}"
              rx="6" fill="${item.color}15" stroke="${item.color}" stroke-width="1.5"/>
        <text x="${item.x + 8}" y="${line1Y}"
              font-family="DM Sans,sans-serif" font-size="${fontSize}" fill="#1a1f36" font-weight="600">${l1}</text>
        ${l2 ? `<text x="${item.x + 8}" y="${line2Y}"
              font-family="DM Sans,sans-serif" font-size="${fontSize}" fill="#1a1f36" font-weight="600">${l2}</text>` : ''}`
    })

    let gridHTML = '', xAxisHTML = ''
    const labelEvery = totalWeeks <= 12 ? 1 : totalWeeks <= 20 ? 2 : 4

    for (let i = 0; i <= totalWeeks; i++) {
        const x = i * PIXELS_PER_WEEK
        gridHTML += `<line x1="${x}" y1="0" x2="${x}" y2="${positions.length * ROW_HEIGHT}"
                           stroke="#e8edf5" stroke-width="1"/>`
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
    const totalVH     = viewBoxH + marginTop

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
    const labelEvery = totalWeeks <= 12 ? 1 : 2

    for (let i = 0; i <= totalWeeks; i++) {
        const x = 40 + (i / totalWeeks) * (svgWidth - 80)
        if (i % labelEvery === 0 || i === totalWeeks) {
            xAxisHTML += `<text x="${x}" y="${chartBottom + 25}">${i}</text>`
        }
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

// ========== CERTIFICATE PAGE ==========
function generateCertificatePage(bootcamp: BootcampData, formattedStartDate: string, formattedEndDate: string): string {
    const sortedModules = [...bootcamp.modules].sort((a, b) => a.order - b.order)
    const n = sortedModules.length

    // ── Radar palette: one distinct color per module axis, scales to N modules ──
    const RADAR_COLORS = [
        { stroke: '#2a7a3b', fill: '#2a7a3b' }, // green
        { stroke: '#c0392b', fill: '#c0392b' }, // red
        { stroke: '#1a3a8f', fill: '#1a3a8f' }, // blue
        { stroke: '#b8860b', fill: '#b8860b' }, // amber
        { stroke: '#6a1f8a', fill: '#6a1f8a' }, // purple
        { stroke: '#0e6b8a', fill: '#0e6b8a' }, // teal
        { stroke: '#b05030', fill: '#b05030' }, // coral
    ]

    // SVG canvas — extra margin for labels (340×340)
    const cx = 170, cy = 170, rMax = 118

    // N axes starting at 12 o'clock, evenly distributed
    const anglesDeg = Array.from({ length: n }, (_, i) => -90 + (360 / n) * i)
    const anglesRad = anglesDeg.map(d => d * Math.PI / 180)

    // Grid rings (5 concentric, dashed inner, solid outer)
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0]
    const gridPolygons = gridLevels.map(lvl => {
        const pts = anglesRad.map(a =>
            `${(cx + rMax * lvl * Math.cos(a)).toFixed(2)},${(cy + rMax * lvl * Math.sin(a)).toFixed(2)}`
        ).join(' ')
        return `<polygon points="${pts}" fill="none" stroke="#cccccc" stroke-width="${lvl === 1.0 ? 1.4 : 0.8}" ${lvl < 1.0 ? 'stroke-dasharray="4,3"' : ''}/>`
    }).join('')

    // Axis lines (thin dashed)
    const axisLines = anglesRad.map(a => {
        const x2 = (cx + rMax * Math.cos(a)).toFixed(2)
        const y2 = (cy + rMax * Math.sin(a)).toFixed(2)
        return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#cccccc" stroke-width="0.8" stroke-dasharray="3,3"/>`
    }).join('')

    // Data values from module complexity (clamped 0.3–1.0 for visual minimum)
    const dataValues = sortedModules.map(m => Math.min(Math.max(m.complexity, 0.3), 1.0))

    // ── Sector polygons: each module owns one "pie slice" colored region ──
    // Each sector goes: center → arc along data value from axis i to axis i+1
    const sectorPolygons = anglesRad.map((a, i) => {
        const nextIdx = (i + 1) % n
        const nextA   = anglesRad[nextIdx]
        const r       = rMax * dataValues[i]
        const rNext   = rMax * dataValues[nextIdx]
        const color   = RADAR_COLORS[i % RADAR_COLORS.length]

        // Sweep arc from axis i to axis i+1 in small steps for smooth curve
        const STEPS = 10
        let arcPts = ''
        for (let s = 0; s <= STEPS; s++) {
            const t   = s / STEPS
            // Angle interpolation — handle wrap-around correctly
            let da = nextA - a
            if (n > 2 && da > Math.PI)  da -= 2 * Math.PI
            if (n > 2 && da < -Math.PI) da += 2 * Math.PI
            const ang = a + t * da
            const rr  = r + t * (rNext - r)
            arcPts += `${(cx + rr * Math.cos(ang)).toFixed(2)},${(cy + rr * Math.sin(ang)).toFixed(2)} `
        }

        const pts = `${cx},${cy} ${arcPts}`
        return `<polygon points="${pts}" fill="${color.fill}" fill-opacity="0.18" stroke="${color.stroke}" stroke-width="2" stroke-linejoin="round"/>`
    }).join('')

    // Thin black connecting outline on top of sectors
    const outlinePoints = anglesRad.map((a, i) => {
        const r = rMax * dataValues[i]
        return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
    }).join(' ')

    // Colored dots at each axis vertex
    const dotsSVG = anglesRad.map((a, i) => {
        const r     = rMax * dataValues[i]
        const dx    = (cx + r * Math.cos(a)).toFixed(2)
        const dy    = (cy + r * Math.sin(a)).toFixed(2)
        const color = RADAR_COLORS[i % RADAR_COLORS.length]
        return `<circle cx="${dx}" cy="${dy}" r="4.5" fill="white" stroke="${color.stroke}" stroke-width="2.2"/>`
    }).join('')

    // ── Dynamic axis labels — computed from module names, N-aware ──
    const axisLabelsSVG = anglesRad.map((a, i) => {
        const LABEL_R = rMax + 22
        const lx = cx + LABEL_R * Math.cos(a)
        const ly = cy + LABEL_R * Math.sin(a)

        // Text anchor based on horizontal position
        let anchor = 'middle'
        if (lx < cx - 8) anchor = 'end'
        else if (lx > cx + 8) anchor = 'start'

        // Short label from module name (first 2 significant words, max 18 chars)
        const words = sortedModules[i].name.split(' ')
        const sig   = words.filter(w => w.length > 3 && !['para','con','los','las','del','por','una','que'].includes(w.toLowerCase()))
        const label = (sig.slice(0, 2).join(' ') || `M${sortedModules[i].order}`).substring(0, 18)
        const color = RADAR_COLORS[i % RADAR_COLORS.length]

        // Two-line if label > 10 chars
        if (label.length > 10) {
            const mid  = label.lastIndexOf(' ', 10)
            const cut  = mid > 0 ? mid : 9
            const l1   = label.substring(0, cut)
            const l2   = label.substring(cut).trim()
            const yOff = anchor === 'middle' ? (Math.sin(a) < 0 ? -8 : 4) : 0
            return `<text text-anchor="${anchor}" font-family="DM Sans,sans-serif" font-size="9" font-weight="700" fill="${color.stroke}">
                <tspan x="${lx.toFixed(2)}" y="${(ly + yOff).toFixed(2)}">${l1}</tspan>
                <tspan x="${lx.toFixed(2)}" dy="11">${l2}</tspan>
            </text>`
        }
        return `<text x="${lx.toFixed(2)}" y="${(ly + 4).toFixed(2)}" text-anchor="${anchor}" font-family="DM Sans,sans-serif" font-size="9" font-weight="700" fill="${color.stroke}">${label}</text>`
    }).join('')

    // ── Dynamic metric rows — derived from modules (not hardcoded) ──
    const competencyLabels: string[] = sortedModules.map(mod => {
        const words    = mod.name.split(' ')
        const filtered = words.filter(w => w.length > 3 && !['para','con','los','las','del','por'].includes(w.toLowerCase()))
        return (filtered.slice(0, 3).join(' ') || `Módulo ${mod.order}`).substring(0, 30)
    })

    const competencyScores: number[] = sortedModules.map(m => Math.round(70 + m.complexity * 30))
    const avgScore = Math.round(competencyScores.reduce((a, b) => a + b, 0) / competencyScores.length)

    const metricRows = sortedModules.map((mod, i) => {
        const score = competencyScores[i]
        const level = score >= 90 ? 'Excelente' : score >= 85 ? 'Destacado' : 'Aprobado'
        const color = RADAR_COLORS[i % RADAR_COLORS.length]
        return `
        <tr>
            <td style="padding:9px 12px 9px 0; border-bottom:1px solid #f0f0f0; vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:7px;">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color.stroke};flex-shrink:0;"></span>
                    <div>
                        <div style="font-size:12px; font-weight:600; color:#1a1a1a;">M${mod.order} · ${mod.name}</div>
                        <div style="font-size:10px; color:#888; margin-top:1px;">${competencyLabels[i]}</div>
                    </div>
                </div>
            </td>
            <td style="padding:9px 8px; border-bottom:1px solid #f0f0f0; vertical-align:middle; width:120px;">
                <div style="height:5px; background:#efefef; border-radius:3px; overflow:hidden;">
                    <div style="width:${score}%; height:100%; background:${color.stroke}; border-radius:3px;"></div>
                </div>
            </td>
            <td style="padding:9px 0 9px 8px; border-bottom:1px solid #f0f0f0; vertical-align:middle; text-align:right; white-space:nowrap;">
                <span style="font-size:12px; font-weight:700; font-family:'DM Mono',monospace; color:#1a1a1a;">${score}/100</span>
                <span style="font-size:10px; color:#999; margin-left:5px;">${level}</span>
            </td>
        </tr>`
    }).join('')

    // Alias for radar SVG inline use
    const radarSVG = `
        ${gridPolygons}
        ${axisLines}
        ${sectorPolygons}
        <polygon points="${outlinePoints}" fill="none" stroke="#333333" stroke-width="1.2" stroke-linejoin="round" stroke-dasharray="3,2" opacity="0.5"/>
        ${dotsSVG}
        ${axisLabelsSVG}
    `

    return `
    <!-- ═══════════ CERTIFICATE PAGE ═══════════ -->
    <div class="certificate-page">

        <!-- Page header -->
        <div class="cert-page-header">
            <div class="cert-page-header-left">
                <div class="cert-page-eyebrow">Certificación de competencias</div>
                <div class="cert-page-title">${bootcamp.title}</div>
                <div class="cert-page-subtitle">Programa ejecutivo de formación intensiva</div>
                <div class="cert-page-dates">
                    <span><strong>Inicio:</strong> ${formattedStartDate}</span>
                    <span><strong>Fin:</strong> ${formattedEndDate}</span>
                    <span><strong>Duración:</strong> ${bootcamp.duration_weeks} semanas</span>
                </div>
            </div>
            <div class="cert-page-seal">
                <div class="cert-seal-outer">
                    <div class="cert-seal-inner">
                        <div class="cert-seal-score">${avgScore}</div>
                        <div class="cert-seal-label">promedio</div>
                    </div>
                </div>
                <div style="font-size:10px; color:#888; margin-top:6px; text-align:center;">Puntuación global</div>
            </div>
        </div>

        <!-- Body: metrics + radar -->
        <div class="cert-page-body">

            <!-- Left: metrics table -->
            <div class="cert-metrics-col">
                <div class="cert-col-label">Métricas de desempeño</div>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="font-size:10px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px; padding:0 12px 10px 0; border-bottom:2px solid #e0e0e0; text-align:left;">Módulo</th>
                            <th style="font-size:10px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px; padding:0 8px 10px; border-bottom:2px solid #e0e0e0; text-align:left; width:120px;">Progreso</th>
                            <th style="font-size:10px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px; padding:0 0 10px 8px; border-bottom:2px solid #e0e0e0; text-align:right;">Resultado</th>
                        </tr>
                    </thead>
                    <tbody>${metricRows}</tbody>
                </table>

                <div class="cert-validated-badge">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="6" stroke="#1a1a1a" stroke-width="1.2"/>
                        <path d="M4.5 7l2 2 3-3.5" stroke="#1a1a1a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Competencias validadas
                </div>
            </div>

            <!-- Right: radar + level -->
            <div class="cert-radar-col">
                <div class="cert-col-label">Radar de competencias</div>
                <svg viewBox="0 0 340 340" width="100%" style="max-width:280px; display:block; margin:0 auto;" xmlns="http://www.w3.org/2000/svg">
                    ${radarSVG}
                </svg>

                <div class="cert-level-card">
                    <div class="cert-level-eyebrow">Nivel de certificación</div>
                    <div class="cert-level-name">${bootcamp.title.toLowerCase().includes('análisis') || bootcamp.title.toLowerCase().includes('analisis') ? 'Analista de datos competente' : 'Profesional certificado'}</div>
                    <div class="cert-level-org">Avalado por AI Learning Graph</div>
                </div>
            </div>
        </div>

        <!-- Signatures -->
        <div class="cert-sigs">
            <div class="cert-sig-block">
                <div class="cert-sig-line"></div>
                <div class="cert-sig-name">Firma del instructor</div>
                <div class="cert-sig-role">AI Learning Graph</div>
            </div>
            <div class="cert-sig-block">
                <div class="cert-qr-box">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#bbb" stroke-width="2">
                        <rect x="4" y="4" width="13" height="13" rx="1"/>
                        <rect x="23" y="4" width="13" height="13" rx="1"/>
                        <rect x="4" y="23" width="13" height="13" rx="1"/>
                        <rect x="7" y="7" width="7" height="7" fill="#bbb" stroke="none"/>
                        <rect x="26" y="7" width="7" height="7" fill="#bbb" stroke="none"/>
                        <rect x="7" y="26" width="7" height="7" fill="#bbb" stroke="none"/>
                        <rect x="23" y="23" width="4" height="4" fill="#bbb" stroke="none"/>
                        <rect x="29" y="23" width="4" height="4" fill="#bbb" stroke="none"/>
                        <rect x="23" y="29" width="4" height="4" fill="#bbb" stroke="none"/>
                        <rect x="33" y="33" width="4" height="4" fill="#bbb" stroke="none"/>
                    </svg>
                </div>
                <div class="cert-sig-name">Sello de validación</div>
                <div class="cert-sig-role">Código QR de verificación</div>
            </div>
            <div class="cert-sig-block">
                <div class="cert-sig-line"></div>
                <div class="cert-sig-name">Firma del validador</div>
                <div class="cert-sig-role">Validación automatizada</div>
            </div>
        </div>

        <!-- Methodology -->
        <div class="cert-methodology">
            <div class="cert-method-icon">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1a1a1a" stroke-width="1.4">
                    <circle cx="9" cy="8" r="4.5"/>
                    <path d="M5.5 14.5C5.5 12 12.5 12 12.5 14.5" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="cert-method-text">
                <div class="cert-method-title">Metodología de aprendizaje profundo (Dybdelæring)</div>
                <div class="cert-method-body">
                    Este programa aplica los principios del <strong>aprendizaje profundo noruego</strong> y la <strong>Taxonomía de Bloom</strong> para garantizar una progresión cognitiva verificable. Las métricas reflejan el dominio real de competencias profesionales, no solo la finalización de contenidos.
                </div>
            </div>
        </div>

    </div>`
}

// ========== CSS ==========
const BLOOM_CHART_STYLES = `
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

/* ── Certificate Page ─────────────────────────────────── */
.certificate-page {
    margin: 0 30px 0 30px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 16px;
    overflow: hidden;
    page-break-before: always;
    break-before: page;
}

.cert-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 30px 36px 24px;
    border-bottom: 2px solid #e8e8e8;
}
.cert-page-header-left { display: flex; flex-direction: column; gap: 5px; }
.cert-page-eyebrow {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #999;
}
.cert-page-title {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.3px;
}
.cert-page-subtitle {
    font-size: 13px;
    color: #666;
}
.cert-page-dates {
    display: flex;
    gap: 24px;
    margin-top: 6px;
    font-size: 12px;
    color: #555;
}
.cert-page-dates strong { color: #1a1a1a; font-weight: 600; }

.cert-seal-outer {
    width: 76px; height: 76px;
    border-radius: 50%;
    border: 2px solid #1a1a1a;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.cert-seal-inner {
    width: 62px; height: 62px;
    border-radius: 50%;
    border: 1px solid #e0e0e0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
}
.cert-seal-score { font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1; }
.cert-seal-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }

.cert-page-body {
    display: grid;
    grid-template-columns: 1fr 260px;
    border-bottom: 2px solid #e8e8e8;
}

.cert-metrics-col {
    padding: 24px 28px 24px 36px;
    border-right: 1px solid #e8e8e8;
}
.cert-radar-col {
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
}

.cert-col-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #999;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.cert-col-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e8e8e8;
}

.cert-validated-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 18px;
    padding: 8px 18px;
    border: 1.5px solid #1a1a1a;
    border-radius: 30px;
    font-size: 12px;
    font-weight: 700;
    color: #1a1a1a;
    background: white;
    letter-spacing: 0.2px;
}

.cert-level-card {
    width: 100%;
    border: 1.5px solid #1a1a1a;
    border-radius: 12px;
    padding: 14px 16px;
    text-align: center;
}
.cert-level-eyebrow {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #999;
    margin-bottom: 4px;
}
.cert-level-name {
    font-size: 14px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.3;
}
.cert-level-org {
    font-size: 10px;
    color: #888;
    margin-top: 3px;
}

.cert-sigs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-bottom: 2px solid #e8e8e8;
}
.cert-sig-block {
    padding: 22px 20px;
    text-align: center;
    border-right: 1px solid #e8e8e8;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}
.cert-sig-block:last-child { border-right: none; }
.cert-sig-line { width: 72%; height: 1px; background: #bbb; }
.cert-sig-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
.cert-sig-role { font-size: 11px; color: #888; }
.cert-qr-box {
    width: 64px; height: 64px;
    border: 1.5px dashed #ccc;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
}

.cert-methodology {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 20px 36px;
    background: #fafafa;
}
.cert-method-icon {
    width: 36px; height: 36px;
    background: #1a1a1a;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.cert-method-icon svg { stroke: white; }
.cert-method-title {
    font-size: 13px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
}
.cert-method-body {
    font-size: 11px;
    color: #666;
    line-height: 1.6;
}

@media print {
    .bloom-chart-container,
    .gantt-chart-container,
    .certificate-page {
        box-shadow: none;
        border: 1px solid #ccc;
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .certificate-page {
        break-before: page;
        page-break-before: always;
        margin: 0;
        border-radius: 0;
        border-left: none;
        border-right: none;
    }
}
`

function generateBootcampHTML(bootcamp: BootcampData): string {
    const totalHours   = bootcamp.modules.reduce((sum, m) => sum + (m.estimated_hours || 0), 0)
    const hoursPerWeek = Math.round(totalHours / bootcamp.duration_weeks)
    const createdDate  = formatDateUTC(normalizeDate(bootcamp.created_at))

    const savedStartDate = typeof localStorage !== 'undefined' ? localStorage.getItem('bootcamp_calendar_start_date') : null

    const startDate = savedStartDate
        ? normalizeDate(savedStartDate)
        : bootcamp.start_date
            ? normalizeDate(bootcamp.start_date)
            : getDefaultStartDate()

    const endDate = bootcamp.end_date
        ? normalizeDate(bootcamp.end_date)
        : calculateEndDate(startDate, bootcamp.duration_weeks)

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

    const ganttInnerHTML = generateGanttChart(bootcamp.modules, bootcamp.duration_weeks, moduleWeeks)
    const certificateHTML = generateCertificatePage(bootcamp, formattedStartDate, formattedEndDate)

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
            background: #ffffff;
            padding: 40px 35px; 
            color: #1a1f36;
            display: flex;
            align-items: flex-start;
            gap: 24px;
            border-bottom: 1px solid #e0e0e0;
        }
        .header-logo {
            width: 100px; height: 100px;
            border-radius: 16px;
            background: white;
            padding: 8px;
            flex-shrink: 0;
        }
        .header-logo img { width: 100%; height: 100%; object-fit: contain; }
        .header-content { flex: 1; }
        .header h1 { color: #1a1f36; font-size: 2.2rem; margin-bottom: 10px; font-weight: 700; }
        .header h2 { color: #555; font-size: 1rem; font-weight: 400; opacity: 0.9; margin-bottom: 14px; }
        .badge-container { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .badge {
            background: #f0f0f0; padding: 5px 12px; border-radius: 30px;
            font-size: 0.7rem; font-weight: 500; border: 1px solid #d4d4d4; color: #1a1f36;
        }
        .date-range { display: flex; gap: 16px; margin-top: 6px; }
        .date-badge { 
            background: #f0f0f0; padding: 4px 10px; border-radius: 20px; 
            font-size: 0.7rem; color: #1a1f36; border: 1px solid #d4d4d4;
        }

        .stats {
            display: grid; grid-template-columns: repeat(4,1fr);
            background: #f8f8f8; padding: 20px 30px; border-bottom: 1px solid #e0e0e0;
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

        .footer { 
            background: #ffffff; color: #1a1f36; padding: 20px 30px; 
            text-align: center; border-top: 1px solid #e0e0e0;
            margin-top: 24px;
        }
        .footer h3 { color: #1a1f36; font-size: 1.1rem; margin-bottom: 10px; }
        .footer-info { color: #555; display: flex; justify-content: center; gap: 20px; margin: 10px 0; font-size: 0.75rem; opacity: 0.8; }
        .footer small { color: #888; font-size: 0.65rem; opacity: 0.6; }

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
        <div class="header-logo">
            <img src="https://ai-learning-graph.vercel.app/logo.png" alt="Logo" />
        </div>
        <div class="header-content">
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

    ${certificateHTML}

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