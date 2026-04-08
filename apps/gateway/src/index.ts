import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import { google } from 'googleapis'

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

// ── Helper para crear cliente autenticado de Classroom ────────────────────────
function getClassroomClient(googleTokens: any) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    )
    auth.setCredentials(googleTokens)
    return google.classroom({ version: 'v1', auth: auth })
}

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

// ── Obtener rol del usuario ────────────────────────────────────────────────────
app.get('/api/user/role/:userId', async (req: Request, res: Response) => {
    const { userId } = req.params

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single()

        if (error || !profile) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }

        res.json({ role: profile.role })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// ── Obtener cursos en los que está inscrito un estudiante ─────────────────────
app.get('/api/user/:userId/enrolled-courses', async (req: Request, res: Response) => {
    const { userId } = req.params

    try {
        const { data: enrollments, error } = await supabase
            .from('course_enrollments')
            .select('course_id')
            .eq('user_id', userId)
            .eq('role', 'student')

        if (error) throw error

        const courseIds = enrollments.map(e => e.course_id)

        const { data: courses, error: coursesError } = await supabase
            .from('courses')
            .select('*')
            .in('id', courseIds)

        if (coursesError) throw coursesError

        res.json({ courses })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// ── Obtener IDs de cursos inscritos ───────────────────────────────────────────
app.get('/api/user/:userId/enrollments', async (req: Request, res: Response) => {
    const { userId } = req.params

    try {
        const { data: enrollments, error } = await supabase
            .from('course_enrollments')
            .select('course_id')
            .eq('user_id', userId)
            .eq('role', 'student')

        if (error) throw error

        const enrolledCourseIds = enrollments.map(e => e.course_id)
        res.json({ enrolledCourseIds })
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

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', decoded.email)
            .single()

        if (profileError || !profile) {
            return res.status(404).json({ error: 'Perfil de usuario no encontrado' })
        }

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

// ═══════════════════════════════════════════════════════════════════════════════
// ── GOOGLE CLASSROOM INTEGRATION ENDPOINTS ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Crear curso en Google Classroom ────────────────────────────────────────
app.post('/api/classroom/create-course', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'No token provided' })

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { title, description, section } = req.body

        const classroom = getClassroomClient(decoded.google_tokens)

        const response = await classroom.courses.create({
            requestBody: {
                name: title,
                section: section || 'Sección 1',
                descriptionHeading: 'Curso generado con AI Learning Graph',
                description: description || `Curso: ${title}`,
                ownerId: 'me',
                courseState: 'PROVISIONED'
            }
        })

        const courseData = response.data
        res.json({
            success: true,
            courseId: courseData.id,
            enrollmentCode: courseData.enrollmentCode,
            alternateLink: courseData.alternateLink
        })
    } catch (error: any) {
        console.error('Error creating course:', error)
        res.status(500).json({ error: error.message })
    }
})

// ── 2. Obtener código de inscripción (usando id como parámetro) ────────────────
app.get('/api/classroom/:courseId/enrollment-code', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'No token provided' })

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params

        const classroom = getClassroomClient(decoded.google_tokens)

        const response = await classroom.courses.get({
            id: courseId  // ← CORREGIDO: usar 'id' en lugar de 'courseId'
        })
        const courseData = response.data

        res.json({
            success: true,
            enrollmentCode: courseData.enrollmentCode,
            alternateLink: courseData.alternateLink
        })
    } catch (error: any) {
        console.error('Error getting enrollment code:', error)
        res.status(500).json({ error: error.message })
    }
})

// ── 3. Listar cursos del profesor ─────────────────────────────────────────────
app.get('/api/classroom/my-courses', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'No token provided' })

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any

        const classroom = getClassroomClient(decoded.google_tokens)

        const response = await classroom.courses.list({
            courseStates: ['ACTIVE', 'PROVISIONED']
        })

        res.json({
            success: true,
            courses: response.data.courses || []
        })
    } catch (error: any) {
        console.error('Error listing courses:', error)
        res.status(500).json({ error: error.message })
    }
})

