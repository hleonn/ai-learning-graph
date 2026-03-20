# AI Learning Graph Intelligence Platform
## Project Rules & Setup Reference
_Last updated: Phase 1 start_

---

## 1. Reglas de trabajo

| # | Regla | Detalle |
|---|-------|---------|
| 1 | **Solo herramientas gratuitas** | Sin planes de pago en ningún servicio. Si una herramienta requiere tarjeta para funcionalidad esencial, buscamos alternativa. |
| 2 | **Paso a paso, desde cero** | No asumir conocimiento previo. Cada comando se explica. Cada archivo se muestra completo. |
| 3 | **Rutas absolutas siempre** | Nunca "edita el archivo X". Siempre `ai-learning-graph/apps/web/src/pages/Dashboard.tsx`. |
| 4 | **Setup explícito desde el inicio** | Cada herramienta nueva: cómo instalar, cómo verificar, qué hacer si falla. |
| 5 | **Diseño de sistema documentado** | Decisiones de arquitectura explicadas antes de escribir código. |
| 6 | **Estructura de archivos creada completa** | Todos los archivos y carpetas creados desde el inicio, aunque estén vacíos. |
| 7 | **Editor: WebStorm en Mac** | Comandos de terminal usando la Terminal integrada de WebStorm o macOS Terminal. |

---

## 2. Decisiones confirmadas

| Pregunta | Respuesta |
|----------|-----------|
| Supabase | ✅ Ya tiene cuenta — usaremos proyecto existente |
| Deployment backend | 🖥️ Solo local por ahora — deploy en Fase 4 |
| Flutter | ❌ No instalado — se instala en Fase 2 |
| Seed data inicial | 🧪 Genérico primero → Math K-12 en Fase 2 |

---

## 3. Herramientas instaladas en Mac (confirmadas)

```
git        ✅
python     ✅
node       ✅
npm        ✅
docker     ✅
postgresql ✅ (local)
flutter    ❌ (Fase 2)
webstorm   ✅
```

---

## 4. Stack tecnológico (100% gratuito)

### Backend — Servicios
| Servicio | Tecnología | Puerto local |
|----------|-----------|--------------|
| API Gateway | Node.js + TypeScript + Express | 3000 |
| Graph Engine | Python + FastAPI + NetworkX | 8000 |

### Frontend
| Cliente | Tecnología | Puerto local |
|---------|-----------|--------------|
| Web | React + Vite + TypeScript | 5173 |
| Mobile | Flutter (Fase 2) | — |

### Base de datos
| Uso | Tecnología | Dónde |
|-----|-----------|-------|
| Principal (tablas relacionales) | PostgreSQL | Supabase (hosted, free) |
| Auth (login/JWT) | Supabase Auth | Supabase (hosted, free) |
| Vector embeddings (Fase 3) | pgvector | Supabase (extensión incluida) |

### Infraestructura local
| Herramienta | Uso |
|-------------|-----|
| Docker + Docker Compose | Corre todos los servicios con un comando |
| NGINX | Proxy reverso dentro de Docker |

### Deployment (Fase 4 — gratuito)
| Servicio | Qué despliega |
|----------|--------------|
| Render (free tier) | FastAPI + Node gateway |
| Vercel (free tier) | React frontend |

---

## 5. Diseño de sistema

```
┌─────────────────────────────────────────────┐
│                CLIENT LAYER                  │
│   React Web (puerto 5173)                    │
│   Flutter Mobile (Fase 2)                    │
└──────────────┬──────────────────────────────┘
               │ HTTP requests
┌──────────────▼──────────────────────────────┐
│           API GATEWAY (puerto 3000)          │
│   Node.js + TypeScript                       │
│   • Verifica JWT de Supabase                 │
│   • CRUD: users, courses, enrollments        │
│   • Proxy: /api/graph/* → Graph Engine       │
└──────┬───────────────────────┬───────────────┘
       │                       │
┌──────▼───────┐    ┌──────────▼──────────────┐
│   SUPABASE   │    │  GRAPH ENGINE (8000)     │
│              │    │  Python + FastAPI        │
│  PostgreSQL  │    │  • NetworkX algorithms   │
│  Auth (JWT)  │    │  • BKT mastery scoring   │
│  pgvector    │    │  • Gap detection         │
│  (hosted)    │    │  • Node2Vec (Fase 3)     │
└──────────────┘    └─────────────────────────┘
```

**Regla clave de arquitectura:**
- Node.js maneja: autenticación, CRUD simple, routing
- Python maneja: algoritmos de grafos, ML, cálculos pesados
- Supabase maneja: persistencia, auth, no corremos PostgreSQL local

---

## 6. Estructura completa del repositorio

