import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CytoscapeComponent from 'react-cytoscapejs'
import { getGraph } from '../lib/api'
import type { GraphResponse, ConceptNode } from '../types'

// Color del nodo según dificultad
function difficultyColor(difficulty: number): string {
    const colors: Record<number, string> = {
        1: '#1D9E75', // teal   — fácil
        2: '#5DCAA5', // teal claro
        3: '#FAC775', // amber  — medio
        4: '#F0997B', // coral
        5: '#E24B4A', // rojo   — difícil
    }
    return colors[difficulty] || '#888780'
}

export default function GraphView() {
    const { courseId } = useParams<{ courseId: string }>()
    const navigate     = useNavigate()
    const [graph, setGraph]           = useState<GraphResponse | null>(null)
    const [selected, setSelected]     = useState<ConceptNode['data'] | null>(null)
    const [loading, setLoading]       = useState(true)
    const [error, setError]           = useState<string | null>(null)

    useEffect(() => {
        if (!courseId) return
        getGraph(courseId)
            .then(setGraph)
            .catch(() => setError('No se pudo cargar el grafo'))
            .finally(() => setLoading(false))
    }, [courseId])

    if (loading) return <div style={styles.center}><p style={styles.muted}>Cargando grafo...</p></div>
    if (error)   return <div style={styles.center}><p style={styles.error}>{error}</p></div>
    if (!graph)  return null

    // Elementos para Cytoscape
    const elements = [
        ...graph.nodes.map((n) => ({
            data: n.data,
            position: n.position,
        })),
        ...graph.edges.map((e) => ({ data: e.data })),
    ]

    // Estilo visual de Cytoscape
    const stylesheet: any[] = [
        {
            selector: 'node',
            style: {
                label:            'data(label)',
                'background-color': (ele: any) => difficultyColor(ele.data('difficulty')),
                color:            '#fff',
                'font-size':      13,
                'font-weight':    600,
                'text-valign':    'center',
                'text-halign':    'center',
                width:            80,
                height:           80,
                'text-wrap':      'wrap',
                'text-max-width': 70,
            },
        },
        {
            selector: 'edge',
            style: {
                width:               (ele: any) => ele.data('strength') * 4,
                'line-color':        '#D3D1C7',
                'target-arrow-color':'#D3D1C7',
                'target-arrow-shape':'triangle',
                'curve-style':       'bezier',
            },
        },
        {
            selector: 'node:selected',
            style: {
                'border-width': 3,
                'border-color': '#1E3A5F',
            },
        },
    ]

    return (
        <div style={styles.page}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={() => navigate('/dashboard')} style={styles.back}>← Volver</button>
                <div>
                    <h1 style={styles.title}>{graph.course.title}</h1>
                    <p style={styles.subtitle}>
                        {graph.summary.total_nodes} conceptos · {graph.summary.total_edges} prerequisitos
                    </p>
                </div>
            </div>

            <div style={styles.body}>
                {/* Grafo */}
                <div style={styles.graphContainer}>
                    <CytoscapeComponent
                        elements={elements}
                        stylesheet={stylesheet}
                        style={{ width: '100%', height: '100%' }}
                        layout={{ name: 'preset' }}
                        cy={(cy) => {
                            cy.on('tap', 'node', (evt) => {
                                setSelected(evt.target.data())
                            })
                            cy.on('tap', (evt) => {
                                if (evt.target === cy) setSelected(null)
                            })
                        }}
                    />
                </div>

                {/* Panel lateral */}
                <div style={styles.panel}>
                    {selected ? (
                        <>
                            <h2 style={styles.panelTitle}>{selected.label}</h2>
                            <div style={{ ...styles.diffBadge, background: difficultyColor(selected.difficulty) }}>
                                Dificultad {selected.difficulty}/5
                            </div>
                            <p style={styles.panelDesc}>{selected.description}</p>
                            <div style={styles.panelId}>
                                <span style={styles.panelIdLabel}>ID</span>
                                <span style={styles.panelIdVal}>{selected.id.slice(0, 8)}...</span>
                            </div>
                        </>
                    ) : (
                        <div style={styles.panelEmpty}>
                            <p style={styles.muted}>Haz clic en un nodo para ver sus detalles</p>
                        </div>
                    )}

                    {/* Leyenda */}
                    <div style={styles.legend}>
                        <p style={styles.legendTitle}>Dificultad</p>
                        {[1,2,3,4,5].map((d) => (
                            <div key={d} style={styles.legendRow}>
                                <div style={{ ...styles.legendDot, background: difficultyColor(d) }} />
                                <span style={styles.legendLabel}>
                  {['Introductorio','Básico','Intermedio','Avanzado','Experto'][d-1]}
                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page:         { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F1EFE8' },
    header:       { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', background: '#1E3A5F' },
    back:         { background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
    title:        { fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 },
    subtitle:     { fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' },
    body:         { display: 'flex', flex: 1, overflow: 'hidden' },
    graphContainer:{ flex: 1, background: '#fff' },
    panel:        { width: 260, background: '#fff', borderLeft: '1px solid #D3D1C7', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' },
    panelTitle:   { fontSize: 18, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    diffBadge:    { display: 'inline-block', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 },
    panelDesc:    { fontSize: 14, color: '#5F5E5A', lineHeight: 1.6, margin: 0 },
    panelId:      { display: 'flex', gap: 8, alignItems: 'center' },
    panelIdLabel: { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase' },
    panelIdVal:   { fontSize: 11, fontFamily: 'monospace', color: '#444441' },
    panelEmpty:   { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    legend:       { marginTop: 'auto', borderTop: '1px solid #D3D1C7', paddingTop: 16 },
    legendTitle:  { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', marginBottom: 8 },
    legendRow:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
    legendDot:    { width: 12, height: 12, borderRadius: '50%' },
    legendLabel:  { fontSize: 12, color: '#5F5E5A' },
    center:       { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted:        { color: '#888780', fontSize: 14, textAlign: 'center' },
    error:        { color: '#A32D2D', fontSize: 14 },
}