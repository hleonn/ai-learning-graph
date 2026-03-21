export interface Course {
  id: string
  title: string
  description: string
  domain: string
  created_at: string
}

export interface ConceptNode {
  data: {
    id: string
    label: string
    description: string
    difficulty: number
  }
  position: {
    x: number
    y: number
  }
}

export interface ConceptEdge {
  data: {
    id: string
    source: string
    target: string
    strength: number
    type: string
  }
}

export interface GraphResponse {
  course: Course
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  summary: {
    total_nodes: number
    total_edges: number
  }
}
