import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import axios from 'axios'

import healthRouter from './routes/health'
import coursesRouter from './routes/courses'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
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
app.use('/health',  healthRouter)
app.use('/courses', coursesRouter)
app.use('/auth', authRouter)


// ── Proxy → Graph Engine ──────────────────────────────────────────────────────
// Redirige /graph/* y /mastery/* al Graph Engine en Python
async function proxyToGraphEngine(req: express.Request, res: express.Response, prefix: string) {
    try {
        const url = `${GRAPH_ENGINE_URL}/${prefix}${req.path}`
        const response = await axios({
            method:  req.method,
            url,
            data:    req.body,
            headers: { 'Content-Type': 'application/json' },
        })
        res.json(response.data)
    } catch (error: any) {
        const status  = error.response?.status || 500
        const message = error.response?.data   || { error: 'Graph Engine no disponible' }
        res.status(status).json(message)
    }
}

app.use('/graph',   (req, res) => proxyToGraphEngine(req, res, 'graph'))
app.use('/mastery', (req, res) => proxyToGraphEngine(req, res, 'mastery'))
app.use('/ai',      (req, res) => proxyToGraphEngine(req, res, 'ai'))


// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler)

// ── Arrancar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Gateway corriendo en http://localhost:${PORT}`)
    console.log(`Proxy /graph/* y /mastery/* → ${GRAPH_ENGINE_URL}`)
})