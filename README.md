# RepoLens 🔍

> **GitHub Visual Preview & Project Evaluation Platform**

RepoLens bridges the gap between static GitHub code repositories and live interactive project evaluation. It enables developers, reviewers, and recruiters to inspect, preview, and evaluate GitHub repositories with real-time visual previews and structured project health & quality assessments.

---

## 🏗️ Monorepo Architecture

RepoLens is organized as a lightweight TypeScript monorepo containing the following components:

```
repolens/
├── backend/          # Node.js TypeScript REST API service
├── extension/        # Chrome Manifest V3 browser extension
├── shared/           # Shared TypeScript types, schemas, and utility contracts
├── docs/             # Architecture, design specifications, and roadmap
├── .gitignore        # Root git ignore rules
├── package.json      # Monorepo workspaces configuration
└── README.md         # Project documentation
```

### Component Overview

- **`/extension`**: Chrome Manifest V3 browser extension that injects contextual UI elements into GitHub repository pages, enabling users to request and view live project previews and evaluation reports.
- **`/backend`**: Node.js TypeScript REST API that coordinates repository metadata processing, preview lifecycle management, and project analysis.
- **`/shared`**: Shared TypeScript models, contracts, and type definitions shared across the extension and backend services to ensure end-to-end type safety.
- **`/docs`**: Project documentation, architectural diagrams, API specifications, and future development roadmaps.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended, tested on Node v24+)
- [npm](https://www.npmjs.com/) (v9.0.0 or higher)

### Installation

Install all workspace dependencies from the root directory:

```bash
npm install
```

### Building the Project

Build all packages across the monorepo:

```bash
npm run build
```

Or build individual workspaces:

```bash
# Build shared library
npm run build:shared

# Build backend service
npm run build:backend

# Build browser extension
npm run build:extension
```

### Running the Backend

Run the backend in development mode:

```bash
npm run dev:backend
```

The backend REST API will start at `http://localhost:3001` (configurable via `.env`).

---

## 🧩 Extension Installation (Chrome)

1. Build the extension package:
   ```bash
   npm run build:extension
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right toggle.
4. Click **Load unpacked** and select the `extension/` directory.
5. Visit any repository on GitHub (e.g. `https://github.com/facebook/react`) to use RepoLens.

---

## 🗺️ Project Roadmap & Status

- [x] **Phase 1: Initial Monorepo Setup** (Clean structure, shared contracts, baseline configs)
- [ ] **Phase 2: Chrome Extension UI & GitHub DOM Injection**
- [ ] **Phase 3: Backend REST API & GitHub Integration**
- [ ] **Phase 4: Containerized Preview Generation Sandbox**
- [ ] **Phase 5: Automated Project Evaluation & AI Analytics**

For detailed architectural details and endpoint specifications, refer to the [`/docs`](./docs) directory.

---

## 📄 License

MIT
