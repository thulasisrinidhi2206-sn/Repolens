# RepoLens API Specification

This document details the REST API specifications for the RepoLens backend service.

Base URL: `http://localhost:3001`

---

## 1. System Endpoints

### 1.1 Health Check
- **Endpoint**: `GET /api/health`
- **Description**: Returns the operational status of the backend service.
- **Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "repolens-backend",
    "uptime": 142.5,
    "environment": "development"
  },
  "message": "RepoLens Backend API is operational",
  "timestamp": "2026-09-01T12:25:00.000Z"
}
```

---

## 2. Analysis Endpoints

### 2.1 Repository Analysis Request
- **Endpoint**: `POST /api/analyze`
- **Description**: Validates a public GitHub repository URL and initializes an analysis session.
- **Request Body**:
```json
{
  "repositoryUrl": "https://github.com/facebook/react"
}
```
- **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "e95cfc9b-6eb7-4009-847a-2fb8a39a7384",
    "repo": {
      "owner": "facebook",
      "repo": "react"
    },
    "status": "idle",
    "repositoryUrl": "https://github.com/facebook/react",
    "receivedAt": "2026-09-01T12:25:00.000Z",
    "message": "Repository analysis request accepted for facebook/react."
  },
  "message": "Repository analysis request processed successfully",
  "timestamp": "2026-09-01T12:25:00.000Z"
}
```
- **Validation Error Response** (`400 Bad Request`):
```json
{
  "success": false,
  "error": "Invalid GitHub owner/organization name: 'invalid-name--'.",
  "timestamp": "2026-09-01T12:25:00.000Z"
}
```

---

## 3. Planned Endpoints (Future Phases)

### 3.1 Preview Management
- `POST /api/preview`: Request creation of a new preview container for a GitHub repository.
- `GET /api/preview/:id`: Get preview session status and live preview URL.
- `DELETE /api/preview/:id`: Terminate an active preview container session.

### 3.2 Project Evaluation
- `GET /api/evaluation/:id`: Retrieve computed evaluation scores and insights.
