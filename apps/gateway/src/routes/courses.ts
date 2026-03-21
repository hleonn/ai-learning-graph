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