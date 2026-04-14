// src/utils/generateProgramPDF.ts

interface Subtopic {
    label: string
    description: string
    difficulty: number
    prerequisites: string[]
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

// Función auxiliar para obtener el nivel de dificultad (CORREGIDA)
function getDifficultyLevel(difficultyLevel: string): string {
    const levelMap: Record<string, string> = {
        'beginner': 'Principiante',
        'intermediate': 'Intermedio',
        'advanced': 'Avanzado',
        'expert': 'Experto'
    }
    return levelMap[difficultyLevel] || 'Intermedio'
}

// Función para generar el HTML del programa (CORREGIDA - añadido difficultyLevel)
function generateProgramHTML(roadmap: RoadmapData, courseTitle: string, courseDescription: string, difficultyLevel: string): string {
    // Calcular estadísticas
    const totalPhases = roadmap.phases.length
    let totalConcepts = 0
    for (const phase of roadmap.phases) {
        for (const topic of phase.topics) {
            totalConcepts += topic.subtopics.length
        }
    }

    // Generar HTML de las fases en formato "metro roadmap"
    const generatePhasesHTML = () => {
        let html = `
        <div class="metro-roadmap">
            <div class="metro-line">
        `

        roadmap.phases.forEach((phase) => {
            html += `
                <div class="metro-station">
                    <div class="station-dot">${phase.phase_number}</div>
                    <div class="station-name">Fase ${phase.phase_number}</div>
                    <div class="station-week">${phase.months} meses</div>
                </div>
            `
        })

        html += `
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
        `

        // Generar tarjetas de cada fase
        roadmap.phases.forEach((phase) => {
            html += `
            <div class="route-card">
                <div class="route-header">
                    <div class="route-phase">FASE ${phase.phase_number}</div>
                    <div class="route-title">${phase.name}</div>
                </div>
                <div class="route-content">
                    <div class="bloom-levels">
                        ${phase.bloom_levels.map(level => `<span class="bloom-tag">${level}</span>`).join('')}
                    </div>
                    <p class="phase-objective">🎯 ${phase.objective}</p>
                    
                    <div class="phase-details">
                        <div class="detail-column">
                            <strong>Resultados esperados:</strong>
                            <ul>
                                ${phase.expected_outcomes.map(outcome => `<li>${outcome}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="detail-column">
                            <strong>Skills adquiridas:</strong>
                            <ul>
                                ${phase.skills.map(skill => `<li>${skill}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="detail-column">
                            <strong>Tech stack:</strong>
                            <ul>
                                ${phase.tech_stack.map(tech => `<li>${tech}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                    
                    <div class="topics-section">
                        <strong>Contenido:</strong>
                        ${phase.topics.map(topic => `
                            <div class="topic-item">
                                <div class="topic-name">📘 ${topic.topic_name}</div>
                                <div class="subtopics-list">
                                    ${topic.subtopics.map(subtopic => `
                                        <div class="subtopic-item">
                                            <span class="subtopic-label">${subtopic.label}</span>
                                            <span class="subtopic-desc">${subtopic.description}</span>
                                            ${subtopic.prerequisites.length > 0 ?
                `<span class="prereq-badge">Prerreq: ${subtopic.prerequisites.join(', ')}</span>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            `
        })

        html += `
            </div>
        </div>
        `

        return html
    }

    // HTML completo del programa
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${courseTitle} - Programa del Curso</title>
    <style>
        /* ===== ESTILOS BASE ===== */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px;
            min-height: 100vh;
        }

        /* Botón de descarga */
        .action-container {
            width: 100%;
            max-width: 900px;
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
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: all 0.2s ease;
        }

        .action-btn:hover {
            background: #f0f0f0;
            border-color: #999;
        }

        /* Contenedor principal */
        .program {
            max-width: 900px;
            width: 100%;
            background: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            border-radius: 16px;
            overflow: hidden;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            padding: 30px 30px 25px;
            color: white;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: -30px;
            right: -30px;
            width: 200px;
            height: 200px;
            background: linear-gradient(135deg, #306998, #FFD43B);
            opacity: 0.15;
            border-radius: 50%;
        }

        .header h1 {
            font-size: 2rem;
            margin-bottom: 5px;
            font-weight: 700;
            line-height: 1.2;
        }

        .header h2 {
            font-size: 1rem;
            font-weight: 400;
            opacity: 0.85;
            margin-bottom: 20px;
        }

        .badge-container {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .badge {
            display: inline-block;
            background: rgba(255,255,255,0.15);
            padding: 4px 12px;
            border-radius: 30px;
            font-size: 0.7rem;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.2);
        }

        /* Stats */
        .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            background: #f8f8f8;
            padding: 15px 25px;
            border-bottom: 1px solid #e0e0e0;
        }

        .stat {
            text-align: center;
        }

        .stat-number {
            font-size: 1.8rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 3px;
        }

        .stat-label {
            font-size: 0.65rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            font-weight: 500;
        }

        /* Content */
        .content {
            padding: 25px 30px;
        }

        /* Metro Roadmap */
        .metro-roadmap {
            margin: 15px 0;
            background: #f8f8f8;
            border-radius: 12px;
            padding: 15px;
            border: 1px solid #e0e0e0;
        }

        .metro-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            position: relative;
        }

        .metro-line::before {
            content: '';
            position: absolute;
            top: 20px;
            left: 25px;
            right: 25px;
            height: 3px;
            background: #1a1a1a;
            z-index: 1;
        }

        .metro-station {
            position: relative;
            z-index: 2;
            text-align: center;
            flex: 1;
        }

        .station-dot {
            width: 40px;
            height: 40px;
            background: #1a1a1a;
            border: 3px solid white;
            border-radius: 50%;
            margin: 0 auto 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 1rem;
        }

        .station-name {
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 2px;
            font-size: 0.75rem;
        }

        .station-week {
            font-size: 0.6rem;
            color: #666;
        }

        /* Route Cards */
        .route-card {
            background: white;
            border-radius: 8px;
            padding: 12px;
            border: 1px solid #e0e0e0;
            position: relative;
            overflow: hidden;
            margin-bottom: 12px;
        }

        .route-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: #1a1a1a;
        }

        .route-header {
            margin-bottom: 8px;
            padding-left: 8px;
        }

        .route-phase {
            font-size: 0.65rem;
            color: #666;
            letter-spacing: 1px;
            margin-bottom: 2px;
        }

        .route-title {
            font-size: 1rem;
            font-weight: 700;
            color: #1a1a1a;
        }

        .route-content {
            padding-left: 8px;
        }

        .bloom-levels {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-bottom: 10px;
        }

        .bloom-tag {
            background: #e8e6e1;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.6rem;
            font-weight: 600;
            color: #1a1a1a;
        }

        .phase-objective {
            font-size: 0.8rem;
            color: #444;
            margin-bottom: 12px;
            line-height: 1.4;
            padding: 8px;
            background: #f0f0f0;
            border-radius: 6px;
        }

        .phase-details {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }

        .detail-column {
            font-size: 0.7rem;
        }

        .detail-column strong {
            display: block;
            margin-bottom: 6px;
            color: #1a1a1a;
        }

        .detail-column ul {
            list-style: none;
            padding-left: 0;
        }

        .detail-column li {
            margin-bottom: 3px;
            padding-left: 14px;
            position: relative;
            color: #555;
        }

        .detail-column li::before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #1a1a1a;
            font-size: 0.7rem;
        }

        .topics-section {
            margin-top: 12px;
            border-top: 1px solid #e0e0e0;
            padding-top: 12px;
        }

        .topics-section > strong {
            display: block;
            margin-bottom: 8px;
            font-size: 0.75rem;
            color: #1a1a1a;
        }

        .topic-item {
            margin-bottom: 12px;
            background: #fafafa;
            border-radius: 6px;
            padding: 8px;
        }

        .topic-name {
            font-weight: 600;
            font-size: 0.75rem;
            color: #1a1a1a;
            margin-bottom: 6px;
        }

        .subtopics-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .subtopic-item {
            padding: 6px;
            background: white;
            border-radius: 4px;
            border: 1px solid #eee;
        }

        .subtopic-label {
            font-weight: 600;
            font-size: 0.7rem;
            color: #1a1a1a;
            display: block;
            margin-bottom: 2px;
        }

        .subtopic-desc {
            font-size: 0.65rem;
            color: #666;
            display: block;
            margin-bottom: 4px;
        }

        .prereq-badge {
            display: inline-block;
            background: #e1f5ee;
            color: #1d9e75;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.55rem;
            font-weight: 500;
        }

        /* Footer */
        .footer {
            background: #f0f0f0;
            padding: 15px 25px;
            text-align: center;
            border-top: 1px solid #ccc;
        }

        .footer h3 {
            font-size: 1.2rem;
            color: #1a1a1a;
            margin-bottom: 8px;
        }

        .footer-info {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 8px 0;
            color: #444;
            font-size: 0.75rem;
        }

        .footer small {
            color: #666;
            font-size: 0.6rem;
        }

        /* Page break */
        .page-break-before {
            page-break-before: always;
        }

        /* ===== ESTILOS PARA IMPRESIÓN (CORREGIDOS - menos espacios) ===== */
        @media print {
            @page {
                size: letter;
                margin: 0.4cm;
            }

            body {
                background: white;
                padding: 0;
                margin: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .action-container {
                display: none;
            }

            .program {
                max-width: 100%;
                box-shadow: none;
                border-radius: 0;
                margin: 0;
            }

            .header {
                background: white;
                color: black;
                border-bottom: 2px solid black;
                padding: 10px 15px !important;
            }

            .header::before {
                display: none;
            }

            .header h1 {
                font-size: 1.4rem !important;
                margin-bottom: 2px !important;
            }

            .header h2 {
                font-size: 0.8rem !important;
                margin-bottom: 8px !important;
            }

            .badge-container {
                gap: 6px;
            }

            .badge {
                background: #f0f0f0;
                color: black;
                border: 1px solid #999;
                font-size: 0.6rem !important;
                padding: 2px 8px !important;
            }

            .stats {
                background: white;
                border-bottom: 1px solid black;
                padding: 6px 15px !important;
            }

            .stat-number {
                font-size: 1.2rem !important;
            }

            .stat-label {
                font-size: 0.55rem !important;
            }

            .content {
                padding: 10px 15px !important;
            }

            .metro-roadmap {
                margin: 8px 0 !important;
                padding: 10px !important;
            }

            .metro-line {
                margin-bottom: 10px !important;
            }

            .metro-line::before {
                top: 15px !important;
                height: 2px !important;
            }

            .station-dot {
                width: 28px !important;
                height: 28px !important;
                font-size: 0.8rem !important;
            }

            .station-name {
                font-size: 0.6rem !important;
            }

            .station-week {
                font-size: 0.5rem !important;
            }

            .route-card {
                padding: 8px !important;
                margin-bottom: 8px !important;
            }

            .route-card::before {
                width: 3px !important;
            }

            .route-phase {
                font-size: 0.55rem !important;
            }

            .route-title {
                font-size: 0.8rem !important;
            }

            .bloom-tag {
                font-size: 0.5rem !important;
                padding: 1px 6px !important;
            }

            .phase-objective {
                font-size: 0.65rem !important;
                padding: 4px 6px !important;
                margin-bottom: 6px !important;
            }

            .phase-details {
                gap: 8px !important;
                margin-bottom: 8px !important;
            }

            .detail-column {
                font-size: 0.6rem !important;
            }

            .detail-column li {
                font-size: 0.55rem !important;
                margin-bottom: 1px !important;
            }

            .topics-section {
                margin-top: 6px !important;
                padding-top: 6px !important;
            }

            .topic-item {
                margin-bottom: 6px !important;
                padding: 4px !important;
            }

            .topic-name {
                font-size: 0.65rem !important;
                margin-bottom: 3px !important;
            }

            .subtopic-label {
                font-size: 0.6rem !important;
            }

            .subtopic-desc {
                font-size: 0.55rem !important;
            }

            .prereq-badge {
                font-size: 0.5rem !important;
                padding: 1px 4px !important;
            }

            .footer {
                padding: 8px 15px !important;
            }

            .footer h3 {
                font-size: 0.9rem !important;
                margin-bottom: 4px !important;
            }

            .footer-info {
                gap: 8px !important;
                margin: 4px 0 !important;
                font-size: 0.6rem !important;
            }

            .footer small {
                font-size: 0.5rem !important;
            }

            .route-card,
            .metro-roadmap {
                page-break-inside: avoid;
            }
        }

        /* Responsive */
        @media (max-width: 700px) {
            .phase-details {
                grid-template-columns: 1fr;
            }
            
            .stats {
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
            }
            
            .metro-line {
                flex-direction: column;
                gap: 10px;
            }
            
            .metro-line::before {
                display: none;
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

<div class="program" id="program-content">
    <!-- HEADER -->
    <div class="header">
        <h1>${courseTitle}</h1>
        <h2>${courseDescription || 'Programa de aprendizaje estructurado por fases'}</h2>
        <div class="badge-container">
            <span class="badge">${roadmap.duration_months} Meses · Part-Time</span>
            <span class="badge">Nivel: ${getDifficultyLevel(difficultyLevel)}</span>
            <span class="badge">${totalPhases} Fases · ${totalConcepts} Conceptos</span>
            <span class="badge">AI-Augmented Learning</span>
        </div>
    </div>

    <!-- STATS -->
    <div class="stats">
        <div class="stat">
            <div class="stat-number">${totalPhases}</div>
            <div class="stat-label">Fases de Aprendizaje</div>
        </div>
        <div class="stat">
            <div class="stat-number">${totalConcepts}</div>
            <div class="stat-label">Conceptos Clave</div>
        </div>
        <div class="stat">
            <div class="stat-number">100%</div>
            <div class="stat-label">Contenido Generado por IA</div>
        </div>
        <div class="stat">
            <div class="stat-number">24/7</div>
            <div class="stat-label">Acceso al Material</div>
        </div>
    </div>

    <!-- CONTENT -->
    <div class="content">
        ${generatePhasesHTML()}
    </div>

    <!-- FOOTER -->
    <div class="footer">
        <h3>¿Listo para comenzar tu viaje de aprendizaje?</h3>
        <div class="footer-info">
            <span>Próxima cohorte: disponible ahora</span>
            <span>Acceso inmediato al material</span>
            <span>Soporte incluido</span>
        </div>
        <small>Programa diseñado con AI Learning Graph</small><br>
        <small style="margin-top: 5px; display: block;">${courseTitle} · Programa generado automáticamente</small>
    </div>
</div>

<script>
    // Auto-print opcional (descomentar para impresión automática)
    // window.onload = function() { setTimeout(() => window.print(), 500); }
</script>
</body>
</html>`
}

// Función principal para generar y descargar el PDF (CORREGIDA - añadido difficultyLevel)
export async function generateAndDownloadPDF(roadmap: RoadmapData, courseTitle: string, courseDescription: string, difficultyLevel: string) {
    const html = generateProgramHTML(roadmap, courseTitle, courseDescription, difficultyLevel)

    // Crear un blob con el HTML
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    // Abrir en una nueva ventana para que el usuario pueda imprimir/guardar como PDF
    const printWindow = window.open(url, '_blank')

    // Limpiar la URL después de un tiempo
    setTimeout(() => {
        URL.revokeObjectURL(url)
    }, 1000)

    return printWindow
}

// Función para descargar directamente como archivo HTML (CORREGIDA - añadido difficultyLevel)
export function downloadAsHTML(roadmap: RoadmapData, courseTitle: string, courseDescription: string, difficultyLevel: string) {
    const html = generateProgramHTML(roadmap, courseTitle, courseDescription, difficultyLevel)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_programa.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}