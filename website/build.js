const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'src');
const outputDir = path.join(__dirname, 'dist');
const requiredFiles = ['index.html', 'styles.css', 'main.js', 'preview.js', 'preview.css'];

for (const filename of requiredFiles) {
  const sourcePath = path.join(sourceDir, filename);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Required landing page source file is missing: ${sourcePath}`);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
for (const filename of requiredFiles) {
  if (filename === 'preview.css') continue;
  fs.copyFileSync(path.join(sourceDir, filename), path.join(outputDir, filename));
}

// Add the optional preview experience without changing the existing landing-page markup.
const outputHtml = path.join(outputDir, 'index.html');
let html = fs.readFileSync(outputHtml, 'utf8');
html = html.replace('</head>', '  <link rel="stylesheet" href="preview.css">\n</head>');
html = html.replace('</body>', '  <script src="preview.js" defer></script>\n</body>');
fs.writeFileSync(outputHtml, html);
fs.copyFileSync(path.join(sourceDir, 'preview.css'), path.join(outputDir, 'preview.css'));

console.log(`RepoLens website built to ${outputDir}`);
