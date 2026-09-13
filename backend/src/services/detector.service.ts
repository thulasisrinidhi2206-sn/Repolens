/**
 * RepoLens - Project Type & Framework Detection Service
 * Analyzes repository files, package.json, and configuration files to classify project architecture
 */

import { ProjectType, RepositoryMetadata, RepositoryAnalysisResult } from '@repolens/shared';

export interface DetectionContext {
  rootFiles: string[];
  packageJsonRaw?: string | null;
  pythonConfigRaw?: string | null;
  metadata?: RepositoryMetadata;
}

export class ProjectDetectorService {
  /**
   * Evaluates repository files and configuration to determine project type and framework
   */
  public static detect(context: DetectionContext): {
    projectType: ProjectType;
    framework: string;
    confidence: number;
    details?: {
      packageJson?: any;
      detectedConfigs?: string[];
      mainLanguage?: string | null;
    };
  } {
    const { rootFiles, packageJsonRaw, metadata } = context;
    const fileSet = new Set(rootFiles.map(f => f.toLowerCase()));
    const detectedConfigs: string[] = [];

    // Parse package.json if present
    let pkg: any = null;
    if (packageJsonRaw) {
      try {
        pkg = JSON.parse(packageJsonRaw);
        detectedConfigs.push('package.json');
      } catch (_err) {
        console.warn('[ProjectDetector] Failed to parse package.json');
      }
    }

    const allDeps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
    };

    // Check for config files
    const hasNextConfig = fileSet.has('next.config.js') || fileSet.has('next.config.mjs') || fileSet.has('next.config.ts');
    if (hasNextConfig) detectedConfigs.push('next.config');

    const hasViteConfig = fileSet.has('vite.config.js') || fileSet.has('vite.config.ts') || fileSet.has('vite.config.mjs') || fileSet.has('vite.config.cjs');
    if (hasViteConfig) detectedConfigs.push('vite.config');

    const hasWebpackConfig = fileSet.has('webpack.config.js') || fileSet.has('webpack.config.ts');
    if (hasWebpackConfig) detectedConfigs.push('webpack.config');

    const hasTsConfig = fileSet.has('tsconfig.json');
    if (hasTsConfig) detectedConfigs.push('tsconfig.json');

    const hasRequirementsTxt = fileSet.has('requirements.txt');
    if (hasRequirementsTxt) detectedConfigs.push('requirements.txt');

    const hasPyproject = fileSet.has('pyproject.toml');
    if (hasPyproject) detectedConfigs.push('pyproject.toml');

    const hasPipfile = fileSet.has('pipfile');
    if (hasPipfile) detectedConfigs.push('Pipfile');

    const hasIndexHtml = fileSet.has('index.html');

    // -------------------------------------------------------------
    // 1. Next.js Detection
    // -------------------------------------------------------------
    if ('next' in allDeps || hasNextConfig) {
      const confidence = ('next' in allDeps && hasNextConfig) ? 1.0 : 0.95;
      return {
        projectType: 'Next.js',
        framework: 'Next.js',
        confidence,
        details: {
          packageJson: pkg ? {
            name: pkg.name,
            version: pkg.version,
            dependencies: pkg.dependencies,
            devDependencies: pkg.devDependencies,
            scripts: pkg.scripts,
          } : undefined,
          detectedConfigs,
          mainLanguage: metadata?.language || (hasTsConfig ? 'TypeScript' : 'JavaScript'),
        },
      };
    }

    // -------------------------------------------------------------
    // 2. Vite Detection
    // -------------------------------------------------------------
    if ('vite' in allDeps || hasViteConfig) {
      const isReact = 'react' in allDeps || 'react-dom' in allDeps;
      const isVue = 'vue' in allDeps;
      const isSvelte = 'svelte' in allDeps;

      let framework = 'Vite';
      if (isReact) framework = 'React (Vite)';
      else if (isVue) framework = 'Vue (Vite)';
      else if (isSvelte) framework = 'Svelte (Vite)';

      const confidence = ('vite' in allDeps && hasViteConfig) ? 1.0 : 0.95;
      return {
        projectType: 'Vite',
        framework,
        confidence,
        details: {
          packageJson: pkg ? {
            name: pkg.name,
            version: pkg.version,
            dependencies: pkg.dependencies,
            devDependencies: pkg.devDependencies,
            scripts: pkg.scripts,
          } : undefined,
          detectedConfigs,
          mainLanguage: metadata?.language || (hasTsConfig ? 'TypeScript' : 'JavaScript'),
        },
      };
    }

