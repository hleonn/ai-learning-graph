import axios from 'axios'

const api = axios.create({
    baseURL: '/api',
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