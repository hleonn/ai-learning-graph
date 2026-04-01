import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses } from '../lib/api'
import type { Course } from '../types'

export default function Dashboard() {
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState<string | null>(null)
    const userName = localStorage.getItem('user_name')
    const userPhoto = localStorage.getItem('user_photo')


    const navigate = useNavigate()

    useEffect(() => {
        getCourses()
            .then((data) => setCourses(data.courses))
            .catch(() => setError('No se pudieron cargar los cursos'))
            .finally(() => setLoading(false))
    }, [])

    if (loading) return (
        <div style={styles.center}>
            <p style={styles.muted}>Cargando cursos...</p>
        </div>
    )

    if (error) return (
        <div style={styles.center}>
            <p style={styles.error}>{error}</p>
        </div>
    )

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div>
                        <h1 style={styles.title}>AI Learning Graph</h1>
                        <p style={styles.subtitle}>Plataforma de conocimiento adaptativo</p>
                    </div>
                    <button
                        style={styles.generateBtn}
                        onClick={() => navigate('/curriculum')}
                    >
                        + Generar currículo con AI
                    </button>
                    {userName ? (
                        <div style={styles.userBadge}>
                            {userPhoto && (
                                <img src={userPhoto} style={styles.userPhoto} alt={userName} />
                            )}
                            <span style={styles.userName}>{userName}</span>
                            <span style={styles.connected}>✓ Classroom</span>
                        </div>
                    ) : (
                        <button
                            style={styles.googleBtn}
                            onClick={() => window.location.href = 'http://localhost:3000/auth/google'}
                        >
                            Conectar Google Classroom
                        </button>
                    )}
                </div>
            </div>

            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Cursos disponibles</h2>
                <div style={styles.grid}>
                    {courses.map((course) => (
                        <div
                            key={course.id}
                            style={styles.card}
                            onClick={() => navigate(`/graph/${course.id}`)}
                        >
                            <div style={styles.cardDomain}>{course.domain}</div>
                            <h3 style={styles.cardTitle}>{course.title}</h3>
                            <p style={styles.cardDesc}>{course.description}</p>
                            <div style={styles.cardFooter}>Ver grafo →</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page:        { maxWidth: 960, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' },
    header:      { marginBottom: 48 },
    title:       { fontSize: 32, fontWeight: 700, color: '#1E3A5F', margin: 0 },
    subtitle:    { fontSize: 16, color: '#888780', marginTop: 8 },
    section:     { marginBottom: 40 },
    sectionTitle:{ fontSize: 18, fontWeight: 600, color: '#2C2C2A', marginBottom: 20 },
    grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
    card:        { background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 24, cursor: 'pointer', transition: 'border-color 0.15s' },
    cardDomain:  { fontSize: 11, fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
    cardTitle:   { fontSize: 18, fontWeight: 600, color: '#1E3A5F', margin: '0 0 8px' },
    cardDesc:    { fontSize: 14, color: '#888780', lineHeight: 1.5, margin: '0 0 16px' },
    cardFooter:  { fontSize: 13, color: '#1D9E75', fontWeight: 500 },
    center:      { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    muted:       { color: '#888780', fontSize: 16 },
    error:       { color: '#A32D2D', fontSize: 16 },
    generateBtn: { background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    // googleBtn: { background: '#fff', color: '#1E3A5F', border: '1px solid #D3D1C7', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    userBadge:  { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '6px 12px', border: '1px solid #D3D1C7' },
    userPhoto:  { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' as const },
    userName:   { fontSize: 13, fontWeight: 500, color: '#1E3A5F' },
    connected:  { fontSize: 11, color: '#1D9E75', fontWeight: 600 },
    googleBtn:  { background: '#fff', color: '#1E3A5F', border: '1px solid #D3D1C7', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}