    // -------------------------------------------------------------
    // 3. React Detection
    // -------------------------------------------------------------
    const isReactPackage = pkg?.name === 'react' || 'react' in allDeps || 'react-dom' in allDeps;
    if (isReactPackage) {
      let framework = 'React';
      if ('react-scripts' in allDeps) framework = 'Create React App';
      else if ('gatsby' in allDeps) framework = 'Gatsby';
      else if ('remix' in allDeps || '@remix-run/react' in allDeps) framework = 'Remix';

      return {
        projectType: 'React',
        framework,
        confidence: 0.95,
        details: {
          packageJson: pkg ? {
            name: pkg.name,
            version: pkg.version,
            dependencies: pkg.dependencies,
            devDependencies: pkg.devDependencies,
            scripts: pkg.scripts,
          } : undefined,
          detectedConfigs,
          mainLanguage: metadata?.language || (hasTsConfig ? 'TypeScript' : 'JavaScript'),
        },
      };
    }

    // -------------------------------------------------------------
    // 4. Node.js Detection (General Node apps)
    // -------------------------------------------------------------
    if (pkg || fileSet.has('package.json')) {
      let framework = 'Node.js';

      if ('express' in allDeps) framework = 'Express';
      else if ('@nestjs/core' in allDeps) framework = 'NestJS';
      else if ('fastify' in allDeps) framework = 'Fastify';
      else if ('koa' in allDeps) framework = 'Koa';
      else if ('hono' in allDeps) framework = 'Hono';
      else if ('electron' in allDeps) framework = 'Electron';

      return {
        projectType: 'Node.js',
        framework,
        confidence: 0.9,
        details: {
          packageJson: pkg ? {
            name: pkg.name,
            version: pkg.version,
            dependencies: pkg.dependencies,
            devDependencies: pkg.devDependencies,
            scripts: pkg.scripts,
          } : undefined,
          detectedConfigs,
          mainLanguage: metadata?.language || (hasTsConfig ? 'TypeScript' : 'JavaScript'),
        },
      };
    }

    // -------------------------------------------------------------
    // 5. Python Detection
    // -------------------------------------------------------------
    const hasPythonFiles = rootFiles.some(f => f.endsWith('.py'));
    const isPythonLang = metadata?.language?.toLowerCase() === 'python';

    if (hasRequirementsTxt || hasPyproject || hasPipfile || hasPythonFiles || isPythonLang) {
      let framework = 'Python';
      const pyConfigCombined = `${context.pythonConfigRaw || ''} ${rootFiles.join(' ')}`.toLowerCase();

      if (pyConfigCombined.includes('fastapi')) framework = 'FastAPI';
      else if (pyConfigCombined.includes('django') || fileSet.has('manage.py')) framework = 'Django';
      else if (pyConfigCombined.includes('flask')) framework = 'Flask';
      else if (pyConfigCombined.includes('streamlit')) framework = 'Streamlit';

      return {
        projectType: 'Python',
        framework,
        confidence: 0.9,
        details: {
          detectedConfigs,
          mainLanguage: 'Python',
        },
      };
    }

    // -------------------------------------------------------------
    // 6. Static HTML/CSS/JavaScript Detection
    // -------------------------------------------------------------
    const hasJsOrCss = rootFiles.some(f => f.endsWith('.js') || f.endsWith('.css'));
    if (hasIndexHtml || (metadata?.language === 'HTML' && (hasIndexHtml || hasJsOrCss))) {
      return {
        projectType: 'HTML/CSS/JavaScript',
        framework: 'Vanilla HTML/CSS/JS',
        confidence: 0.85,
        details: {
          detectedConfigs: hasIndexHtml ? ['index.html'] : [],
          mainLanguage: metadata?.language || 'HTML',
        },
      };
    }

    // -------------------------------------------------------------
    // 7. Unknown Fallback
    // -------------------------------------------------------------
    return {
      projectType: 'Unknown',
      framework: metadata?.language || 'Unknown',
      confidence: 0.0,
      details: {
        detectedConfigs,
        mainLanguage: metadata?.language || null,
      },
    };
  }
}
