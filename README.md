# RepoLens 🔍

> **GitHub Visual Preview & Project Evaluation Platform**  
> Inspect, evaluate, and launch sandboxed visual previews for any GitHub repository directly from your browser.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg?logo=express)](https://expressjs.com/)
[![Chrome Extension](https://img.shields.io/badge/Manifest-V3-orange.svg?logo=googlechrome)](https://developer.chrome.com/docs/extensions/)
[![Docker](https://img.shields.io/badge/Docker-Sandboxed-blue.svg?logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Overview

**RepoLens** bridges the gap between static GitHub code repositories and interactive evaluation. When reviewing repositories, developers, hiring managers, and recruiters often struggle with clone-and-run friction or missing live deployments. 

RepoLens injects contextual evaluation tools directly into GitHub repository pages via a Chrome Manifest V3 extension, providing:
1. **Automated Architectural Analysis**: Instant classification of project type, framework, dependencies, and file structures.
2. **SSRF-Protected Live Demo Discovery**: Automated extraction and reachability validation of deployed demos from repository metadata and README files.
3. **On-Demand Isolated Preview Sandbox**: Spawns ephemeral, read-only Docker containers (`nginx:alpine` and `node:20-alpine`) on localhost for eligible static and Vite/React projects.

---

## 🏗️ Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Browser ["Client Browser / GitHub UI"]
        EXT["Chrome Extension (Manifest V3)"]
        MODAL["Contextual Analysis & Preview Modal"]
        POPUP["RepoLens Extension Popup"]
    end

    subgraph Backend ["RepoLens Backend API (Node.js + Express)"]
        API["REST API Router (/api)"]
        RATE["Rate Limiter & Input Validator"]
        ANALYZE["Analyze Service"]
        DETECTOR["Project & Static Detector"]
        SSRF["SSRF Guard & Safe HTTP Engine"]
        PREVIEW["Preview Lifecycle Manager"]
        CLEANUP["Cleanup & TTL Worker (10 min)"]
    end

    subgraph External ["External Services"]
        GH["GitHub REST API (v3)"]
        DEMO["Candidate Live Demos (Vercel/Netlify/Pages)"]
    end

    subgraph Sandbox ["Isolated Container Runtime"]
        DOCKER["Docker Engine (Local Daemon)"]
        BUILDER["Builder Container (node:20-alpine, --ignore-scripts)"]
        SERVE["Serving Container (nginx:alpine, read-only, tmpfs)"]
    end

    EXT -->|Inject Preview Button| MODAL
    MODAL -->|POST /api/analyze| API
    MODAL -->|POST /api/preview| API
    POPUP -->|GET /api/health| API

    API --> RATE
    RATE --> ANALYZE
    RATE --> PREVIEW

    ANALYZE --> GH
    ANALYZE --> DETECTOR
    ANALYZE --> SSRF
    SSRF -->|Safe HEAD/GET (Private IP Blocked)| DEMO

    PREVIEW --> DETECTOR
    PREVIEW --> CLEANUP
    PREVIEW --> DOCKER
    DOCKER --> BUILDER
    BUILDER --> SERVE
    SERVE -->|http://localhost:31xxx| MODAL
```

---

## 🌟 Key Features

- **Contextual GitHub DOM Injection**: Non-intrusive "Preview Project" button automatically rendered in the GitHub repository action bar with Turbo/PJAX navigation support.
- **Resilient Branch Selection**: Analyzes designated branches when navigating URLs such as `https://github.com/owner/repo/tree/feature/new-login` (handles multi-segment slashes and URL-encoded characters with default-branch fallback).
- **Enterprise-Grade SSRF Protection**:
  - DNS resolution validation preventing DNS rebinding attacks.
  - Blocks loopback (`127.0.0.1`), RFC-1918 private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local metadata endpoints (`169.254.169.254`, `metadata.google.internal`), and private IPv6 (`::1`, `fc00::/7`, `fe80::/10`).
  - Safe manual HTTP redirect inspection preventing redirect-based SSRF.
  - Concurrency limiting (batches of 3) and 64KB response size cap.
- **Resource & Download Constraints**:
  - 5 MB maximum individual file download limit.
  - 50 MB total workspace download cap.
  - Maximum 500 files downloaded per repository to prevent disk exhaustion.
  - Request timeouts on all external GitHub API operations.
- **Sandboxed Docker Container Isolation**:
  - `--security-opt=no-new-privileges`, `--cap-drop=ALL`, `--read-only` root filesystem.
  - Ephemeral tmpfs mounts (`/tmp`, `/var/run`, `/var/cache/nginx`).
  - CPU limit (`0.5 CPU`), Memory limit (`256 MB RAM`), PID limit (`64`).
  - Container build runs `--ignore-scripts` to block malicious npm lifecycle hooks.
  - Automatic 10-minute TTL cleanup and startup orphan container pruning.
- **Rate Limiting & Production CORS**: Built-in sliding-window rate limiting on API endpoints and configurable CORS origins.

---

## 💻 Tech Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Monorepo** | npm Workspaces | Clean separation of concerns between `backend`, `extension`, and `shared`. |
| **Backend API** | Node.js, Express, TypeScript | High-concurrency asynchronous I/O and typed domain models. |
| **Extension** | Chrome Manifest V3, TypeScript, esbuild | Lightweight bundle without heavy frontend framework overhead. |
| **Shared Contracts** | TypeScript Types & Interfaces | Single source of truth for request/response payloads. |
| **Container Sandbox** | Docker Engine, Alpine Linux (`nginx`, `node`) | Complete process and filesystem isolation for untrusted repository code. |
| **Testing** | Node.js Test Runner (`node:test`, `node:assert`) | Native TypeScript test runner execution with zero extra dependency bloat. |

---

## 📸 Screenshots

*(Replace placeholders with actual UI screenshots when extension is running)*

| GitHub Page Button Injection | Analysis & Live Demo Modal |
| :---: | :---: |
| ![GitHub Button Placeholder](https://via.placeholder.com/600x350/0d1117/58a6ff?text=RepoLens+Button+Injected+in+GitHub+Header) | ![Analysis Modal Placeholder](https://via.placeholder.com/600x350/161b22/3fb950?text=RepoLens+Analysis+%26+Live+Demo+Modal) |

---

## 🚀 Getting Started (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended, tested on Node v20/v24)
- [npm](https://www.npmjs.com/) (v9.0.0 or higher)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(Optional: only required for local containerized preview sandboxing)*

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/thulasisrinidhi2206-sn/Repolens.git
cd Repolens
npm install
```

### 2. Configure Environment Variables

Copy the example environment configuration into `backend/.env`:

```bash
cp .env.example backend/.env
```

Edit `backend/.env` as needed:
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*
# Optional: Increases GitHub API rate limits from 60 req/hr to 5,000 req/hr
GITHUB_TOKEN=ghp_your_personal_access_token_here
```

### 3. Build All Monorepo Packages

```bash
npm run build
```

Or build individual workspaces:
```bash
npm run build:shared     # Build shared contracts
npm run build:backend    # Compile backend TypeScript to dist/
npm run build:extension  # Bundle Chrome extension via esbuild
```

### 4. Run the Backend API

```bash
# Development mode with hot-reloading
npm run dev:backend

# Production mode
npm run start:backend
```

The backend API will start at `http://localhost:3001`. Verify it by visiting `http://localhost:3001/health`.

### 5. Install the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` directory from the RepoLens root.
5. Navigate to any GitHub repository (e.g. `https://github.com/facebook/react`) to see the **RepoLens** button in the repository header.

---

## 🧪 Running Automated Tests

RepoLens includes a comprehensive unit and integration test suite covering:
- GitHub URL parsing and branch extraction.
- SSRF prevention, private IP CIDR filtering, and redirect validation.
- Project detection (Vite with/without config, React, Next.js, Node.js, Python, Static HTML).
- Static preview eligibility and file filtering.
- GitHub API error handling (distinguishing 404 from rate limit / network errors).
- Preview session lifecycle, log sanitization, and expiration.
- API endpoints and input validation.

Run the test suite:

```bash
npm test
```

Expected output:
```text
✔ RepoLens Backend API Endpoints (6 tests)
✔ ProjectDetectorService (7 tests)
✔ StaticDetectorService Eligibility Evaluation (3 tests)
✔ GitHubService Error Handling (4 tests)
✔ PreviewManagerService & Expiration (3 tests)
✔ SsrfProtectionService (7 tests)
✔ GitHubUrlValidatorService (9 tests)
ℹ tests 39 | pass 39 | fail 0
```

---

## 📖 API Documentation

### 1. Health Check
- **Endpoint**: `GET /health` or `GET /api/health`
- **Description**: Verifies operational status and uptime.
- **Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "repolens-backend",
    "uptime": 14.52,
    "environment": "development"
  },
  "timestamp": "2026-11-06T16:50:00.000Z"
}
```

### 2. Analyze Repository
- **Endpoint**: `POST /api/analyze`
- **Description**: Analyzes repository architecture, dependencies, files, and locates live demos.
- **Request Body**:
```json
{
  "repositoryUrl": "https://github.com/owner/repository"
}
```
- **Response**:
```json
{
  "success": true,
  "data": {
    "id": "e2c34d4a-3fb7-495c-9c71-248384f50f24",
    "repo": {
      "owner": "owner",
      "repo": "repository",
      "branch": "main"
    },
    "projectType": "Vite",
    "framework": "React (Vite)",
    "confidence": 1.0,
    "demo": {
      "hasDemo": true,
      "primaryDemoUrl": "https://example.vercel.app",
      "candidates": [...]
    },
    "status": "completed"
  }
}
```

### 3. Create Sandbox Preview
- **Endpoint**: `POST /api/preview`
- **Description**: Downloads repository source, performs containerized build (if Vite), and starts isolated Nginx container.
- **Request Body**:
```json
{
  "repositoryUrl": "https://github.com/owner/repository"
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "preview-uuid",
    "status": "ready",
    "previewUrl": "http://localhost:31450",
    "expiresAt": "2026-11-06T17:00:00.000Z"
  }
}
```

---

## ☁️ Production Deployment Guide

Deploying RepoLens for live demonstrations and portfolio use is organized into two stages:

### Phase 1: Deploy Core Analysis Backend (Recommended & Immediate)

Platforms like **Render**, **Railway**, or **Fly.io** can host the Node.js backend:

1. **Push to GitHub**: Ensure your repository is committed and pushed to GitHub.
2. **Deploy on Render / Railway**:
   - Create a new **Web Service** connected to your repository.
   - **Build Command**: `npm ci && npm run build:shared && npm run build:backend`
   - **Start Command**: `node backend/dist/index.js`
   - **Health Check Path**: `/health`
3. **Configure Environment Variables**:
   ```env
   NODE_ENV=production
   PORT=3001
   CORS_ORIGIN=*
   GITHUB_TOKEN=ghp_your_personal_access_token_here
   ```
4. **Build Chrome Extension for Deployed Backend**:
   Run the build script pointing to your deployed backend URL:
   ```bash
   node extension/build.js --api-url=https://your-repolens-api.onrender.com
   ```
   Load the resulting `extension/` folder in Chrome. The extension will now communicate directly with your live cloud backend!

### Phase 2: Isolated Container Sandbox Deployment (Optional Future Phase)

The visual preview functionality requires an environment capable of launching Docker containers (`docker run`). Standard PaaS tiers (Render, Railway free tier, Heroku) do not support Docker-in-Docker due to security restrictions.
- To enable preview sandboxes in production, host the preview service on a dedicated Linux VPS (e.g. AWS EC2, DigitalOcean Droplet, or Hetzner) where the Docker daemon is accessible.
- If Docker is not running, the backend cleanly responds with HTTP 503 explaining that Docker is unavailable on the host, while **all core repository analysis, architecture detection, and live demo detection features remain 100% operational**.

---

## ⚠️ Known Limitations

1. **Docker Daemon Dependency for Previews**: Visual preview sandboxes require Docker on the host. When deployed on standard serverless or PaaS environments without Docker, repository analysis functions normally, while the preview button displays a helpful status message.
2. **Preview Framework Scope**: Visual preview generation currently supports **Static HTML/CSS/JS** and **Vite / React-Vite** projects. Full server-side rendering frameworks (Next.js SSR, Nuxt, Django) are intentionally classified and reported, with containerized preview support planned for subsequent releases.
3. **GitHub Unauthenticated Rate Limits**: GitHub limits anonymous API requests to 60/hour. Configuring a personal access token (`GITHUB_TOKEN`) increases this limit to 5,000/hour.

---

## 🗺️ Roadmap & Future Enhancements

- [ ] Support containerized SSR previews for Next.js and Nuxt applications.
- [ ] Automated Code Quality & Maintainability scoring with Sonar/ESLint analysis.
- [ ] AI-powered pull request evaluation and security vulnerability detection.
- [ ] Firefox and Safari extension porting.

---

## 📄 License

This project is licensed under the [MIT License](./package.json).
