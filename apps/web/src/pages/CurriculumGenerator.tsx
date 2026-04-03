import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateCurriculum } from '../lib/api'

interface Concept {
    label: string
    description: string
    difficulty: number
}

interface Edge {
    source: string
    target: string
    strength: number
}

function diffColor(d: number): string {
    return ['', '#1D9E75', '#5DCAA5', '#FAC775', '#F0997B', '#E24B4A'][d] ?? '#D3D1C7'
}

function diffLabel(d: number): string {
    return ['', 'Introductorio', 'Básico', 'Intermedio', 'Avanzado', 'Experto'][d] ?? ''
}

const GRAPH_ENGINE_URL = 'https://ai-learning-graph-production.up.railway.app'

export default function CurriculumGenerator() {
    const navigate = useNavigate()

    const [form, setForm] = useState({
        title:        '',
        description:  '',
        domain:       'generic',
        num_concepts: 8,
    })

    const [result,   setResult]   = useState<{
        concepts: Concept[];
        edges: Edge[];
        is_valid_dag:boolean;
        stats: any
    } | null>(null)
    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState<string | null>(null)

    const handleGenerate = async () => {
        if (!form.title.trim()) {
            setError('El título del curso es requerido')
            return
        }
        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const data = await generateCurriculum(form)
            setResult(data.curriculum)
        } catch (e) {
            setError('Error generando el currículo. Verifica que el servidor está activo.')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveCourse = async () => {
        if (!result) return

        setLoading(true)
        setError(null)

        try {
            // 1. Crear el curso en Supabase via Gateway
            const courseResponse = await fetch('https://mygateway.up.railway.app/courses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || `Curso de ${form.title}`,
                    domain: form.domain,
                })
            })

            if (!courseResponse.ok) {
                throw new Error(`Error creating course: ${courseResponse.status}`)
            }

            const courseData = await courseResponse.json()
            const courseId = courseData[0]?.id || courseData.id

            if (!courseId) {
                throw new Error('No se pudo obtener el ID del curso')
            }

            console.log('Curso creado con ID:', courseId)

            // 2. Guardar conceptos (nodos) en el Graph Engine
            for (const concept of result.concepts) {
                const nodeResponse = await fetch(`${GRAPH_ENGINE_URL}/graph/${courseId}/nodes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        label: concept.label,
                        description: concept.description,
                        difficulty: concept.difficulty,
                    })
                })

                if (!nodeResponse.ok) {
                    console.error(`Error saving node ${concept.label}:`, await nodeResponse.text())
                }
            }

            // 3. Guardar aristas (edges) en el Graph Engine
            for (const edge of result.edges) {
                const edgeResponse = await fetch(`${GRAPH_ENGINE_URL}/graph/${courseId}/edges`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: edge.source,
                        target: edge.target,
                        prerequisite_strength: edge.strength,
                    })
                })

                if (!edgeResponse.ok) {
                    console.error(`Error saving edge ${edge.source}->${edge.target}:`, await edgeResponse.text())
                }
            }

            alert(`✅ Curso "${form.title}" guardado exitosamente con ${result.concepts.length} conceptos y ${result.edges.length} relaciones`)
            navigate('/dashboard')

        } catch (error: any) {
            console.error('Error saving course:', error)
            setError(`Error al guardar: ${error.message}`)
            alert(`Error al guardar el curso: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={s.page}>
            <div style={s.header}>
                <button onClick={() => navigate('/dashboard')} style={s.back}>← Volver</button>
                <div>
                    <h1 style={s.title}>AI Curriculum Generator</h1>
                    <p style={s.subtitle}>Genera un grafo de conocimiento desde el título de tu curso</p>
                </div>
            </div>

            <div style={s.body}>
                <div style={s.formPanel}>
                    <div style={s.field}>
                        <label style={s.label}>Título del curso *</label>
                        <input
                            style={s.input}
                            placeholder="ej. Data Science"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Descripción</label>
                        <textarea
                            style={s.textarea}
                            placeholder="Describe brevemente el contenido del curso..."
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={4}
                        />
                    </div>

                    <div style={s.row}>
                        <div style={{ ...s.field, flex: 1 }}>
                            <label style={s.label}>Dominio</label>
                            <select
                                style={s.select}
                                value={form.domain}
                                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                            >
                                <option value="generic">Genérico</option>
                                <option value="math_k12">Matemáticas K-12</option>
                                <option value="digital_twins">Digital Twins</option>
                            </select>
                        </div>

                        <div style={{ ...s.field, flex: 1 }}>
                            <label style={s.label}>Número de conceptos</label>
                            <select
                                style={s.select}
                                value={form.num_concepts}
                                onChange={e => setForm(f => ({ ...f, num_concepts: Number(e.target.value) }))}
                            >
                                {[6, 8, 10, 12].map(n => (
                                    <option key={n} value={n}>{n} conceptos</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {error && <p style={s.error}>{error}</p>}

                    <button
                        style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}
                        onClick={handleGenerate}
                        disabled={loading}
                    >
                        {loading ? 'Generando con IA...' : 'Generar currículo'}
                    </button>

                    {loading && (
                        <div style={s.loadingNote}>
                            La IA está extrayendo conceptos e infiriendo prerequisitos...
                            <br />Esto tarda ~15 segundos.
                        </div>
                    )}
                </div>

                {result && (
                    <div style={s.resultPanel}>
                        <div style={s.statsRow}>
                            <div style={s.statCard}>
                                <span style={s.statNum}>{result.stats.total_concepts}</span>
                                <span style={s.statLbl}>Conceptos</span>
                            </div>
                            <div style={s.statCard}>
                                <span style={s.statNum}>{result.stats.total_edges}</span>
                                <span style={s.statLbl}>Prerequisitos</span>
                            </div>
                            <div style={s.statCard}>
                                <span style={{ ...s.statNum, color: '#1D9E75' }}>
                                    {result.is_valid_dag ? '✓' : '✗'}
                                </span>
                                <span style={s.statLbl}>DAG válido</span>
                            </div>
                        </div>

                        <h2 style={s.sectionTitle}>Conceptos generados</h2>
                        <div style={s.conceptGrid}>
                            {result.concepts.map((c, i) => (
                                <div key={i} style={s.conceptCard}>
                                    <div style={s.conceptTop}>
                                        <span style={s.conceptLabel}>{c.label}</span>
                                        <span style={{ ...s.diffBadge, background: diffColor(c.difficulty) }}>
                                            {diffLabel(c.difficulty)}
                                        </span>
                                    </div>
                                    <p style={s.conceptDesc}>{c.description}</p>
                                </div>
                            ))}
                        </div>

                        <h2 style={s.sectionTitle}>Prerequisitos inferidos</h2>
                        <div style={s.edgeList}>
                            {result.edges.map((e, i) => (
                                <div key={i} style={s.edgeRow}>
                                    <span style={s.edgeSrc}>{e.source}</span>
                                    <span style={s.edgeArrow}>→</span>
                                    <span style={s.edgeTgt}>{e.target}</span>
                                    <div style={s.strengthBar}>
                                        <div style={{
                                            ...s.strengthFill,
                                            width: `${e.strength * 100}%`,
                                            background: e.strength >= 0.8 ? '#1D9E75' : e.strength >= 0.6 ? '#FAC775' : '#D3D1C7',
                                        }} />
                                    </div>
                                    <span style={s.strengthVal}>{Math.round(e.strength * 100)}%</span>
                                </div>
                            ))}
                        </div>

                        <button
                            style={{ ...s.btn, marginTop: 24, background: '#1D9E75' }}
                            onClick={handleSaveCourse}
                            disabled={loading}
                        >
                            {loading ? 'Guardando...' : '💾 Guardar curso en Supabase'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

const s: Record<string, React.CSSProperties> = {
    page:         { display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F1EFE8' },
    header:       { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', background: '#1E3A5F' },
    back:         { background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
    title:        { fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 },
    subtitle:     { fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' },
    body:         { display: 'flex', gap: 24, padding: 24, alignItems: 'flex-start', flexWrap: 'wrap' },
    formPanel:    { background: '#fff', borderRadius: 12, border: '0.5px solid #D3D1C7', padding: 24, width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 },
    field:        { display: 'flex', flexDirection: 'column', gap: 6 },
    label:        { fontSize: 13, fontWeight: 500, color: '#2C2C2A' },
    input:        { padding: '8px 12px', borderRadius: 8, border: '0.5px solid #D3D1C7', fontSize: 14, fontFamily: 'system-ui, sans-serif', outline: 'none' },
    textarea:     { padding: '8px 12px', borderRadius: 8, border: '0.5px solid #D3D1C7', fontSize: 14, fontFamily: 'system-ui, sans-serif', outline: 'none', resize: 'vertical' },
    select:       { padding: '8px 12px', borderRadius: 8, border: '0.5px solid #D3D1C7', fontSize: 14, fontFamily: 'system-ui, sans-serif', background: '#fff', outline: 'none' },
    row:          { display: 'flex', gap: 12 },
    btn:          { padding: '10px 0', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
    loadingNote:  { fontSize: 12, color: '#888780', textAlign: 'center', lineHeight: 1.6 },
    error:        { fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 8 },
    resultPanel:  { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 },
    statsRow:     { display: 'flex', gap: 12 },
    statCard:     { background: '#fff', borderRadius: 8, border: '0.5px solid #D3D1C7', padding: '12px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
    statNum:      { fontSize: 24, fontWeight: 700, color: '#1E3A5F' },
    statLbl:      { fontSize: 11, color: '#888780' },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: '#2C2C2A', margin: 0 },
    conceptGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
    conceptCard:  { background: '#fff', borderRadius: 10, border: '0.5px solid #D3D1C7', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
    conceptTop:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    conceptLabel: { fontSize: 13, fontWeight: 600, color: '#1E3A5F' },
    diffBadge:    { fontSize: 10, fontWeight: 600, color: '#fff', padding: '2px 8px', borderRadius: 20 },
    conceptDesc:  { fontSize: 12, color: '#5F5E5A', lineHeight: 1.5, margin: 0 },
    edgeList:     { display: 'flex', flexDirection: 'column', gap: 8 },
    edgeRow:      { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 8, border: '0.5px solid #D3D1C7', padding: '8px 14px' },
    edgeSrc:      { fontSize: 12, fontWeight: 500, color: '#1E3A5F', width: 160, flexShrink: 0 },
    edgeArrow:    { fontSize: 14, color: '#1D9E75', fontWeight: 700 },
    edgeTgt:      { fontSize: 12, fontWeight: 500, color: '#534AB7', width: 160, flexShrink: 0 },
    strengthBar:  { flex: 1, height: 5, background: '#F1EFE8', borderRadius: 3, overflow: 'hidden' },
    strengthFill: { height: '100%', borderRadius: 3 },
    strengthVal:  { fontSize: 11, color: '#888780', width: 32, textAlign: 'right', flexShrink: 0 },
}