// ── 4. Crear anuncio en un curso ──────────────────────────────────────────────
app.post('/api/classroom/:courseId/announcement', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'No token provided' })

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params
        const { text } = req.body

        const classroom = getClassroomClient(decoded.google_tokens)

        const response = await classroom.courses.announcements.create({
            courseId: courseId,
            requestBody: {
                text: text,
                state: 'PUBLISHED'
            }
        })

        res.json({ success: true, announcementId: response.data.id })
    } catch (error: any) {
        console.error('Error creating announcement:', error)
        res.status(500).json({ error: error.message })
    }
})

// ── 5. Crear tarea (courseWork) ───────────────────────────────────────────────
app.post('/api/classroom/:courseId/coursework', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'No token provided' })

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params
        const { title, description, points } = req.body

        const classroom = getClassroomClient(decoded.google_tokens)

        const response = await classroom.courses.courseWork.create({
            courseId: courseId,
            requestBody: {
                title: title,
                description: description,
                workType: 'ASSIGNMENT',
                state: 'PUBLISHED',
                maxPoints: points || 100
            }
        })

        res.json({ success: true, courseWorkId: response.data.id })
    } catch (error: any) {
        console.error('Error creating coursework:', error)
        res.status(500).json({ error: error.message })
    }
})
// ── Helper para obtener o crear tópicos en Classroom ──────────────────────────
async function getOrCreateTopic(classroom: any, courseId: string, topicName: string): Promise<string | undefined> {
    try {
        // Buscar tópico existente
        const topicsResponse = await classroom.courses.topics.list({ courseId })
        const existingTopic = topicsResponse.data.topic?.find((t: any) => t.name === topicName)

        if (existingTopic) {
            console.log(`✅ Tópico existente encontrado: ${topicName}`)
            return existingTopic.topicId
        }

        // Crear nuevo tópico
        const newTopic = await classroom.courses.topics.create({
            courseId: courseId,
            requestBody: { name: topicName }
        })

        console.log(`✅ Nuevo tópico creado: ${topicName}`)
        return newTopic.data.topicId
    } catch (error) {
        console.error('Error with topic:', error)
        return undefined
    }
}

// ── Google Classroom: Crear material por subtema ───────────────────────────────
app.post('/api/classroom/:courseId/material-by-subtopic', async (req: Request, res: Response) => {
    console.log('📚 Endpoint material-by-subtopic llamado')
    console.log('📦 Headers:', req.headers.authorization ? 'Token presente' : 'No token')
    console.log('📦 Params:', req.params)
    console.log('📦 Body:', req.body)

    const authHeader = req.headers.authorization
    if (!authHeader) {
        console.log('❌ No token provided')
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params
        const { title, description, content, phaseNumber, topicName } = req.body

        console.log(`📚 Creando material: ${title} en curso ${courseId}`)

        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        )
        auth.setCredentials(decoded.google_tokens)

        const classroom = google.classroom({ version: 'v1', auth: auth })

        // Obtener o crear el tópico
        const topicId = await getOrCreateTopic(classroom, courseId, topicName)

        // Crear el material
        const materialTitle = `📘 Fase ${phaseNumber}: ${title}`
        const materialDescription = `${description}\n\n---\n📚 **Contenido educativo generado por IA:**\n\n${content}\n\n---\n*Este contenido fue generado automáticamente por AI Learning Graph. Los profesores pueden editarlo libremente.*`

        const requestBody: any = {
            title: materialTitle,
            description: materialDescription,
            materials: [
                {
                    text: {
                        text: content
                    }
                }
            ]
        }

        if (topicId) {
            requestBody.topicId = topicId
        }

        const response = await classroom.courses.courseWorkMaterials.create({
            courseId: courseId,
            requestBody: requestBody
        })

        res.json({ success: true, materialId: response.data.id })
    } catch (error: any) {
        console.error('Error creating material by subtopic:', error)
        res.status(500).json({ error: error.message })
    }
})
// ── Arrancar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Gateway corriendo en http://localhost:${PORT}`)
    console.log(`Proxy /graph/* y /mastery/* → ${GRAPH_ENGINE_URL}`)
})