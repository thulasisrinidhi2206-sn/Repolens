const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'src');
const outputDir = path.join(__dirname, 'dist');
const requiredFiles = ['index.html', 'styles.css', 'main.js'];

for (const filename of requiredFiles) {
  const sourcePath = path.join(sourceDir, filename);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Required landing page source file is missing: ${sourcePath}`);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
for (const filename of requiredFiles) {
  fs.copyFileSync(path.join(sourceDir, filename), path.join(outputDir, filename));
}

console.log(`RepoLens website built to ${outputDir}`);
