import { app } from './app';

const PORT = process.env.PORT || 3001;

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 RepoLens backend API listening on http://localhost:${PORT}`);
  });
}

export default app;
