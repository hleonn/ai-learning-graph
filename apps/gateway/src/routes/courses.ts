import { Router, Request, Response } from 'express'
import { supabase } from '../lib/supabase'
import jwt from 'jsonwebtoken'

const router = Router()

// GET /courses — lista todos los cursos
router.get('/', async (req: Request, res: Response) => {
    const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.json({ courses: data, total: data.length })
})

// POST /courses — crear un nuevo curso
router.post('/', async (req: Request, res: Response) => {
    const { title, description, domain, google_classroom_id } = req.body

    if (!title) {
        return res.status(400).json({ error: 'El título es requerido' })
    }

    const { data, error } = await supabase
        .from('courses')
        .insert({
            title,
            description: description || '',
            domain: domain || 'generic',
            google_classroom_id: google_classroom_id || null,
        })
        .select()

    if (error) {
        console.error('Error creating course:', error)
        return res.status(500).json({ error: error.message })
    }

    res.json(data)
})

// POST /courses/:courseId/enroll — Estudiante se inscribe solo (DEBE IR ANTES DE /:id)
router.post('/:courseId/enroll', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params

        console.log(`[Enroll] Intentando inscribir usuario: ${decoded.email} en curso: ${courseId}`)

        // Buscar el ID real del usuario en profiles
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', decoded.email)
            .single()

        if (profileError || !profile) {
            console.error('[Enroll] Perfil no encontrado:', decoded.email)
            return res.status(404).json({ error: 'Perfil de usuario no encontrado' })
        }

        console.log(`[Enroll] Perfil encontrado: ${profile.id}`)

        // Verificar si ya está inscrito
        const { data: existing, error: existingError } = await supabase
            .from('course_enrollments')
            .select('*')
            .eq('course_id', courseId)
            .eq('user_id', profile.id)
            .maybeSingle()

        let isNewEnrollment = false

        if (!existing) {
            console.log(`[Enroll] Nuevo enrollment para usuario ${profile.id} en curso ${courseId}`)

            // Inscribir automáticamente
            const { error: insertError } = await supabase
                .from('course_enrollments')
                .insert({
                    course_id: courseId,
                    user_id: profile.id,
                    role: 'student',
                    source: 'auto_enroll'
                })

            if (insertError) {
                console.error('[Enroll] Error al insertar:', insertError)
                return res.status(500).json({ error: insertError.message })
            }

            isNewEnrollment = true
            console.log(`[Enroll] Inscripción exitosa`)
        } else {
            console.log(`[Enroll] Usuario ya estaba inscrito`)
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

// GET /courses/:courseId/students — Profesor ve sus estudiantes (DEBE IR ANTES DE /:id)
router.get('/:courseId/students', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any

        const { courseId } = req.params

        console.log(`[Students] Obteniendo estudiantes para curso: ${courseId}`)

        const { data, error } = await supabase
            .from('course_enrollments')
            .select(`
                user_id,
                created_at,
                profiles:user_id (id, email, full_name, role)
            `)
            .eq('course_id', courseId)
            .eq('role', 'student')

        if (error) {
            console.error('[Students] Error:', error)
            throw error
        }

        const students = (data || []).map((item: any) => ({
            id: item.profiles?.id,
            email: item.profiles?.email,
            name: item.profiles?.full_name,
            enrolled_at: item.created_at
        }))

        console.log(`[Students] Encontrados ${students.length} estudiantes`)
        res.json({ students, total: students.length })
    } catch (error: any) {
        console.error('[Students] Error:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /courses/:id — obtiene un curso por ID (DEBE IR AL FINAL)
router.get('/:id', async (req: Request, res: Response) => {
    const { id } = req.params

    const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        return res.status(404).json({ error: 'Curso no encontrado' })
    }

    res.json(data)
})

export default router