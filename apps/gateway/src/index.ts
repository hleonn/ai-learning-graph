import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import axios from 'axios'

import healthRouter from './routes/health'
import coursesRouter from './routes/courses'
import { errorHandler } from './middleware/errorHandler'

dotenv.config()

const app = express()
const PORT = process.env.GATEWAY_PORT || 3000
const GRAPH_ENGINE_URL = process.env.GRAPH_ENGINE_URL || 'http://localhost:8000'

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: ['http://localhost:5173'] }))
app.use(express.json())

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health',  healthRouter)
app.use('/courses', coursesRouter)

// ── Proxy → Graph Engine ──────────────────────────────────────────────────────
// Cualquier petición a /graph/* se redirige al Graph Engine en Python
app.use('/graph', async (req, res) => {
    try {
        const url = `${GRAPH_ENGINE_URL}/graph${req.path}`
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
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler)

// ── Arrancar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Gateway corriendo en http://localhost:${PORT}`)
    console.log(`Proxy /graph/* → ${GRAPH_ENGINE_URL}`)
})