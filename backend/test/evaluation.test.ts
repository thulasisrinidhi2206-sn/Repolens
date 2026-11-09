import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectAnalysisSamplePaths, blobPathsFromGitTree } from '../src/services/file-sampler.service';
import { SecurityScannerService } from '../src/services/security-scanner.service';
import { DependencyScannerService } from '../src/services/dependency-scanner.service';
import { ArchitectureService } from '../src/services/architecture.service';
import { QualityScorerService } from '../src/services/quality-scorer.service';
import { AiReviewService } from '../src/services/ai-review.service';

describe('File sampler', () => {
  it('should skip vendor directories and prefer entrypoints and source files', () => {
    const selected = selectAnalysisSamplePaths(
      [
        'node_modules/foo/index.js',
        'dist/bundle.js',
        'src/index.ts',
        'src/utils/helper.ts',
        'README.md',
        '.env',
        'app.py',
      ],
      8
    );

    assert.ok(selected.includes('src/index.ts'));
    assert.ok(selected.includes('.env'));
    assert.ok(selected.includes('app.py'));
    assert.equal(selected.includes('node_modules/foo/index.js'), false);
    assert.equal(selected.includes('dist/bundle.js'), false);
    assert.equal(selected.includes('README.md'), false);
  });

  it('should extract blob paths from a git tree', () => {
    const paths = blobPathsFromGitTree([
      { path: 'src', type: 'tree' },
      { path: 'src/index.ts', type: 'blob' },
      { path: 'package.json', type: 'blob' },
    ]);
    assert.deepEqual(paths, ['src/index.ts', 'package.json']);
  });
});

describe('SecurityScannerService', () => {
  it('should flag committed .env files and GitHub tokens in sampled content', () => {
    const contents = new Map<string, string>([
      ['src/config.ts', 'const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";\n'],
    ]);

    const result = SecurityScannerService.scan({
      allFiles: ['.env', 'src/config.ts', 'package.json'],
      packageJsonRaw: JSON.stringify({ scripts: { start: 'node index.js' } }),
      fileContents: contents,
    });

    assert.ok(result.findings.some(f => f.title.includes('Environment File')));
    assert.ok(result.findings.some(f => f.title.includes('GitHub Personal Access Token')));
    assert.equal(result.exposedSecretsCount >= 2, true);
    assert.equal(result.score < 100, true);
  });

  it('should return a perfect score when no issues are present', () => {
    const result = SecurityScannerService.scan({
      allFiles: ['src/index.ts', 'package.json'],
      packageJsonRaw: JSON.stringify({ scripts: { start: 'node index.js' } }),
      fileContents: new Map([['src/index.ts', 'export const n = 1;\n']]),
    });

    assert.equal(result.findings.length, 0);
    assert.equal(result.score, 100);
    assert.equal(result.exposedSecretsCount, 0);
  });
});

