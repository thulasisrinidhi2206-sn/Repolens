/**
 * RepoLens - Code Quality & Repository Scoring Service
 * Provides transparent, deterministic scoring across 6 architectural dimensions.
 */

import {
  QualityScoreMetrics,
  ScoreCategory,
  ScoreDeduction,
  RepositoryMetadata,
  ProjectType,
  SecurityFinding,
  DependencyItem,
} from '@repolens/shared';

export interface QualityScorerContext {
  metadata?: RepositoryMetadata;
  projectType: ProjectType;
  framework: string;
  rootFiles: string[];
  allFiles?: string[];
  packageJsonRaw?: string | null;
  readmeContent?: string | null;
  securityFindings?: SecurityFinding[];
  dependencies?: DependencyItem[];
}

export class QualityScorerService {
  /**
   * Evaluates repository code quality with transparent methodology
   */
  public static evaluate(context: QualityScorerContext): QualityScoreMetrics {
    const {
      metadata,
      rootFiles,
      allFiles = rootFiles,
      packageJsonRaw,
      readmeContent,
      securityFindings = [],
      dependencies = [],
    } = context;

    const lowerFiles = allFiles.map(f => f.toLowerCase());
    const lowerRoot = rootFiles.map(f => f.toLowerCase());

    // 1. Code Organization (20% Weight)
    const orgDeductions: ScoreDeduction[] = [];
    let orgScore = 100;

    const hasModularStructure = lowerFiles.some(f =>
      f.startsWith('src/') || f.startsWith('lib/') || f.startsWith('app/') || f.startsWith('packages/')
    );
    if (!hasModularStructure && allFiles.length > 5) {
      orgDeductions.push({ reason: 'Root directory lacks a standard /src or /lib modular separation', points: 15 });
      orgScore -= 15;
    }

    const hasStandardConfig = lowerRoot.includes('tsconfig.json') || lowerRoot.includes('package.json') || lowerRoot.includes('pyproject.toml');
    if (!hasStandardConfig) {
      orgDeductions.push({ reason: 'Missing standard configuration manifest (package.json / tsconfig / pyproject.toml)', points: 15 });
      orgScore -= 15;
    }

    const hasGitignore = lowerRoot.includes('.gitignore');
    if (!hasGitignore) {
      orgDeductions.push({ reason: 'Repository lacks a .gitignore file', points: 10 });
      orgScore -= 10;
    }

    // 2. Maintainability (20% Weight)
    const maintDeductions: ScoreDeduction[] = [];
    let maintScore = 100;

    const hasTypeSafety = lowerFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.py'));
    if (!hasTypeSafety && allFiles.some(f => f.endsWith('.js') || f.endsWith('.jsx'))) {
      maintDeductions.push({ reason: 'Project uses untyped JavaScript without TypeScript type definitions', points: 10 });
      maintScore -= 10;
    }

    const hasLinter = lowerFiles.some(f => f.includes('eslint') || f.includes('.prettierrc') || f.includes('biome.json'));
    if (!hasLinter) {
      maintDeductions.push({ reason: 'No code linter or formatter configuration detected (ESLint / Prettier / Biome)', points: 10 });
      maintScore -= 10;
    }

    // 3. Documentation (20% Weight)
    const docDeductions: ScoreDeduction[] = [];
    let docScore = 100;

    if (!readmeContent || readmeContent.trim().length === 0) {
      docDeductions.push({ reason: 'Missing or empty README file', points: 40 });
      docScore -= 40;
    } else {
      const readmeLen = readmeContent.trim().length;
      if (readmeLen < 300) {
        docDeductions.push({ reason: 'README documentation is very brief (< 300 characters)', points: 15 });
        docScore -= 15;
      }
      const lowerReadme = readmeContent.toLowerCase();
      if (!lowerReadme.includes('install') && !lowerReadme.includes('getting started') && !lowerReadme.includes('setup')) {
        docDeductions.push({ reason: 'README lacks clear Installation or Setup instructions', points: 10 });
        docScore -= 10;
      }
    }

    const hasLicense = lowerRoot.some(f => f.startsWith('license') || f.startsWith('copying'));
    if (!hasLicense) {
      docDeductions.push({ reason: 'Repository does not declare an open-source LICENSE file', points: 10 });
      docScore -= 10;
    }

    // 4. Test Coverage & CI (15% Weight)
    const testDeductions: ScoreDeduction[] = [];
    let testScore = 100;

    const hasTestFiles = lowerFiles.some(f =>
      f.includes('test') || f.includes('spec') || f.endsWith('.test.ts') || f.endsWith('.test.js') || f.endsWith('_test.py')
    );
    if (!hasTestFiles) {
      testDeductions.push({ reason: 'No automated test files detected (*.test.ts, *.spec.js, test/)', points: 30 });
      testScore -= 30;
    }

    const hasCi = lowerFiles.some(f => f.startsWith('.github/workflows') || f.includes('.gitlab-ci') || f.includes('.circleci'));
    if (!hasCi) {
      testDeductions.push({ reason: 'No automated CI/CD pipeline configured (GitHub Actions / GitLab CI)', points: 15 });
      testScore -= 15;
    }

    // 5. Dependency Health (15% Weight)
    const depDeductions: ScoreDeduction[] = [];
    let depScore = 100;

    const hasLockfile = lowerRoot.includes('package-lock.json') || lowerRoot.includes('yarn.lock') || lowerRoot.includes('pnpm-lock.yaml') || lowerRoot.includes('poetry.lock');
    if (!hasLockfile && packageJsonRaw) {
      depDeductions.push({ reason: 'Missing package lockfile (package-lock.json / yarn.lock / pnpm-lock.yaml)', points: 20 });
      depScore -= 20;
    }

    const vulnerableDeps = dependencies.filter(d => d.isVulnerable);
    if (vulnerableDeps.length > 0) {
      const deductionPoints = Math.min(30, vulnerableDeps.length * 10);
      depDeductions.push({ reason: `${vulnerableDeps.length} dependency vulnerability advisory(ies) identified`, points: deductionPoints });
      depScore -= deductionPoints;
    }

    // 6. Security Findings (10% Weight)
    const secDeductions: ScoreDeduction[] = [];
    let secScore = 100;

    const criticalSec = securityFindings.filter(f => f.severity === 'Critical');
    const highSec = securityFindings.filter(f => f.severity === 'High');
    const medSec = securityFindings.filter(f => f.severity === 'Medium');

    if (criticalSec.length > 0) {
      secDeductions.push({ reason: `${criticalSec.length} critical security issue(s) identified`, points: 40 });
      secScore -= 40;
    }
    if (highSec.length > 0) {
      secDeductions.push({ reason: `${highSec.length} high severity security issue(s) identified`, points: 25 });
      secScore -= 25;
    }
    if (medSec.length > 0) {
      secDeductions.push({ reason: `${medSec.length} medium security issue(s) identified`, points: 15 });
      secScore -= 15;
    }

    // Normalize category scores to [0, 100]
    const clamp = (val: number) => Math.max(0, Math.min(100, Math.round(val)));

    const categories = {
      codeOrganization: {
        name: 'Code Organization',
        score: clamp(orgScore),
        weight: 0.20,
        deductions: orgDeductions,
      },
      maintainability: {
        name: 'Maintainability',
        score: clamp(maintScore),
        weight: 0.20,
        deductions: maintDeductions,
      },
      documentation: {
        name: 'Documentation',
        score: clamp(docScore),
        weight: 0.20,
        deductions: docDeductions,
      },
      testCoverage: {
        name: 'Testing & CI/CD',
        score: clamp(testScore),
        weight: 0.15,
        deductions: testDeductions,
      },
      dependencyHealth: {
        name: 'Dependency Health',
        score: clamp(depScore),
        weight: 0.15,
        deductions: depDeductions,
      },
      security: {
        name: 'Security Posture',
        score: clamp(secScore),
        weight: 0.10,
        deductions: secDeductions,
      },
    };

    // Calculate overall weighted score
    const overallScore = Math.round(
      categories.codeOrganization.score * 0.20 +
      categories.maintainability.score * 0.20 +
      categories.documentation.score * 0.20 +
      categories.testCoverage.score * 0.15 +
      categories.dependencyHealth.score * 0.15 +
      categories.security.score * 0.10
    );

    // Letter grade
    let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    if (overallScore >= 95) grade = 'A+';
    else if (overallScore >= 85) grade = 'A';
    else if (overallScore >= 75) grade = 'B';
    else if (overallScore >= 60) grade = 'C';
    else if (overallScore >= 50) grade = 'D';
    else grade = 'F';

    // Key Strengths & Improvements
    const keyStrengths: string[] = [];
    const keyImprovements: string[] = [];

    if (categories.documentation.score >= 80) keyStrengths.push('Comprehensive documentation and clear README');
    if (categories.codeOrganization.score >= 85) keyStrengths.push('Clean modular architecture and standard configuration');
    if (categories.testCoverage.score >= 80) keyStrengths.push('Active automated testing and CI/CD pipelines');
    if (categories.security.score >= 90) keyStrengths.push('Robust security posture with no exposed secrets');

    if (categories.testCoverage.score < 70) keyImprovements.push('Add automated unit/integration tests with CI workflow');
    if (categories.documentation.score < 70) keyImprovements.push('Expand README with installation and quick-start guides');
    if (categories.maintainability.score < 75) keyImprovements.push('Adopt TypeScript type safety and automated linters');
    if (categories.dependencyHealth.score < 75) keyImprovements.push('Add lockfile and update vulnerable dependencies');

    const summary = `Overall repository health score is ${overallScore}/100 (${grade}). ${
      overallScore >= 80
        ? 'Well-structured, documented project conforming to open-source best practices.'
        : 'Functional repository with identifiable opportunities for test coverage and documentation hardening.'
    }`;

    const methodology = 'Weighted composite evaluation: Organization (20%), Maintainability (20%), Documentation (20%), Testing (15%), Dependencies (15%), Security (10%).';

    return {
      overallScore,
      grade,
      categories,
      methodology,
      summary,
      keyStrengths,
      keyImprovements,
    };
  }
}
