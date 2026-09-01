const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

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
