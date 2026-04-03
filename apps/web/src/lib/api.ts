import axios from 'axios'
const GATEWAY_URL = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({
    baseURL: GATEWAY_URL,
    headers: { 'Content-Type': 'application/json' },
})

// ── Courses ───────────────────────────────────────────────────────────────────
export const getCourses = () =>
    api.get('/courses').then((r) => r.data)

export const getCourse = (id: string) =>
    api.get(`/courses/${id}`).then((r) => r.data)

// ── Graph ─────────────────────────────────────────────────────────────────────
export const getGraph = (courseId: string) =>
    api.get(`/graph/${courseId}`).then((r) => r.data)

// ── Mastery ───────────────────────────────────────────────────────────────────
export const getStudentMastery = (userId: string, courseId: string) =>
    api.get(`/mastery/student/${userId}/course/${courseId}`).then((r) => r.data)

export const getGaps = (userId: string, courseId: string) =>
    api.get(`/mastery/gaps/student/${userId}/course/${courseId}`).then((r) => r.data)

export const recordEvent = (payload: {
    user_id: string
    node_id: string
    correct: boolean
    course_id: string
}) => api.post('/mastery/event', payload).then((r) => r.data)

// ── AI ────────────────────────────────────────────────────────────────────────
export const getSimilarNodes = (courseId: string, nodeId: string, k = 5) =>
    api.get(`/ai/embeddings/similar/${courseId}/${nodeId}?k=${k}`).then((r) => r.data)

export const getRecommendations = (userId: string, courseId: string, k = 5) =>
    api.get(`/ai/recommend/${userId}/${courseId}?k=${k}`).then((r) => r.data)

export const generateCurriculum = (payload: {
    title: string
    description: string
    domain: string
    num_concepts: number
}) => api.post('/ai/curriculum/generate', payload).then((r) => r.data)

export const saveCurriculum = (courseId: string, payload: {
    title: string
    description: string
    domain: string
    num_concepts: number
}) => api.post(`/ai/curriculum/save/${courseId}`, payload).then((r) => r.data)