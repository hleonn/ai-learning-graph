import { Router, Request, Response } from 'express'
import { supabase } from '../lib/supabase'

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
            created_at: new Date().toISOString(),
        })
        .select()

    if (error) {
        console.error('Error creating course:', error)
        return res.status(500).json({ error: error.message })
    }

    res.json(data)
})

// GET /courses/:id — obtiene un curso por ID
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