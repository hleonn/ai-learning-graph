// apps/web/src/components/BloomProgressChart.tsx
import React from 'react';

interface ModuleProgress {
    order: number;
    name: string;
    weight: number; // 0-1
    complexity: number; // 0-1
    estimated_hours: number;
}

interface BloomProgressChartProps {
    modules: ModuleProgress[];
    durationWeeks: number;
    totalHours: number;
    totalNodes?: number;
    totalEdges?: number;
}

// Colores por fase (basados en el peso/orden)
const MODULE_COLORS = [
    { line: '#5b8dee', fill: '#eff4ff', name: 'Módulo 1' },
    { line: '#9b72e8', fill: '#f3eeff', name: 'Módulo 2' },
    { line: '#f07a3a', fill: '#fff3ec', name: 'Módulo 3' },
    { line: '#3bbf8c', fill: '#eafaf3', name: 'Módulo 4' },
    { line: '#2ab8c8', fill: '#e6f9fb', name: 'Módulo 5' },
    { line: '#e85d75', fill: '#ffeef2', name: 'Módulo 6' },
    { line: '#a78bfa', fill: '#ede9fe', name: 'Módulo 7' },
];

const BloomProgressChart: React.FC<BloomProgressChartProps> = ({
                                                                   modules,
                                                                   durationWeeks,
                                                                   totalHours,
                                                                   totalNodes: _totalNodes = 0,
                                                                   totalEdges = 0,
                                                               }) => {
    // Ordenar módulos por orden
    const sortedModules = [...modules].sort((a, b) => a.order - b.order);
    const moduleCount = sortedModules.length;

    // Calcular progreso acumulado basado en pesos
    let cumulativeWeight = 0;
    const moduleData = sortedModules.map((mod, idx) => {
        cumulativeWeight += mod.weight;
        const progressPercent = Math.round(cumulativeWeight * 100);
        const color = MODULE_COLORS[idx % MODULE_COLORS.length];

        return {
            ...mod,
            progressPercent,
            color: color.line,
            bgColor: color.fill,
        };
    });

    // Generar puntos para la curva SVG
    const svgWidth = 800;
    // const svgHeight = 280;
    const chartTop = 20;
    const chartBottom = 230;
    const chartHeight = chartBottom - chartTop;

    const points = moduleData.map((mod, idx) => {
        const x = (idx / (moduleCount - 1 || 1)) * svgWidth;
        const y = chartBottom - (mod.progressPercent / 100) * chartHeight;
        return { x, y };
    });

    // Generar path de la curva (bezier suave)
    const curvePath = points.map((p, i) => {
        if (i === 0) return `M${p.x},${p.y}`;
        const prev = points[i - 1];
        const cp1x = prev.x + (p.x - prev.x) * 0.5;
        const cp1y = prev.y;
        const cp2x = prev.x + (p.x - prev.x) * 0.5;
        const cp2y = p.y;
        return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p.x},${p.y}`;
    }).join(' ');

    const areaPath = `${curvePath} L${points[points.length - 1].x},${chartBottom} L0,${chartBottom} Z`;

    // Niveles Bloom (de abajo hacia arriba)
    const bloomLevels = [
        'Recordar y Comprender',
        'Comprender y Aplicar',
        'Aplicar y Analizar',
        'Analizar y Evaluar',
        'Evaluar y Crear',
    ];

    return (
        <div style={styles.card}>
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <div style={styles.iconBadge}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <polyline points="1,14 5,8 9,10 13,4 17,6" stroke="#5b8dee" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
                        </svg>
                    </div>
                    <span style={styles.title}>Avance y Taxonomía de Bloom</span>
                </div>
                <div style={styles.programSelector}>
                    <span style={styles.programLabel}>Tipo de Programa:</span>
                    <select style={styles.select} defaultValue="bootcamp">
                        <option value="bootcamp">Bootcamp ({durationWeeks} semanas)</option>
                    </select>
                </div>
            </div>

            <div style={styles.chartLayout}>
                {/* Eje Y izquierdo - Módulos */}
                <div style={styles.yAxisLeft}>
                    {moduleData.slice().reverse().map((mod) => (
                        <div key={mod.order} style={styles.yItem}>
                            <span style={{ ...styles.yName, color: mod.color }}>Módulo {mod.order}</span>
                            <span style={{ ...styles.yPercent, color: mod.color, backgroundColor: mod.bgColor }}>
                                {mod.progressPercent}%
                            </span>
                        </div>
                    ))}
                </div>

                {/* SVG del gráfico */}
                <div style={styles.svgContainer}>
                    <svg viewBox="0 0 800 280" style={styles.mainSvg}>
                        <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="1" y2="0">
                                {moduleData.map((mod, idx) => (
                                    <stop key={idx} offset={`${(idx / (moduleCount - 1 || 1)) * 100}%`} stopColor={mod.color} stopOpacity="0.15" />
                                ))}
                            </linearGradient>
                            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                                {moduleData.map((mod, idx) => (
                                    <stop key={idx} offset={`${(idx / (moduleCount - 1 || 1)) * 100}%`} stopColor={mod.color} />
                                ))}
                            </linearGradient>
                        </defs>

                        {/* Grid vertical */}
                        <g stroke="#e8edf5" strokeWidth="1">
                            {[...Array(17)].map((_, i) => (
                                <line key={i} x1={i * 50} y1="20" x2={i * 50} y2="230" />
                            ))}
                        </g>

                        {/* Grid horizontal */}
                        <g stroke="#e8edf5" strokeWidth="1" strokeDasharray="3,4">
                            {[0, 25, 50, 75, 100].map((pct) => (
                                <line key={pct} x1="0" y1={chartBottom - (pct / 100) * chartHeight} x2="800" y2={chartBottom - (pct / 100) * chartHeight} />
                            ))}
                        </g>

                        {/* Líneas verticales de fin de módulo */}
                        <g stroke="#c5cde0" strokeWidth="1.2" strokeDasharray="4,4">
                            {moduleData.map((_, idx) => (
                                <line key={idx} x1={(idx / (moduleCount - 1 || 1)) * 800} y1="20" x2={(idx / (moduleCount - 1 || 1)) * 800} y2="230" />
                            ))}
                        </g>

                        <line x1="0" y1="230" x2="800" y2="230" stroke="#c5cde0" strokeWidth="1.5" />

                        {/* Área bajo la curva */}
                        <path d={areaPath} fill="url(#areaGrad)" />

                        {/* Curva principal */}
                        <path d={curvePath} fill="none" stroke="url(#lineGrad)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />

                        {/* Puntos y etiquetas */}
                        {points.map((p, idx) => {
                            const mod = moduleData[idx];
                            return (
                                <g key={idx}>
                                    <circle cx={p.x} cy={p.y} r="5.5" fill="white" stroke={mod.color} strokeWidth="2.5" />
                                    <g transform={`translate(${p.x - 38}, ${p.y - 30})`}>
                                        <rect x="0" y="0" width="76" height="36" rx="8" fill="white" stroke={mod.color} strokeWidth="1.5" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.10))' }} />
                                        <text x="38" y="14" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="10" fontWeight="700" fill={mod.color}>Módulo {mod.order}</text>
                                        <text x="38" y="28" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="12" fontWeight="800" fill="#1a1f36">{mod.progressPercent}%</text>
                                    </g>
                                </g>
                            );
                        })}

                        {/* Badge de programa completado (si es 100%) */}
                        {moduleData[moduleCount - 1]?.progressPercent === 100 && (
                            <g transform="translate(680, 2)">
                                <rect x="0" y="0" width="112" height="44" rx="10" fill={moduleData[moduleCount - 1].color} />
                                <text x="56" y="15" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="9.5" fontWeight="600" fill="white">Programa</text>
                                <text x="56" y="27" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="9.5" fontWeight="600" fill="white">completado</text>
                                <text x="56" y="39" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="12" fontWeight="800" fill="white">100%</text>
                            </g>
                        )}

                        {/* Eje X */}
                        <g fontFamily="DM Sans, sans-serif" fontSize="10" fill="#9aa0b8" textAnchor="middle">
                            {[...Array(durationWeeks + 1)].map((_, i) => (
                                <text key={i} x={(i / durationWeeks) * 800} y="245">{i}</text>
                            ))}
                        </g>
                        <text x="400" y="262" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="11" fill="#9aa0b8" fontWeight="500">Semanas</text>
                    </svg>
                </div>

                {/* Eje Y derecho - Taxonomía Bloom */}
                <div style={styles.yAxisRight}>
                    {bloomLevels.map((level) => (
                        <div key={level} style={styles.bloomItem}>
                            <span style={styles.bloomLevel}>{level}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer stats */}
            <div style={styles.statsFooter}>
                <div style={styles.statBlock}>
                    <div style={styles.statIcon}>📊</div>
                    <div>
                        <div style={styles.statLabel}>Total módulos</div>
                        <div style={styles.statNumber}>{moduleCount}</div>
                    </div>
                </div>
                <div style={styles.divider} />
                <div style={styles.statBlock}>
                    <div style={styles.statIcon}>🔗</div>
                    <div>
                        <div style={styles.statLabel}>Total edges</div>
                        <div style={styles.statNumber}>{totalEdges || '—'}</div>
                    </div>
                </div>
                <div style={styles.divider} />
                <div style={styles.statBlock}>
                    <div style={styles.statIcon}>⏱️</div>
                    <div>
                        <div style={styles.statLabel}>Carga horaria</div>
                        <div style={styles.statNumber}>{totalHours}h</div>
                    </div>
                </div>
                <div style={styles.divider} />
                <div style={styles.statBlock}>
                    <div style={styles.statIcon}>📅</div>
                    <div>
                        <div style={styles.statLabel}>Duración</div>
                        <div style={styles.statNumber}>{durationWeeks} semanas</div>
                    </div>
                </div>
                <div style={styles.legend}>
                    <span style={styles.legendLine}></span>
                    <span>Línea punteada: fin de cada módulo</span>
                </div>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    card: {
        maxWidth: 1200,
        width: '100%',
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 2px 16px rgba(26, 31, 54, 0.07)',
        border: '1px solid #e4e8f0',
        padding: '24px 28px',
        marginTop: 32,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 28,
        flexWrap: 'wrap',
        gap: 12,
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
    iconBadge: {
        width: 36, height: 36, background: 'linear-gradient(135deg, #e8f0ff, #d0e2ff)',
        borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: 700, color: '#1a1f36', letterSpacing: -0.3 },
    programSelector: { display: 'flex', alignItems: 'center', gap: 10 },
    programLabel: { fontSize: 13, color: '#6b7394', fontWeight: 500 },
    select: {
        padding: '7px 12px',
        borderRadius: 8,
        border: '1.5px solid #e4e8f0',
        fontSize: 13,
        fontWeight: 500,
        color: '#1a1f36',
        background: 'white',
        cursor: 'pointer',
        outline: 'none',
    },
    chartLayout: { display: 'flex', gap: 0, marginTop: 8 },
    yAxisLeft: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 90, paddingRight: 12, height: 210, marginTop: 20 },
    yItem: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
    yName: { fontSize: 11.5, fontWeight: 600 },
    yPercent: { fontSize: 12, fontWeight: 700, borderRadius: 5, padding: '2px 7px' },
    svgContainer: { flex: 1 },
    mainSvg: { width: '100%', display: 'block' },
    yAxisRight: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 140, paddingLeft: 12, height: 210, marginTop: 20 },
    bloomItem: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6 },
    bloomLevel: { fontSize: 11, fontWeight: 600, color: '#8b5cf6', background: '#f3e8ff', padding: '2px 8px', borderRadius: 12 },
    statsFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1.5px solid #e4e8f0', paddingTop: 18, marginTop: 20, flexWrap: 'wrap', gap: 16 },
    statBlock: { display: 'flex', alignItems: 'center', gap: 10 },
    statIcon: { width: 34, height: 34, background: '#f7f8fc', borderRadius: 9, border: '1.5px solid #e4e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
    statLabel: { fontSize: 10.5, color: '#6b7394', fontWeight: 500 },
    statNumber: { fontSize: 17, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#1a1f36' },
    divider: { width: 1, height: 36, background: '#e4e8f0' },
    legend: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6b7394' },
    legendLine: { width: 22, height: 1, borderTop: '2px dashed #6b7394', display: 'inline-block' },
};

export default BloomProgressChart;