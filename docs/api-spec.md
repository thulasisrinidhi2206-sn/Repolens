# RepoLens API Specification

This document details the REST API specifications for the RepoLens backend service.

Base URL: `http://localhost:3001`

---

## 1. System Endpoints

### 1.1 Health Check
- **Endpoint**: `GET /api/health`
- **Description**: Returns the operational status of the backend service.
- **Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "repolens-backend"
  },
  "timestamp": "2026-09-01T11:24:00.000Z"
}
```

### 1.2 System Status
- **Endpoint**: `GET /api/status`
- **Description**: Returns metadata and version information.
- **Response**:
```json
{
  "success": true,
  "data": {
    "name": "RepoLens Backend API",
    "version": "0.1.0",
    "description": "GitHub Visual Preview & Project Evaluation Platform"
  },
  "timestamp": "2026-09-01T11:24:00.000Z"
}
```

---

## 2. Planned Endpoints (Future Phases)

### 2.1 Preview Management
- `POST /api/preview`: Request creation of a new preview container for a GitHub repository.
- `GET /api/preview/:id`: Get preview session status and live preview URL.
- `DELETE /api/preview/:id`: Terminate an active preview container session.

### 2.2 Project Evaluation
- `POST /api/evaluation`: Trigger code quality and AI analysis for a repository.
- `GET /api/evaluation/:id`: Retrieve computed evaluation scores and insights.