describe('DependencyScannerService', () => {
  it('should return empty results when package.json is missing', () => {
    const result = DependencyScannerService.scan(null);
    assert.equal(result.totalCount, 0);
    assert.equal(result.list.length, 0);
  });

  it('should flag known malicious packages and unpinned versions', () => {
    const result = DependencyScannerService.scan(
      JSON.stringify({
        dependencies: {
          'event-stream': '3.3.6',
          lodash: '*',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      })
    );

    assert.equal(result.totalCount, 3);
    assert.equal(result.vulnerableCount, 1);
    assert.equal(result.outdatedCount, 1);
    const bad = result.list.find(d => d.name === 'event-stream');
    assert.equal(bad?.isVulnerable, true);
  });
});

describe('ArchitectureService', () => {
  it('should classify modules, configs, and emit a mermaid diagram', () => {
    const result = ArchitectureService.analyze({
      allFiles: [
        'package.json',
        'src/index.ts',
        'src/services/analyze.service.ts',
        'src/routes/analyze.router.ts',
        'src/controllers/analyze.controller.ts',
      ],
      projectType: 'Node.js',
      framework: 'Express',
    });

    assert.ok(result.configFiles.includes('package.json'));
    assert.ok(result.entryPoints.includes('src/index.ts'));
    assert.ok(result.majorModules.some(m => m.path.includes('services')));
    assert.match(result.mermaidDiagram || '', /graph TD/);
    assert.equal(result.totalFilesCount, 5);
  });
});

describe('QualityScorerService', () => {
  it('should deduct for missing tests, license, and lockfile', () => {
    const result = QualityScorerService.evaluate({
      projectType: 'Node.js',
      framework: 'Express',
      rootFiles: ['package.json', 'README.md'],
      allFiles: ['package.json', 'README.md', 'src/index.js'],
      packageJsonRaw: JSON.stringify({ name: 'demo', dependencies: { express: '^4.0.0' } }),
      readmeContent: 'Demo',
      securityFindings: [],
      dependencies: [],
    });

    assert.equal(result.overallScore <= 90, true);
    assert.ok(result.categories.testCoverage.deductions.length > 0);
    assert.ok(result.categories.documentation.deductions.some(d => /LICENSE/i.test(d.reason)));
    assert.match(result.summary, /Express/);
  });

  it('should lower security category when critical findings are provided', () => {
    const clean = QualityScorerService.evaluate({
      projectType: 'Node.js',
      framework: 'Express',
      rootFiles: ['package.json', 'README.md', 'LICENSE', '.gitignore', 'tsconfig.json'],
      allFiles: [
        'package.json',
        'README.md',
        'LICENSE',
        '.gitignore',
        'tsconfig.json',
        'src/index.ts',
        'src/index.test.ts',
        '.github/workflows/ci.yml',
        'package-lock.json',
        '.eslintrc.json',
      ],
      packageJsonRaw: JSON.stringify({ name: 'demo' }),
      readmeContent: 'Getting started\n\nInstall dependencies with npm install.\n'.repeat(10),
      securityFindings: [],
      dependencies: [],
    });

    const tainted = QualityScorerService.evaluate({
      projectType: 'Node.js',
      framework: 'Express',
      rootFiles: ['package.json', 'README.md', 'LICENSE', '.gitignore', 'tsconfig.json'],
      allFiles: [
        'package.json',
        'README.md',
        'LICENSE',
        '.gitignore',
        'tsconfig.json',
        'src/index.ts',
        'src/index.test.ts',
        '.github/workflows/ci.yml',
        'package-lock.json',
        '.eslintrc.json',
      ],
      packageJsonRaw: JSON.stringify({ name: 'demo' }),
      readmeContent: 'Getting started\n\nInstall dependencies with npm install.\n'.repeat(10),
      securityFindings: [
        {
          id: 'sec-1',
          title: 'Exposed token',
          severity: 'Critical',
          category: 'secret_exposure',
          description: 'token',
          recommendation: 'revoke',
          isConfirmed: true,
        },
      ],
      dependencies: [],
    });

    assert.equal(tainted.categories.security.score < clean.categories.security.score, true);
  });
});

describe('AiReviewService static analyzer', () => {
  it('should report empty findings with an honest summary when no files were sampled', async () => {
    const report = await AiReviewService.review({
      allFiles: ['package.json'],
      fileContents: new Map(),
      projectType: 'Node.js',
      framework: 'Express',
    });

    assert.equal(report.isAiPowered, false);
    assert.equal(report.findings.length, 0);
    assert.match(report.summary, /no source files were sampled/i);
  });

  it('should detect console.log and empty catch blocks in sampled source', async () => {
    const report = await AiReviewService.review({
      allFiles: ['src/app.ts'],
      fileContents: new Map([
        [
          'src/app.ts',
          'console.log("debug");\ntry { doWork(); } catch (e) {}\n',
        ],
      ]),
      projectType: 'Node.js',
      framework: 'Express',
    });

    assert.equal(report.isAiPowered, false);
    assert.ok(report.findings.some(f => f.title.includes('Console')));
    assert.ok(report.findings.some(f => f.title.includes('Catch')));
  });
});
