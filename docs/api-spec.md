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
- **Description**: Validates a public GitHub repository URL, queries GitHub REST API for metadata and root file structure, and classifies the project type and framework.
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
    "id": "d1271a85-7543-46d4-acad-62846a8e19f6",
    "repo": {
      "owner": "facebook",
      "repo": "react",
      "branch": "main"
    },
    "repository": {
      "name": "react",
      "fullName": "facebook/react",
      "owner": "facebook",
      "description": "The library for web and native user interfaces.",
      "url": "https://github.com/facebook/react",
      "defaultBranch": "main",
      "language": "JavaScript",
      "stars": 250000,
      "forks": 51000,
      "openIssues": 1300,
      "topics": ["declarative", "frontend", "javascript", "library", "react", "ui"],
      "createdAt": "2013-05-24T16:15:54Z",
      "updatedAt": "2026-09-13T04:03:01Z",
      "pushedAt": "2026-09-11T23:35:47Z",
      "isPrivate": false
    },
    "projectType": "React",
    "framework": "React",
    "files": [
      ".github",
      ".gitignore",
      "CHANGELOG.md",
      "README.md",
      "package.json",
      "packages",
      "scripts",
      "yarn.lock"
    ],
    "confidence": 0.95,
    "details": {
      "packageJson": {
        "name": "react",
        "devDependencies": {},
        "scripts": {}
      },
      "detectedConfigs": ["package.json"],
      "mainLanguage": "JavaScript"
    },
    "status": "completed",
    "repositoryUrl": "https://github.com/facebook/react",
    "receivedAt": "2026-09-13T05:00:00.000Z",
    "message": "Repository analysis completed for facebook/react. Detected: React (React)."
  },
  "message": "Repository analysis completed for facebook/react. Detected: React (React).",
  "timestamp": "2026-09-13T05:00:00.000Z"
}
```
- **Error Responses**:
  - `400 Bad Request` (Invalid URL syntax):
    ```json
    {
      "success": false,
      "error": "URL host must be github.com.",
      "timestamp": "2026-09-13T05:00:00.000Z"
    }
    ```
  - `404 Not Found` (Repository not found / private):
    ```json
    {
      "success": false,
      "error": "Repository was not found or is private. RepoLens currently supports public repositories.",
      "timestamp": "2026-09-13T05:00:00.000Z"
    }
    ```
  - `429 Too Many Requests` (GitHub API rate limit exceeded):
    ```json
    {
      "success": false,
      "error": "GitHub API rate limit exceeded. Limit resets at 11:00:00 AM. Please try again later or configure a GITHUB_TOKEN.",
      "timestamp": "2026-09-13T05:00:00.000Z"
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
