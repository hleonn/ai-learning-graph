import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import axios from 'axios'
import jwt from 'jsonwebtoken'

import healthRouter from './routes/health'
import coursesRouter from './routes/courses'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import { supabase } from './lib/supabase'

dotenv.config()

const app = express()
const PORT = process.env.GATEWAY_PORT || 3000
const GRAPH_ENGINE_URL = process.env.GRAPH_ENGINE_URL || 'http://localhost:8000'

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://ai-learning-graph.vercel.app',
    ],
    credentials: true,
}))
app.use(express.json())

// ── Obtener UUID por email ────────────────────────────────────────────────────
app.get('/api/user/by-email/:email', async (req: Request, res: Response) => {
    const { email } = req.params

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (error || !profile) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }

        res.json({ id: profile.id })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// ── Auto-enroll directo ───────────────────────────────────────────────────────
app.post('/enroll/:courseId', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params

        console.log(`[Enroll] Usuario: ${decoded.email}, Curso: ${courseId}`)

        // Obtener UUID del usuario
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', decoded.email)
            .single()

        if (profileError || !profile) {
            return res.status(404).json({ error: 'Perfil de usuario no encontrado' })
        }

        // Verificar si ya está inscrito
        const { data: existing } = await supabase
            .from('course_enrollments')
            .select('*')
            .eq('course_id', courseId)
            .eq('user_id', profile.id)
            .maybeSingle()

        let isNewEnrollment = false

        if (!existing) {
            await supabase
                .from('course_enrollments')
                .insert({
                    course_id: courseId,
                    user_id: profile.id,
                    role: 'student',
                    source: 'auto_enroll'
                })
            isNewEnrollment = true
            console.log(`[Enroll] Usuario ${decoded.email} inscrito en curso ${courseId}`)
        }

        res.json({
            success: true,
            isNewEnrollment,
            message: isNewEnrollment ? 'Inscrito correctamente' : 'Ya estabas inscrito'
        })
    } catch (error: any) {
        console.error('[Enroll] Error:', error)
        res.status(500).json({ error: error.message })
    }
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health', healthRouter)
app.use('/courses', coursesRouter)
app.use('/auth', authRouter)

// ── Proxy → Graph Engine ──────────────────────────────────────────────────────
async function proxyToGraphEngine(req: express.Request, res: express.Response, prefix: string) {
    try {
        const url = `${GRAPH_ENGINE_URL}/${prefix}${req.path}`
        const response = await axios({
            method: req.method,
            url,
            data: req.body,
            headers: { 'Content-Type': 'application/json' },
        })
        res.json(response.data)
    } catch (error: any) {
        const status = error.response?.status || 500
        const message = error.response?.data || { error: 'Graph Engine no disponible' }
        res.status(status).json(message)
    }
}

app.use('/graph', (req, res) => proxyToGraphEngine(req, res, 'graph'))
app.use('/mastery', (req, res) => proxyToGraphEngine(req, res, 'mastery'))
app.use('/ai', (req, res) => proxyToGraphEngine(req, res, 'ai'))

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler)

// ── Arrancar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Gateway corriendo en http://localhost:${PORT}`)
    console.log(`Proxy /graph/* y /mastery/* → ${GRAPH_ENGINE_URL}`)
})