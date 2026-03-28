# AI Learning Graph Intelligence Platform

> Full-stack platform that models student knowledge as a graph and uses AI to detect learning gaps and generate personalized learning paths.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat&logo=typescript)](https://typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python)](https://python.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com)

---

## What it does

Students learn through an **interactive knowledge graph** where each node is a concept and each edge is a prerequisite relationship. The platform uses AI to:

- **Detect learning gaps** using Bayesian Knowledge Tracing (BKT) — the same algorithm used by Khan Academy
- **Recommend what to study next** using Node2Vec graph embeddings + PageRank + cosine similarity
- **Generate entire curricula automatically** from a course title using Claude AI

Teachers get a real-time view of which concepts their class is struggling with.

---

## Architecture
```
┌─────────────────────────────────────────────┐
│              CLIENT LAYER                    │
│  React + Vite (port 5173)                   │
│  Cytoscape.js knowledge graph visualization │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         API GATEWAY (port 3000)              │
│  Node.js + TypeScript + Express              │
│  Auth · CRUD · Proxy to Graph Engine         │
└──────┬───────────────────────┬───────────────┘
       │                       │
┌──────▼───────┐    ┌──────────▼──────────────┐
│   SUPABASE   │    │   GRAPH ENGINE (8000)    │
│  PostgreSQL  │    │   Python + FastAPI       │
│  Auth · JWT  │    │   NetworkX · BKT · RL    │
│  pgvector    │    │   Node2Vec · Claude AI   │
└──────────────┘    └─────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Cytoscape.js |
| Gateway | Node.js + TypeScript + Express |
| Graph Engine | Python + FastAPI + NetworkX |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (JWT) |
| Graph ML | Node2Vec + sentence-transformers (all-MiniLM-L6-v2) |
| Gen AI | Claude API (Anthropic) — curriculum generation |
| Infra | Docker Compose + NGINX |

---

## Key Technical Decisions

### 1. Bayesian Knowledge Tracing (BKT)
Industry-standard algorithm for estimating student mastery. Used by Khan Academy and Carnegie Learning. Four parameters: P(L0), P(T), P(G), P(S). Fully interpretable — teachers understand why scores change.
```
P(Ln) = P(Ln-1 | evidence) + P(T) × (1 − P(Ln-1 | evidence))
```

Verified: 4 correct answers → 0.0 → 0.2 → 0.763 → 0.9747 → 0.9978 (mastered)

### 2. Graph Embedding Fusion
Two signals fused per concept node:
- **Node2Vec (128-dim)**: structural position in prerequisite DAG
- **MiniLM (384-dim)**: semantic meaning of concept label + description
- **Fused (256-dim)**: concat → linear projection → L2 normalize

This means "Variables" and "Data Types" are close in embedding space even without a direct edge.

### 3. Gap Detection Severity Formula
A gap is not just low mastery — it's low mastery on a concept that blocks downstream learning:
```
severity = (1 − mastery) × PageRank × (1 + blocked_count)
```

PageRank on the knowledge graph reveals which concepts are most foundational.

### 4. Auto-Curriculum Generation
Claude API extracts concepts and infers prerequisite edges from a plain-text course description. A cycle validator (NetworkX DAG check) ensures the generated graph is always valid before saving.

---

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier)
- An [Anthropic](https://console.anthropic.com) API key (for curriculum generation)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/ai-learning-graph.git
cd ai-learning-graph
```

### 2. Graph Engine (Python)
```bash
cd services/graph-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../../infra/.env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
.venv/bin/uvicorn main:app --reload --port 8000
```

### 3. Node Gateway
```bash
cd apps/gateway
npm install
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY
npm run dev
```

### 4. Frontend
```bash
cd apps/web
npm install
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev
```

### 5. Database
Run the SQL from `infra/schema.sql` in your Supabase SQL Editor, then:
```bash
cd services/graph-engine
python seed.py
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health + Supabase status |
| GET | `/graph/{course_id}` | Full graph with PageRank + topological order |
| POST | `/mastery/event` | Record learning event, update BKT score |
| GET | `/mastery/student/{user_id}/course/{course_id}` | Student mastery per node |
| GET | `/mastery/gaps/student/{user_id}/course/{course_id}` | Ranked gap list |
| GET | `/ai/embeddings/similar/{course_id}/{node_id}` | Top-k similar concepts |
| GET | `/ai/recommend/{user_id}/{course_id}` | Personalized learning path |
| POST | `/ai/curriculum/generate` | Generate curriculum from title (preview) |
| POST | `/ai/curriculum/save/{course_id}` | Generate + save to database |

Full interactive docs: `http://localhost:8000/docs`

---

## Domain Support

The engine is domain-agnostic. Switch domains by changing seed data:

| Domain | Nodes | Status |
|--------|-------|--------|
| Programming Basics | 8 | ✅ Active (demo) |
| Mathematics K-12 | 24 | 🔄 In progress |
| Digital Twins / Robotics | 64 | 📋 Planned |

---

## Project Structure
```
ai-learning-graph/
├── apps/
│   ├── web/          # React + Vite + TypeScript
│   └── gateway/      # Node.js + TypeScript API Gateway
├── services/
│   └── graph-engine/ # Python + FastAPI + AI pipeline
│       ├── algorithms/   # BKT, gap detection, PageRank
│       ├── pipeline/     # Node2Vec, embeddings, recommender, curriculum
│       └── routers/      # FastAPI route handlers
├── infra/            # Docker Compose, NGINX, env templates
└── docs/             # Architecture decisions
```

---

## Roadmap

- [x] Phase 1 — Foundation (monorepo, FastAPI, React, Supabase)
- [x] Phase 2 — Knowledge Graph (NetworkX, BKT, gap detection, Cytoscape.js)
- [x] Phase 3 — AI Integration (Node2Vec, embeddings, recommender, Claude curriculum)
- [ ] Phase 4 — Google Scale (Classroom OAuth, load testing, production deploy)

---

## Relevance to Google for Education

This project directly addresses challenges the Google Classroom team works on:

- **Learning analytics at scale** — gap detection across student cohorts
- **AI-powered curriculum tools** — auto-generation from teacher input
- **Knowledge graph modeling** — prerequisite-aware content sequencing
- **Flutter mobile client** — cross-platform student experience (Phase 2+)

---

*Built as a portfolio project for the Google Software Engineer — Full Stack, Classroom position.*