-- AI Learning Graph Intelligence Platform
-- Run this in your Supabase SQL Editor

create table if not exists public.profiles (
                                               id          uuid primary key,
                                               email       text not null,
                                               full_name   text,
                                               role        text not null default 'student' check (role in ('student', 'teacher', 'admin')),
    created_at  timestamptz not null default now()
    );

create table if not exists public.courses (
                                              id          uuid primary key default gen_random_uuid(),
    title       text not null,
    description text,
    domain      text not null default 'generic' check (domain in ('generic', 'math_k12', 'digital_twins')),
    created_by  uuid references public.profiles(id) on delete set null,
    created_at  timestamptz not null default now()
    );

create table if not exists public.concept_nodes (
                                                    id          uuid primary key default gen_random_uuid(),
    course_id   uuid not null references public.courses(id) on delete cascade,
    label       text not null,
    description text,
    difficulty  integer not null default 1 check (difficulty between 1 and 5),
    position_x  float default 0,
    position_y  float default 0,
    created_at  timestamptz not null default now()
    );

create table if not exists public.concept_edges (
                                                    id                    uuid primary key default gen_random_uuid(),
    course_id             uuid not null references public.courses(id) on delete cascade,
    source_id             uuid not null references public.concept_nodes(id) on delete cascade,
    target_id             uuid not null references public.concept_nodes(id) on delete cascade,
    prerequisite_strength float not null default 0.8 check (prerequisite_strength between 0 and 1),
    edge_type             text not null default 'prerequisite' check (edge_type in ('prerequisite', 'related', 'extends')),
    created_at            timestamptz not null default now(),
    unique(source_id, target_id)
    );

create table if not exists public.student_mastery (
                                                      id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    node_id       uuid not null references public.concept_nodes(id) on delete cascade,
    mastery_score float not null default 0.0 check (mastery_score between 0 and 1),
    attempts      integer not null default 0,
    last_seen     timestamptz,
    updated_at    timestamptz not null default now(),
    unique(user_id, node_id)
    );

create table if not exists public.learning_events (
                                                      id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    node_id     uuid not null references public.concept_nodes(id) on delete cascade,
    event_type  text not null check (event_type in ('viewed', 'answered', 'passed', 'failed')),
    score       float check (score between 0 and 1),
    created_at  timestamptz not null default now()
    );

-- Indexes
create index if not exists idx_concept_nodes_course on public.concept_nodes(course_id);
create index if not exists idx_concept_edges_course on public.concept_edges(course_id);
create index if not exists idx_student_mastery_user  on public.student_mastery(user_id);
create index if not exists idx_learning_events_user  on public.learning_events(user_id);
create index if not exists idx_learning_events_node  on public.learning_events(node_id);