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
// DELETE /courses/:id — elimina un curso y todos sus datos relacionados
router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params

    // Verificar autenticación (opcional: solo profesores)
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No autorizado' })
    }

    try {
        // Supabase eliminará en cascada por las FK con ON DELETE CASCADE
        const { error } = await supabase
            .from('courses')
            .delete()
            .eq('id', id)

        if (error) {
            throw error
        }

        res.json({ success: true, message: 'Curso eliminado' })
    } catch (error: any) {
        console.error('Error deleting course:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /courses/:courseId/heatmap — Profesor ve el heatmap de la clase
router.get('/:courseId/heatmap', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_KEY!) as any
        const { courseId } = req.params

        console.log(`[Heatmap] Generando heatmap para curso: ${courseId}`)

        // 1. Obtener todos los estudiantes del curso
        const { data: enrollments, error: enrollError } = await supabase
            .from('course_enrollments')
            .select(`
                user_id,
                profiles!inner (id, email, full_name)
            `)
            .eq('course_id', courseId)
            .eq('role', 'student')

        if (enrollError) {
            console.error('[Heatmap] Error en enrollments:', enrollError)
            throw enrollError
        }

        if (!enrollments || enrollments.length === 0) {
            return res.json({
                students: [],
                concepts: [],
                heatmap: [],
                concept_stats: [],
                summary: { total_students: 0, total_concepts: 0, avg_class_mastery: 0 },
                message: 'No hay estudiantes inscritos en este curso'
            })
        }

        // 2. Obtener todos los nodos del curso
        const { data: nodes, error: nodesError } = await supabase
            .from('concept_nodes')
            .select('id, label, difficulty')
            .eq('course_id', courseId)
            .order('difficulty', { ascending: true })

        if (nodesError) {
            console.error('[Heatmap] Error en nodes:', nodesError)
            throw nodesError
        }

        if (!nodes || nodes.length === 0) {
            return res.json({
                students: [],
                concepts: [],
                heatmap: [],
                concept_stats: [],
                summary: { total_students: enrollments.length, total_concepts: 0, avg_class_mastery: 0 },
                message: 'El curso no tiene conceptos definidos'
            })
        }

        // 3. Obtener mastery de todos los estudiantes
        const studentIds = enrollments.map(e => e.user_id)
        const nodeIds = nodes.map(n => n.id)

        const { data: masteryData, error: masteryError } = await supabase
            .from('student_mastery')
            .select('user_id, node_id, mastery_score, attempts')
            .in('user_id', studentIds)
            .in('node_id', nodeIds)

        if (masteryError) {
            console.error('[Heatmap] Error en mastery:', masteryError)
            throw masteryError
        }

        // 4. Construir mapa de mastery
        const masteryMap = new Map()
        masteryData?.forEach(m => {
            const key = `${m.user_id}|${m.node_id}`
            masteryMap.set(key, m.mastery_score)
        })

        // 5. Construir heatmap
        const heatmap = enrollments.map(enrollment => {
            // profiles viene como array por la select anidada
            const profile = Array.isArray(enrollment.profiles) ? enrollment.profiles[0] : enrollment.profiles
            const studentName = profile?.full_name || profile?.email || 'Estudiante'
            const studentEmail = profile?.email || ''
            const studentId = profile?.id || enrollment.user_id

            return {
                student_id: studentId,
                student_name: studentName,
                student_email: studentEmail,
                mastery: nodes.map(node => ({
                    node_id: node.id,
                    node_label: node.label,
                    score: masteryMap.get(`${enrollment.user_id}|${node.id}`) || 0
                }))
            }
        })

        // 6. Calcular estadísticas por concepto
        const conceptStats = nodes.map(node => {
            const scores = heatmap.map(s =>
                s.mastery.find(m => m.node_id === node.id)?.score || 0
            )
            const avgScore = scores.reduce((a, b) => a + b, 0) / (scores.length || 1)
            const masteredCount = scores.filter(s => s >= 0.8).length
            const strugglingCount = scores.filter(s => s > 0 && s < 0.8).length
            const notStartedCount = scores.filter(s => s === 0).length

            return {
                node_id: node.id,
                node_label: node.label,
                difficulty: node.difficulty,
                avg_mastery: Math.round(avgScore * 100),
                mastered_count: masteredCount,
                struggling_count: strugglingCount,
                not_started_count: notStartedCount
            }
        })

        const totalAvgMastery = conceptStats.length > 0
            ? Math.round(conceptStats.reduce((a, b) => a + b.avg_mastery, 0) / conceptStats.length)
            : 0

        res.json({
            students: heatmap.map(s => ({
                id: s.student_id,
                name: s.student_name,
                email: s.student_email
            })),
            concepts: nodes,
            heatmap: heatmap,
            concept_stats: conceptStats,
            summary: {
                total_students: heatmap.length,
                total_concepts: nodes.length,
                avg_class_mastery: totalAvgMastery
            }
        })

    } catch (error: any) {
        console.error('[Heatmap] Error:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router