```
ai-learning-graph/                          ← raíz del monorepo
│
├── apps/
│   ├── web/                                ← React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/                 ← componentes reutilizables
│   │   │   ├── pages/                      ← páginas (Login, Dashboard, Graph)
│   │   │   ├── lib/                        ← clientes API, Supabase
│   │   │   ├── types/                      ← interfaces TypeScript
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── gateway/                            ← Node.js + TypeScript
│   │   ├── src/
│   │   │   ├── routes/                     ← endpoints REST
│   │   │   ├── middleware/                 ← auth, logging, error handling
│   │   │   ├── lib/                        ← cliente Supabase, axios
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── mobile/                             ← Flutter (Fase 2 — vacío por ahora)
│       └── .gitkeep
│
├── services/
│   └── graph-engine/                       ← Python + FastAPI
│       ├── routers/                        ← endpoints organizados por dominio
│       ├── algorithms/                     ← NetworkX, BKT, gaps
│       ├── models/                         ← SQLAlchemy ORM
│       ├── db/                             ← conexión Supabase, migraciones
│       ├── tests/                          ← pytest
│       ├── main.py
│       ├── requirements.txt
│       └── Dockerfile
│
├── infra/
│   ├── docker-compose.yml                  ← orquesta todos los servicios
│   ├── nginx.conf                          ← proxy: / → web, /api → gateway
│   └── .env.example                        ← variables de entorno documentadas
│
├── docs/
│   ├── architecture.md                     ← diagrama y decisiones técnicas
│   └── decisions.md                        ← ADRs (Architecture Decision Records)
│
├── .github/
│   └── workflows/
│       └── ci.yml                          ← GitHub Actions: lint + test
│
├── .gitignore
├── README.md
└── PROJECT_RULES.md                        ← este archivo
```

---

## 7. Seed data — plan de dominios

| Fase | Dominio | Nodos | Propósito |
|------|---------|-------|-----------|
| 1–2 | **Genérico** (Programming Basics) | 8 nodos | Validar que el sistema funciona sin complejidad de dominio |
| 2–3 | **Math K-12** | 24 nodos (M01–M24) | Demo principal para Google Classroom |
| 4+ | **Digital Twins** | 64 nodos (DT01–DT64) | Extensión futura, mismo engine |

**Seed genérico (8 nodos):**
```
Variables → Functions → Conditionals → Loops
             ↓
           Arrays → Objects → Classes → Recursion
```

---

## 8. Variables de entorno (.env)

```bash
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...          # solo backend, nunca en frontend

# Servicios locales
GATEWAY_PORT=3000
GRAPH_ENGINE_PORT=8000
WEB_PORT=5173

# URLs internas (Docker)
GRAPH_ENGINE_URL=http://graph-engine:8000

# LLM (Fase 3 — dejar vacío por ahora)
OPENAI_API_KEY=
```

---

## 9. Comandos clave

```bash
# Arrancar todo (desde ai-learning-graph/)
docker-compose -f infra/docker-compose.yml up

# Solo el graph engine (desarrollo Python)
cd services/graph-engine && uvicorn main:app --reload --port 8000

# Solo el gateway (desarrollo Node)
cd apps/gateway && npm run dev

# Solo el frontend (desarrollo React)
cd apps/web && npm run dev

# Tests Python
cd services/graph-engine && pytest

# Tests Node
cd apps/gateway && npm test
```

---

## 10. Convenciones de código

| Contexto | Convención |
|----------|-----------|
| Python | snake_case, type hints, docstrings en funciones públicas |
| TypeScript | camelCase variables, PascalCase componentes/clases |
| Archivos React | `PascalCase.tsx` |
| Archivos Python | `snake_case.py` |
| Variables de entorno | `UPPER_SNAKE_CASE` |
| Commits | `feat:`, `fix:`, `chore:`, `docs:` |

---

## 11. Orden de construcción — Fase 1

```
Semana 1
  [1] Crear repo GitHub
  [2] Crear estructura de carpetas completa
  [3] Configurar Docker Compose (4 servicios)
  [4] Conectar Supabase → verificar conexión

Semana 2
  [5] FastAPI skeleton (health check + stubs)
  [6] Node gateway skeleton (health check + auth middleware)
  [7] Schema PostgreSQL en Supabase (6 tablas + migraciones)
  [8] Seed script genérico (8 nodos)

Semana 3
  [9] React scaffold (Login + Dashboard placeholder)
  [10] Conectar frontend → gateway → graph-engine (datos reales)
  [11] Verificar flujo completo end-to-end
```

---

_Este archivo es la fuente de verdad del proyecto. Si algo cambia (nueva herramienta, nueva decisión), se actualiza aquí primero._
