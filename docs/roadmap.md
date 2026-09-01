# RepoLens Project Roadmap

This document outlines the planned phases of development for RepoLens.

---

## Phase 1: Project Inception & Scaffolding (Completed)
- [x] Monorepo structure (`/extension`, `/backend`, `/shared`, `/docs`)
- [x] Package workspaces configuration
- [x] TypeScript compiler configurations across all packages
- [x] Baseline Chrome Manifest V3 extension scaffolding
- [x] Baseline Express REST API setup
- [x] Shared data models and API response contracts
- [x] Documentation & architectural overview

---

## Phase 2: Chrome Extension & GitHub In-Page Integration
- [ ] Content script DOM injection for GitHub repo headers and action bars
- [ ] Preview action button and trigger mechanics
- [ ] Modal/iframe overlay for visual project preview display
- [ ] Status indicators (building, ready, failed)
- [ ] Extension settings & token storage

---

## Phase 3: Backend REST API & GitHub Integration
- [ ] GitHub API integration (Octokit) for repository metadata extraction
- [ ] Detection of project tech stack (Node.js, React, Vue, Next.js, Python, static HTML, etc.)
- [ ] Endpoints for preview lifecycle management (`POST /api/preview`, `GET /api/preview/:id`)
- [ ] Project evaluation endpoints (`GET /api/evaluation/:id`)

---

## Phase 4: Containerized Preview Sandbox
- [ ] Dockerized execution sandbox for secure project building
- [ ] Automated dependency installation and start script detection
- [ ] Port proxying and ephemeral preview URL generation
- [ ] Preview resource limiting, timeouts, and teardown management

---

## Phase 5: Automated Project Evaluation & AI Analytics
- [ ] Static analysis & project health metric computation
- [ ] AI-driven code evaluation and architectural summary generation
- [ ] Interactive report generator for code quality, documentation, and maintainability
