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
}

interface BootcampData {
    id: string
    title: string
    description: string
    duration_weeks: number
    modules: Module[]
    total_weight: number
    created_at: string
}

/**
 * Calcula el nivel de complejidad en texto
 */
function getComplexityLevel(complexity: number): string {
    if (complexity >= 0.8) return 'Avanzado'
    if (complexity >= 0.6) return 'Intermedio-Alto'
    if (complexity >= 0.4) return 'Intermedio'
    if (complexity >= 0.2) return 'Básico'
    return 'Introducción'
}

/**
 * Genera el HTML del bootcamp completo
 */
function generateBootcampHTML(bootcamp: BootcampData): string {
    const totalHours = bootcamp.modules.reduce((sum, m) => sum + (m.estimated_hours || 0), 0)
    const hoursPerWeek = Math.round(totalHours / bootcamp.duration_weeks)
    const createdDate = new Date(bootcamp.created_at).toLocaleDateString('es-ES')

    // Generar HTML de los módulos
    const generateModulesHTML = () => {
        let html = '<div class="modules-container">'

        bootcamp.modules.forEach((module,) => {
            const complexityText = getComplexityLevel(module.complexity)
            const complexityPercent = Math.round(module.complexity * 100)
            const weightPercent = Math.round(module.weight * 100)

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
                    ${module.weekly_hours ? `
                    <div class="metric">
                        <span class="metric-label">📅 Horas/semana</span>
                        <span class="metric-value">~${module.weekly_hours}h</span>
                    </div>
                    ` : ''}
                    <div class="metric">
                        <span class="metric-label">📚 Carga académica</span>
                        <span class="metric-value">${Math.round(module.estimated_hours / totalHours * 100)}% del total</span>
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

    // Generar tabla de distribución semanal
    const generateWeeklyDistribution = () => {
        let html = '<div class="weekly-distribution"><h3>📅 Distribución Semanal Estimada</h3><div class="weekly-grid">'

        for (let week = 1; week <= bootcamp.duration_weeks; week++) {
            // Determinar qué módulos caen en esta semana (distribución proporcional)
            let weekModules: string[] = []
            let weekHours = 0

            for (const module of bootcamp.modules) {
                const moduleWeeks = Math.max(1, Math.round(module.estimated_hours / hoursPerWeek))
                const moduleStartWeek = Math.floor((module.order - 1) * (bootcamp.duration_weeks / bootcamp.modules.length)) + 1
                if (week >= moduleStartWeek && week < moduleStartWeek + moduleWeeks) {
                    weekModules.push(module.name.split(' ').slice(0, 2).join(' '))
                    weekHours += module.estimated_hours / moduleWeeks
                }
            }

            const isCurrentWeek = week === 1
            html += `
            <div class="week-card ${isCurrentWeek ? 'current-week' : ''}">
                <div class="week-number">Semana ${week}</div>
                <div class="week-hours">${Math.round(weekHours)}h</div>
                <div class="week-topics">${weekModules.slice(0, 2).join(', ') || 'Continuación'}</div>
            </div>
            `
        }

        html += '</div></div>'
        return html
    }

    // HTML completo del bootcamp
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${bootcamp.title} - Programa del Bootcamp</title>
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
            min-height: 100vh;
        }

        .action-container {
            width: 100%;
            max-width: 1000px;
            margin-bottom: 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .action-btn {
            background: white;
            color: #1a1a1a;
            border: 1px solid #ccc;
            padding: 10px 24px;
            border-radius: 30px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }

        .action-btn:hover {
            background: #f0f0f0;
            border-color: #999;
        }

        .program {
            max-width: 1000px;
            width: 100%;
            background: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            border-radius: 16px;
            overflow: hidden;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #1E3A5F 0%, #2d5a8c 100%);
            padding: 40px 35px;
            color: white;
        }

        .header h1 {
            font-size: 2.2rem;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .header h2 {
            font-size: 1rem;
            font-weight: 400;
            opacity: 0.9;
            margin-bottom: 20px;
        }

        .badge-container {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .badge {
            background: rgba(255,255,255,0.15);
            padding: 6px 14px;
            border-radius: 30px;
            font-size: 0.75rem;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.2);
        }

        /* Stats */
        .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            background: #f8f8f8;
            padding: 20px 30px;
            border-bottom: 1px solid #e0e0e0;
        }

        .stat {
            text-align: center;
        }

        .stat-number {
            font-size: 2rem;
            font-weight: 700;
            color: #1E3A5F;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 0.7rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Description */
        .description-section {
            padding: 25px 30px;
            background: #fff;
            border-bottom: 1px solid #e0e0e0;
        }

        .description-section h3 {
            color: #1E3A5F;
            margin-bottom: 12px;
            font-size: 1.2rem;
        }

        .description-text {
            color: #333;
            line-height: 1.6;
            font-size: 0.9rem;
        }

        /* Modules */
        .modules-section {
            padding: 25px 30px;
        }

        .modules-section h3 {
            color: #1E3A5F;
            margin-bottom: 20px;
            font-size: 1.3rem;
        }

        .modules-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .module-card {
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            padding: 20px;
            background: #fafafa;
            transition: transform 0.2s;
        }

        .module-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .module-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #1E3A5F;
        }

        .module-number {
            font-size: 0.7rem;
            font-weight: 700;
            color: #1D9E75;
            background: #E1F5EE;
            padding: 4px 12px;
            border-radius: 20px;
            letter-spacing: 1px;
        }

        .module-weight {
            font-size: 0.8rem;
            color: #666;
            background: #f0f0f0;
            padding: 4px 10px;
            border-radius: 20px;
        }

        .module-title {
            font-size: 1.2rem;
            font-weight: 700;
            color: #1E3A5F;
            margin-bottom: 8px;
        }

        .module-description {
            color: #555;
            font-size: 0.85rem;
            line-height: 1.5;
            margin-bottom: 15px;
        }

        .module-metrics {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 15px;
        }

        .metric {
            flex: 1;
            min-width: 120px;
        }

        .metric-label {
            display: block;
            font-size: 0.7rem;
            color: #888;
            margin-bottom: 4px;
        }

        .metric-value {
            display: block;
            font-size: 1rem;
            font-weight: 600;
            color: #1E3A5F;
            margin-bottom: 4px;
        }

        .progress-bar {
            height: 6px;
            background: #e0e0e0;
            border-radius: 3px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: #1D9E75;
            border-radius: 3px;
        }

        .prerequisites {
            font-size: 0.75rem;
            color: #666;
            padding-top: 10px;
            border-top: 1px dashed #e0e0e0;
            margin-top: 10px;
        }

        .prerequisites strong {
            color: #1E3A5F;
        }

        /* Weekly Distribution */
        .weekly-distribution {
            padding: 25px 30px;
            background: #f8f8f8;
            border-top: 1px solid #e0e0e0;
        }

        .weekly-distribution h3 {
            color: #1E3A5F;
            margin-bottom: 20px;
            font-size: 1.2rem;
        }

        .weekly-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 12px;
        }

        .week-card {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
        }

        .week-card.current-week {
            border: 2px solid #1D9E75;
            background: #E1F5EE;
        }

        .week-number {
            font-weight: 700;
            color: #1E3A5F;
            font-size: 0.8rem;
            margin-bottom: 5px;
        }

        .week-hours {
            font-size: 0.9rem;
            font-weight: 600;
            color: #1D9E75;
        }

        .week-topics {
            font-size: 0.65rem;
            color: #888;
            margin-top: 5px;
        }

        /* Footer */
        .footer {
            background: #1E3A5F;
            color: white;
            padding: 20px 30px;
            text-align: center;
        }

        .footer h3 {
            font-size: 1.1rem;
            margin-bottom: 10px;
        }

        .footer-info {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 10px 0;
            font-size: 0.75rem;
            opacity: 0.8;
        }

        .footer small {
            font-size: 0.65rem;
            opacity: 0.6;
        }

        /* Print styles */
        @media print {
            @page {
                size: letter;
                margin: 0.5cm;
            }

            body {
                background: white;
                padding: 0;
                margin: 0;
            }

            .action-container {
                display: none;
            }

            .program {
                max-width: 100%;
                box-shadow: none;
                border-radius: 0;
            }

            .module-card {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            .weekly-grid {
                break-inside: avoid;
            }

            .progress-bar {
                border: 1px solid #ccc;
            }

            .badge {
                background: #f0f0f0;
                color: black;
                border: 1px solid #999;
            }
        }
    </style>
</head>
<body>
<div class="action-container">
    <button class="action-btn" onclick="window.print()">
        <span>🖨️</span> Guardar como PDF (Imprimir)
    </button>
</div>

<div class="program">
    <!-- HEADER -->
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
    </div>

    <!-- STATS -->
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
            <div class="stat-number">${Math.round(totalHours / bootcamp.duration_weeks)}</div>
            <div class="stat-label">Horas/Semana</div>
        </div>
    </div>

    <!-- DESCRIPTION -->
    <div class="description-section">
        <h3>📖 Sobre este Bootcamp</h3>
        <div class="description-text">
            ${bootcamp.description || `Bootcamp diseñado para formar profesionales en ${bootcamp.title}.`}
            <br><br>
            <strong>🎯 Objetivo:</strong> Al finalizar el programa, los participantes serán capaces de desarrollar soluciones completas aplicando los conocimientos adquiridos en cada módulo.
            <br><br>
            <strong>✅ Incluye:</strong> ${bootcamp.modules.length} módulos con ${totalHours} horas de formación, proyectos prácticos y certificación.
        </div>
    </div>

    <!-- MODULES -->
    <div class="modules-section">
        <h3>📋 Módulos del Programa</h3>
        ${generateModulesHTML()}
    </div>

    <!-- WEEKLY DISTRIBUTION -->
    ${generateWeeklyDistribution()}

    <!-- FOOTER -->
    <div class="footer">
        <h3>🎓 ¿Listo para comenzar tu viaje de aprendizaje?</h3>
        <div class="footer-info">
            <span>Próxima cohorte: disponible ahora</span>
            <span>Acceso inmediato al material</span>
            <span>Certificación incluida</span>
        </div>
        <small>Programa diseñado con AI Learning Graph</small><br>
        <small>${bootcamp.title} · Creado el ${createdDate}</small>
    </div>
</div>

<script>
    // Auto-print opcional
    // window.onload = function() { setTimeout(() => window.print(), 500); }
</script>
</body>
</html>`
}

/**
 * Función principal para generar y descargar el PDF del bootcamp
 */
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

/**
 * Descarga el bootcamp como archivo HTML
 */
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