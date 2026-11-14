import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectDetectorService } from '../src/services/detector.service';
import { StaticDetectorService } from '../src/services/static-detector.service';

describe('ProjectDetectorService', () => {
  it('should detect Vite project with explicit vite.config.ts', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['vite.config.ts', 'package.json', 'src', 'index.html'],
      packageJsonRaw: JSON.stringify({
        name: 'vite-app',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0' },
      }),
    });

    assert.equal(result.projectType, 'Vite');
    assert.equal(result.framework, 'React (Vite)');
    assert.equal(result.confidence >= 0.95, true);
  });

  it('should detect Vite project without explicit vite config via package.json scripts and dependencies', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['package.json', 'src', 'index.html'],
      packageJsonRaw: JSON.stringify({
        name: 'my-vite-project',
        scripts: { build: 'vite build', dev: 'vite' },
        devDependencies: { vite: '^5.0.0' },
      }),
    });

    assert.equal(result.projectType, 'Vite');
    assert.equal(result.framework, 'Vite');
  });

  it('should detect Next.js project', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['next.config.js', 'package.json', 'pages'],
      packageJsonRaw: JSON.stringify({
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }),
    });

    assert.equal(result.projectType, 'Next.js');
    assert.equal(result.framework, 'Next.js');
  });

  it('should detect non-Vite React project (Create React App)', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['package.json', 'public', 'src'],
      packageJsonRaw: JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', 'react-scripts': '5.0.1' },
      }),
    });

    assert.equal(result.projectType, 'React');
    assert.equal(result.framework, 'Create React App');
  });

  it('should detect general Node.js project (Express backend)', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['package.json', 'src', 'tsconfig.json'],
      packageJsonRaw: JSON.stringify({
        dependencies: { express: '^4.18.0', dotenv: '^16.0.0' },
      }),
    });

    assert.equal(result.projectType, 'Node.js');
    assert.equal(result.framework, 'Express');
  });

  it('should detect Python project with requirements.txt or FastAPI', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['requirements.txt', 'main.py'],
      pythonConfigRaw: 'fastapi==0.109.0\nuvicorn==0.27.0',
    });

    assert.equal(result.projectType, 'Python');
    assert.equal(result.framework, 'FastAPI');
  });

  it('should detect Static HTML/CSS/JavaScript project with index.html', () => {
    const result = ProjectDetectorService.detect({
      rootFiles: ['index.html', 'style.css', 'app.js'],
    });

    assert.equal(result.projectType, 'HTML/CSS/JavaScript');
    assert.equal(result.framework, 'Vanilla HTML/CSS/JS');
  });
});

describe('StaticDetectorService Eligibility Evaluation', () => {
  it('should evaluate Vite project with package.json as eligible for preview', () => {
    const eligibility = StaticDetectorService.evaluateEligibility({
      projectType: 'Vite',
      framework: 'React (Vite)',
      rootFiles: ['package.json', 'src', 'index.html', 'vite.config.ts'],
      packageJsonRaw: JSON.stringify({ devDependencies: { vite: '^5.0.0' } }),
    });

    assert.equal(eligibility.isEligible, true);
    assert.equal(eligibility.projectType, 'Vite');
  });

  it('should reject build-dependent frameworks like Next.js and Python for preview', () => {
    const nextCheck = StaticDetectorService.evaluateEligibility({
      projectType: 'Next.js',
      rootFiles: ['package.json', 'next.config.js'],
    });
    assert.equal(nextCheck.isEligible, false);

    const pyCheck = StaticDetectorService.evaluateEligibility({
      projectType: 'Python',
      rootFiles: ['requirements.txt', 'main.py'],
    });
    assert.equal(pyCheck.isEligible, false);
  });

  it('should allow a Node.js-tooling repository when it contains a supported nested static entry point', () => {
    const eligibility = StaticDetectorService.evaluateEligibility({
      projectType: 'Node.js',
      framework: 'Node.js',
      rootFiles: ['package.json', 'gulpfile.js', 'src'],
      allFiles: ['package.json', 'gulpfile.js', 'src/index.html', 'src/css/styles.css', 'src/js/scripts.js'],
      packageJsonRaw: JSON.stringify({ devDependencies: { gulp: '^4.0.0' } }),
    });

    assert.equal(eligibility.isEligible, true);
    assert.equal(eligibility.projectType, 'HTML/CSS/JavaScript');
    assert.equal(eligibility.entryFile, 'src/index.html');
  });

  it('should still reject a Node.js server project without a static entry point', () => {
    const eligibility = StaticDetectorService.evaluateEligibility({
      projectType: 'Node.js',
      framework: 'Express',
      rootFiles: ['package.json', 'src', 'server.js'],
      allFiles: ['package.json', 'src/server.js', 'server.js'],
      packageJsonRaw: JSON.stringify({ dependencies: { express: '^4.0.0' } }),
    });

    assert.equal(eligibility.isEligible, false);
    assert.match(eligibility.reason || '', /Node.js server-side project detected/);
  });

  it('should filter safe static files and reject path traversal and secret files', () => {
    const paths = [
      'index.html',
      'css/main.css',
      '../outside.txt',
      '.env',
      '.git/config',
      'secret.pem',
      'node_modules/pkg/index.js',
      'images/logo.png',
    ];

    const safe = StaticDetectorService.filterSafeStaticFiles(paths);
    assert.deepEqual(safe, ['index.html', 'css/main.css', 'images/logo.png']);
  });
});
