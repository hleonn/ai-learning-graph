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

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health', healthRouter)

// ── Auto-enroll directo (DEBE IR ANTES de /courses) ──────────────────────────
app.post('/enroll/:courseId', async (req: Request, res: Response) => {
    console.log('🔵 /enroll llamado para curso:', req.params.courseId)

    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params

        console.log(`🔵 Usuario: ${decoded.email}, Curso: ${courseId}`)

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', decoded.email)
            .single()

        if (!profile) {
            console.error('❌ Perfil no encontrado para:', decoded.email)
            return res.status(404).json({ error: 'Perfil no encontrado' })
        }

        const { data: existing } = await supabase
            .from('course_enrollments')
            .select('*')
            .eq('course_id', courseId)
            .eq('user_id', profile.id)
            .maybeSingle()

        if (!existing) {
            await supabase
                .from('course_enrollments')
                .insert({
                    course_id: courseId,
                    user_id: profile.id,
                    role: 'student',
                    source: 'auto_enroll'
                })
            console.log(`✅ Usuario ${decoded.email} inscrito en curso ${courseId}`)
        } else {
            console.log(`ℹ️ Usuario ${decoded.email} ya estaba inscrito`)
        }

        res.json({ success: true, message: 'Inscrito correctamente' })
    } catch (error: any) {
        console.error('❌ Error en /enroll:', error)
        res.status(500).json({ error: error.message })
    }
})

// ── Routers (DESPUÉS del endpoint específico) ─────────────────────────────────
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