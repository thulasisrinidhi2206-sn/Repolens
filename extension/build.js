const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

// Parse --api-url=<url> if provided in CLI flags or environment variable
const apiUrlArg = process.argv.find(a => a.startsWith('--api-url='));
const apiUrl = apiUrlArg
  ? apiUrlArg.split('=')[1]
  : (process.env.REPOLENS_API_URL || 'http://localhost:3001');

console.log(`[RepoLens Extension Build] Target Backend API URL: ${apiUrl}`);

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const buildOptions = {
  entryPoints: {
    'content.bundle': path.join(__dirname, 'src', 'content', 'index.ts'),
    'background.bundle': path.join(__dirname, 'src', 'background', 'index.ts'),
    'popup.bundle': path.join(__dirname, 'src', 'popup', 'popup.ts'),
  },
  bundle: true,
  outdir: distDir,
  target: ['chrome110'],
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  define: {
    '__REPOLENS_API_URL__': JSON.stringify(apiUrl),
  },
};

async function run() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes in extension...');
    } else {
      await esbuild.build(buildOptions);
      console.log('Extension build completed successfully.');
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

run();
