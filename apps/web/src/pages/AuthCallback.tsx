import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function AuthCallback() {
    const [searchParams] = useSearchParams()
    const navigate       = useNavigate()
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

    useEffect(() => {
        const token = searchParams.get('token')

        if (!token) {
            setStatus('error')
            return
        }

        // Guardar token en localStorage
        localStorage.setItem('google_token', token)

        // Decodificar para obtener el nombre del usuario
        try {
            const payload = JSON.parse(atob(token.split('.')[1]))
            localStorage.setItem('user_name',  payload.name  || '')
            localStorage.setItem('user_email', payload.email || '')
            localStorage.setItem('user_photo', payload.picture || '')
            setStatus('success')

            // Redirigir al dashboard después de 1.5 segundos
            setTimeout(() => navigate('/dashboard'), 1500)
        } catch {
            setStatus('error')
        }
    }, [])

    return (
        <div style={s.page}>
            <div style={s.card}>
                {status === 'loading' && (
                    <>
                        <div style={s.spinner} />
                        <p style={s.text}>Iniciando sesión...</p>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <div style={s.check}>✓</div>
                        <p style={s.text}>¡Sesión iniciada correctamente!</p>
                        <p style={s.sub}>Redirigiendo al dashboard...</p>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <div style={s.errorIcon}>✗</div>
                        <p style={s.text}>Error al iniciar sesión</p>
                        <button style={s.btn} onClick={() => navigate('/dashboard')}>
                            Ir al dashboard
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

const s: Record<string, React.CSSProperties> = {
    page:      { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F1EFE8', fontFamily: 'system-ui, sans-serif' },
    card:      { background: '#fff', borderRadius: 16, border: '0.5px solid #D3D1C7', padding: '48px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
    spinner:   { width: 40, height: 40, border: '3px solid #F1EFE8', borderTop: '3px solid #1E3A5F', borderRadius: '50%', animation: 'spin 1s linear infinite' },
    check:     { width: 48, height: 48, background: '#E1F5EE', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#1D9E75', fontWeight: 700 },
    errorIcon: { width: 48, height: 48, background: '#FCEBEB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#A32D2D', fontWeight: 700 },
    text:      { fontSize: 18, fontWeight: 600, color: '#1E3A5F', margin: 0 },
    sub:       { fontSize: 13, color: '#888780', margin: 0 },
    btn:       { padding: '10px 24px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
}