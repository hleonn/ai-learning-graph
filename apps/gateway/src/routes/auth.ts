import { Router, Request, Response } from 'express'
import { google } from 'googleapis'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

const router = Router()

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
)

const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.coursework.me',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.announcements',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.courseworkmaterials',
    'https://www.googleapis.com/auth/drive.file',
]

// ── Step 1: Redirect to Google ────────────────────────────────────────────────
router.get('/google', (req: Request, res: Response) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    })
    res.redirect(url)
})

// ── Step 2: Google redirects back with code ───────────────────────────────────
router.get('/google/callback', async (req: Request, res: Response) => {
    const { code } = req.query

    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Missing authorization code' })
    }

    try {
        const { tokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(tokens)

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
        const { data: profile } = await oauth2.userinfo.get()

        const sessionToken = jwt.sign(
            {
                email: profile.email,
                name: profile.name,
                picture: profile.picture,
                google_tokens: tokens,
            },
            process.env.SUPABASE_SERVICE_KEY!,
            { expiresIn: '7d' }
        )

        const frontendUrl = 'https://ai-learning-graph.vercel.app'
        res.redirect(`${frontendUrl}/auth/callback?token=${sessionToken}`)

    } catch (error: any) {
        console.error('OAuth error:', error.message)
        res.status(500).json({ error: 'Authentication failed' })
    }
})

// ── Step 3: Get Classroom courses ─────────────────────────────────────────────
router.get('/classroom/courses', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const googleTokens = decoded.google_tokens

        oauth2Client.setCredentials(googleTokens)

        const classroom = google.classroom({ version: 'v1', auth: oauth2Client })
        const { data } = await classroom.courses.list({ courseStates: ['ACTIVE'] })

        return res.json({
            courses: data.courses || [],
            total: (data.courses || []).length,
        })

    } catch (error: any) {
        console.error('Classroom error:', error.message)
        return res.status(401).json({ error: 'Invalid or expired token' })
    }
})

// ── Step 4: Get course roster ─────────────────────────────────────────────────
router.get('/classroom/courses/:courseId/students', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const googleTokens = decoded.google_tokens

        oauth2Client.setCredentials(googleTokens)

        const classroom = google.classroom({ version: 'v1', auth: oauth2Client })
        const { data } = await classroom.courses.students.list({
            courseId: req.params.courseId,
        })

        const students = (data.students || []).map((s: any) => ({
            id: s.userId,
            email: s.profile?.emailAddress,
            name: s.profile?.name?.fullName,
            photo: s.profile?.photoUrl,
        }))

        return res.json({ students, total: students.length })

    } catch (error: any) {
        console.error('Roster error:', error.message)
        return res.status(500).json({ error: 'Failed to fetch roster' })
    }
})

// ── Step 5: Sync Google Classroom roster to Supabase ─────────────────────────
router.post('/classroom/courses/:courseId/sync', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const googleTokens = decoded.google_tokens

        oauth2Client.setCredentials(googleTokens)

        // 1. Obtener estudiantes de Google Classroom
        const classroom = google.classroom({ version: 'v1', auth: oauth2Client })
        const studentsResponse = await classroom.courses.students.list({
            courseId: req.params.courseId,
        })
        const studentsData = studentsResponse.data

        const students = (studentsData.students || []).map((s: any) => ({
            google_id: s.userId,
            email: s.profile?.emailAddress,
            name: s.profile?.name?.fullName,
            photo: s.profile?.photoUrl,
        }))

        // 2. Verificar variables de entorno
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY

        if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase environment variables')
            return res.status(500).json({ error: 'Server configuration error' })
        }

        // 3. Obtener información del curso desde Google Classroom
        const courseInfo = await classroom.courses.get({
            id: req.params.courseId,
        })
        const courseName = courseInfo.data.name || ''

        if (!courseName) {
            return res.status(404).json({ error: 'Course name not found' })
        }

        console.log(`[Sync] Buscando curso con título: "${courseName}"`)

        // 4. Buscar curso en Supabase por título
        const searchResponse = await fetch(`${supabaseUrl}/rest/v1/courses?title=eq.${encodeURIComponent(courseName)}`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
            }
        })

        if (!searchResponse.ok) {
            console.error('Error searching course:', await searchResponse.text())
            return res.status(500).json({ error: 'Error searching course in database' })
        }

        const existingCourses = await searchResponse.json()

        let courseId = null
        if (Array.isArray(existingCourses) && existingCourses.length > 0) {
            courseId = existingCourses[0].id
            console.log(`[Sync] Curso encontrado: ${courseId}`)
        } else {
            console.log(`[Sync] Curso no encontrado para título: "${courseName}"`)
            return res.status(404).json({
                error: 'Curso no encontrado',
                message: `No existe un curso con título "${courseName}". Primero debes generarlo desde "Generar currículo con AI" con el MISMO título.`
            })
        }

        // 5. Sincronizar estudiantes
        let syncedCount = 0
        for (const student of students) {
            try {
                // Buscar perfil existente por email
                const profileSearch = await fetch(`${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(student.email)}`, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                    }
                })

                if (!profileSearch.ok) continue

                const existingProfiles = await profileSearch.json()
                let userId = null

                if (Array.isArray(existingProfiles) && existingProfiles.length > 0) {
                    userId = existingProfiles[0].id
                } else {
                    // Crear perfil si no existe
                    const createProfileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
                        method: 'POST',
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        },
                        body: JSON.stringify({
                            id: student.google_id,
                            email: student.email,
                            full_name: student.name || student.email,
                            role: 'student',
                        })
                    })

                    if (createProfileResponse.ok) {
                        const newProfiles = await createProfileResponse.json()
                        if (Array.isArray(newProfiles) && newProfiles.length > 0) {
                            userId = newProfiles[0].id
                        }
                    }
                }

                if (userId && courseId) {
                    // Crear enrollment
                    await fetch(`${supabaseUrl}/rest/v1/course_enrollments`, {
                        method: 'POST',
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            course_id: courseId,
                            user_id: userId,
                            role: 'student',
                            source: 'google_classroom',
                        })
                    })
                    syncedCount++
                }
            } catch (studentError) {
                console.error('Error syncing student:', student.email, studentError)
            }
        }

        return res.json({
            success: true,
            course_id: courseId,
            students_synced: syncedCount,
            total_students: students.length,
            message: `Sincronizados ${syncedCount} de ${students.length} estudiantes`
        })

    } catch (error: any) {
        console.error('Sync error:', error.message)
        return res.status(500).json({
            error: 'Failed to sync roster',
            details: error.message
        })
    }
})

export default router