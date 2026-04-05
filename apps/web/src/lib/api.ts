import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://mygateway.up.railway.app'

const api = axios.create({
    baseURL: API_URL,
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

// ── Node Position ────────────────────────────────────────────────────────────
export const updateNodePosition = async (courseId: string, nodeId: string, position: { x: number; y: number }) => {
    const response = await fetch(`${API_URL}/graph/${courseId}/nodes/${nodeId}/position`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            position_x: position.x,
            position_y: position.y,
        }),
    })

    if (!response.ok) {
        throw new Error('Error updating node position')
    }

    return response.json()
}

export const getNodeContent = async (courseId: string, nodeId: string, nodeLabel: string): Promise<any> => {
    const response = await fetch(`https://mygateway.up.railway.app/ai/node-content/${courseId}/${nodeId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ node_label: nodeLabel })
    })

    if (!response.ok) {
        throw new Error('Error fetching node content')
    }

    return response.json()
}