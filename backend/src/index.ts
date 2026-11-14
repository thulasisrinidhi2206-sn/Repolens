import { app } from './app';
import { dockerRuntimeService } from './services/docker-runtime.service';

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Validate configuration
function validateStartupConfig(): void {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim().length === 0) {
    console.warn(
      '⚠️ [RepoLens Startup] No GITHUB_TOKEN configured. Unauthenticated requests are limited to 60 requests/hour by GitHub. To support 5,000 requests/hour, configure GITHUB_TOKEN in your environment.'
    );
  } else {
    console.log('🔑 [RepoLens Startup] GITHUB_TOKEN detected.');
  }

  const corsOrigin = process.env.CORS_ORIGIN;
  console.log(`🌐 [RepoLens Startup] Environment: ${NODE_ENV} | CORS_ORIGIN: ${corsOrigin || '*'}`);
}

// Start server
if (process.env.NODE_ENV !== 'test') {
  validateStartupConfig();

  app.listen(PORT, async () => {
    console.log(`🚀 RepoLens backend API listening on http://localhost:${PORT}`);

    // Clean up any dangling preview containers from previous sessions if Docker is running
    try {
      const isDockerReady = await dockerRuntimeService.isAvailable();
      if (isDockerReady) {
        console.log('🐳 [RepoLens Startup] Docker runtime is available.');
        await dockerRuntimeService.cleanupOrphanedContainers();
      } else {
        console.log('ℹ️ [RepoLens Startup] Docker daemon is not running. Static HTML previews remain available; Vite builds still require Docker.');
      }
    } catch {
      // Non-blocking
    }
  });
}

export default app;
