# RepoLens Architecture

RepoLens is designed as a modular platform with four core subsystems:

```
┌────────────────────────────────────────────────────────┐
│               Chrome Extension (MV3)                   │
│  - GitHub DOM Content Script (Preview triggers, badges)│
│  - Popup / Side-panel Management                       │
│  - Background Service Worker                           │
└───────────────────────────┬────────────────────────────┘
                            │ REST / WebSocket
                            ▼
┌────────────────────────────────────────────────────────┐
│            RepoLens Backend REST API                   │
│  - Express & TypeScript Service                        │
│  - Repository Metadata Orchestration                   │
│  - Preview Lifecycle & Session Management              │
│  - Project Evaluation Coordinator                      │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌───────────────────────────┐┌───────────────────────────┐
│ Preview Engine (Future)   ││ Evaluation Engine (Future)│
│ - Ephemeral Containers    ││ - Code Quality Analyzer   │
│ - Port Forwarding / Proxy ││ - AI Project Scoring      │
│ - Interactive Web Previews││ - Maintainability Metrics │
└───────────────────────────┘└───────────────────────────┘
```

## Subsystem Details

### 1. Chrome Extension (`/extension`)
- **Manifest V3 Compliant**: Uses modern background service workers and declaration patterns.
- **Content Scripts**: Injects UI indicators and preview triggers directly onto GitHub repository pages (`github.com/:owner/:repo`).
- **Popup UI**: Provides connection health status, quick actions, and platform configuration.

### 2. Backend REST API (`/backend`)
- **API Engine**: Express + TypeScript server handling requests from the browser extension.
- **Shared Types**: Strong contract validation shared between client and server via `@repolens/shared`.

### 3. Shared Library (`/shared`)
- Universal TypeScript type definitions, interfaces, and API payload contracts ensuring end-to-end type safety.

### 4. Future Components
- **Execution Sandbox**: Isolated containerized environments for cloning, building, and serving web project previews safely.
- **Evaluation & AI Pipeline**: Analyzers that evaluate repository structure, dependencies, security posture, and documentation completeness.
