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
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
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
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(tokens)

        // Get user profile
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
        const { data: profile } = await oauth2.userinfo.get()

        // Create session token
        const sessionToken = jwt.sign(
            {
                email:         profile.email,
                name:          profile.name,
                picture:       profile.picture,
                google_tokens: tokens,
            },
            process.env.SUPABASE_SERVICE_KEY!,
            { expiresIn: '7d' }
        )

        // Redirect to frontend with token
        // const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
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
            total:   (data.courses || []).length,
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
        const token     = authHeader.split(' ')[1]
        const decoded   = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const googleTokens = decoded.google_tokens

        oauth2Client.setCredentials(googleTokens)

        const classroom  = google.classroom({ version: 'v1', auth: oauth2Client })
        const { data }   = await classroom.courses.students.list({
            courseId: req.params.courseId,
        })

        const students = (data.students || []).map((s: any) => ({
            id:      s.userId,
            email:   s.profile?.emailAddress,
            name:    s.profile?.name?.fullName,
            photo:   s.profile?.photoUrl,
        }))

        return res.json({ students, total: students.length })

    } catch (error: any) {
        console.error('Roster error:', error.message)
        return res.status(500).json({ error: 'Failed to fetch roster' })
    }
})

export default router