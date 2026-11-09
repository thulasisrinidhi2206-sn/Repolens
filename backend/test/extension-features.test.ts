import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AnalyzeRepoData,
  buildMarkdownReport,
  buildPdfReport,
} from '@repolens/shared';
import { ApiClient } from '../../extension/src/services/api';
import { loadAnalysisHistory, saveAnalysisToHistory } from '../../extension/src/services/history';
import { renderDashboardSections } from '../../extension/src/content/ui/dashboard';

const analysisData: AnalyzeRepoData = {
  id: 'analysis-1',
  repo: { owner: 'octocat', repo: 'sample', branch: 'main' },
  repository: {
    name: 'sample',
    fullName: 'octocat/sample',
    owner: 'octocat',
    description: 'Sample project',
    url: 'https://github.com/octocat/sample',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 10,
    forks: 2,
    openIssues: 1,
    topics: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    pushedAt: '2025-01-01T00:00:00.000Z',
  },
  projectType: 'Node.js',
  framework: 'Express',
  files: ['package.json'],
  confidence: 0.9,
  status: 'completed',
  repositoryUrl: 'https://github.com/octocat/sample',
  receivedAt: '2025-01-01T00:00:00.000Z',
  message: 'Analysis complete',
  metrics: {
    qualityScore: {
      overallScore: 82,
      grade: 'A',
      categories: {
        codeOrganization: { name: 'Code Organization', score: 80, weight: 0.2, deductions: [] },
        maintainability: { name: 'Maintainability', score: 80, weight: 0.2, deductions: [] },
        documentation: { name: 'Documentation', score: 80, weight: 0.2, deductions: [] },
        testCoverage: { name: 'Testing & CI/CD', score: 80, weight: 0.15, deductions: [] },
        dependencyHealth: { name: 'Dependency Health', score: 90, weight: 0.15, deductions: [] },
        security: { name: 'Security Posture', score: 90, weight: 0.1, deductions: [] },
      },
      methodology: 'Weighted score.',
      summary: 'A healthy sample project.',
      keyStrengths: ['Clear modules'],
      keyImprovements: ['Add integration tests'],
    },
  },
  architecture: {
    majorModules: [{ name: 'services', path: 'src/services', role: 'Business logic', fileCount: 2 }],
    configFiles: ['package.json'],
    entryPoints: ['src/index.ts'],
    totalFilesCount: 3,
    totalDirectoriesCount: 2,
    mermaidDiagram: 'graph TD',
  },
  security: { score: 100, findings: [], exposedSecretsCount: 0 },
  dependencies: { totalCount: 1, list: [], vulnerableCount: 0, outdatedCount: 0 },
  codeReview: {
    isAiPowered: false,
    engine: 'RepoLens Static Code Analyzer',
    summary: 'No sampled issues.',
    findings: [],
  },
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

describe('Extension analysis integration', () => {
  it('sends analysis requests to the backend analyze API', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestBody = '';
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ success: true, data: analysisData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new ApiClient('http://backend.test/');
      const response = await client.analyzeRepository(analysisData.repositoryUrl);

      assert.equal(requestedUrl, 'http://backend.test/api/analyze');
      assert.deepEqual(JSON.parse(requestBody), { repositoryUrl: analysisData.repositoryUrl });
      assert.equal(response.data?.id, analysisData.id);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders architecture and scanner results into the dashboard', () => {
    const rendered = renderDashboardSections({
      ...analysisData,
      framework: '<img src=x>',
    });

    assert.match(rendered, /<svg[^>]*repolens-architecture-graph/);
    assert.match(rendered, /src\/services/);
    assert.match(rendered, /&lt;img src=x&gt; application/);
    assert.match(rendered, /Dependencies/);
    assert.match(rendered, /Code review/);
  });
});

describe('Analysis history storage', () => {
  it('stores the newest analysis once per repository', async () => {
    const storageKey = 'repolens.analysisHistory';
    let savedValue: unknown;
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async () => ({ [storageKey]: savedValue }),
            set: async (value: Record<string, unknown>) => {
              savedValue = value[storageKey];
            },
          },
        },
      },
    });

    await saveAnalysisToHistory(analysisData);
    await saveAnalysisToHistory({
      ...analysisData,
      id: 'analysis-2',
      receivedAt: '2025-01-02T00:00:00.000Z',
    });

    const entries = await loadAnalysisHistory();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'analysis-2');
    assert.equal(entries[0].overallScore, 82);
    assert.equal(entries[0].analysis?.id, 'analysis-2');
  });
});

describe('Analysis report generation', () => {
  it('includes analysis sections in Markdown and creates a valid multi-byte PDF file', () => {
    const markdown = buildMarkdownReport(analysisData);
    assert.match(markdown, /## Quality score/);
    assert.match(markdown, /## Architecture/);
    assert.match(markdown, /## Security/);
    assert.match(markdown, /## Dependencies/);
    assert.match(markdown, /## Code review/);

    const pdf = new TextDecoder().decode(buildPdfReport(analysisData));
    assert.match(pdf, /^%PDF-1\.4/);
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    assert.ok(Number.isInteger(xrefOffset));
    assert.equal(pdf.slice(xrefOffset, xrefOffset + 4), 'xref');
    assert.match(pdf, /octocat\/sample/);
  });
});
