import axios from 'axios'

// Todas las peticiones van a /api/* que Vite redirige al Gateway
const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
})

// ── Courses ───────────────────────────────────────────────────────────────────
export const getCourses = () =>
    api.get('/courses').then((res) => res.data)

export const getCourse = (id: string) =>
    api.get(`/courses/${id}`).then((res) => res.data)

// ── Graph ─────────────────────────────────────────────────────────────────────
export const getGraph = (courseId: string) =>
    api.get(`/graph/${courseId}`).then((res) => res.data)