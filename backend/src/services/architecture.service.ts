/**
 * RepoLens - Project Architecture & Visualization Service
 * Inspects directory layout, modules, and generates Mermaid architectural diagrams.
 */

import { ProjectArchitectureInfo, ArchitectureModule, ProjectType } from '@repolens/shared';

export interface ArchitectureContext {
  allFiles: string[];
  projectType: ProjectType;
  framework: string;
}

export class ArchitectureService {
  /**
   * Generates structural architecture metadata and Mermaid relationship diagram
   */
  public static analyze(context: ArchitectureContext): ProjectArchitectureInfo {
    const { allFiles, projectType, framework } = context;

    const configFiles: string[] = [];
    const entryPoints: string[] = [];
    const moduleMap = new Map<string, { role: string; fileCount: number }>();
    const directorySet = new Set<string>();

    for (const rawPath of allFiles) {
      const normalized = rawPath.replace(/\\/g, '/');
      const parts = normalized.split('/');
      const filename = parts[parts.length - 1];
      const lower = filename.toLowerCase();

      // Collect directories
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          directorySet.add(parts.slice(0, i).join('/'));
        }
      }

      // Detect Configuration Files
      if (
        lower === 'package.json' ||
        lower.startsWith('tsconfig') ||
        lower.startsWith('vite.config') ||
        lower.startsWith('next.config') ||
        lower.startsWith('webpack.config') ||
        lower === 'dockerfile' ||
        lower === 'docker-compose.yml' ||
        lower === 'requirements.txt' ||
        lower === 'pyproject.toml'
      ) {
        configFiles.push(normalized);
      }

      // Detect Entry Points
      if (
        lower === 'index.html' ||
        lower === 'index.ts' ||
        lower === 'index.js' ||
        lower === 'app.ts' ||
        lower === 'app.js' ||
        lower === 'main.ts' ||
        lower === 'main.py' ||
        lower === 'server.ts' ||
        lower === 'server.js'
      ) {
        entryPoints.push(normalized);
      }

      // Detect Major Modules from top-level or second-level directory
      if (parts.length >= 2) {
        const topDir = parts[0];
        let moduleKey = topDir;

        // If in src/ or app/, inspect subfolder
        if ((topDir === 'src' || topDir === 'app' || topDir === 'lib') && parts.length >= 3) {
          moduleKey = `${topDir}/${parts[1]}`;
        }

        const role = this.determineModuleRole(moduleKey);
        const existing = moduleMap.get(moduleKey);
        if (existing) {
          existing.fileCount++;
        } else {
          moduleMap.set(moduleKey, { role, fileCount: 1 });
        }
      }
    }

    // Format major modules list
    const majorModules: ArchitectureModule[] = Array.from(moduleMap.entries())
      .filter(([_, data]) => data.fileCount >= 1)
      .slice(0, 10)
      .map(([modPath, data]) => ({
        name: modPath.split('/').pop() || modPath,
        path: modPath,
        role: data.role,
        fileCount: data.fileCount,
      }));

    // Generate Mermaid diagram
    const mermaidDiagram = this.generateMermaidDiagram(projectType, framework, majorModules, entryPoints);

    return {
      majorModules,
      configFiles: Array.from(new Set(configFiles)),
      entryPoints: Array.from(new Set(entryPoints)),
      totalFilesCount: allFiles.length,
      totalDirectoriesCount: directorySet.size,
      mermaidDiagram,
    };
  }

  /**
   * Infers role of directory based on naming conventions
   */
  private static determineModuleRole(pathStr: string): string {
    const lower = pathStr.toLowerCase();
    if (lower.includes('route') || lower.includes('api')) return 'API Routing & Endpoints';
    if (lower.includes('controller')) return 'Request Handling & Controllers';
    if (lower.includes('service')) return 'Business Logic & Services';
    if (lower.includes('model') || lower.includes('entity')) return 'Data Models & Schemas';
    if (lower.includes('component')) return 'UI Components';
    if (lower.includes('view') || lower.includes('page')) return 'Pages & Views';
    if (lower.includes('test') || lower.includes('spec')) return 'Automated Tests';
    if (lower.includes('util') || lower.includes('helper')) return 'Utility Functions';
    if (lower.includes('middleware')) return 'Middlewares & Filters';
    if (lower.includes('style') || lower.includes('css')) return 'Styles & Theming';
    if (lower.includes('asset') || lower.includes('public')) return 'Static Assets';
    if (lower.includes('config')) return 'Configuration';
    if (lower.startsWith('src')) return 'Core Application Source';
    if (lower.startsWith('docs')) return 'Documentation';
    return 'Application Module';
  }

  /**
   * Generates standard Mermaid flowchart diagram syntax
   */
  private static generateMermaidDiagram(
    projectType: ProjectType,
    framework: string,
    modules: ArchitectureModule[],
    entryPoints: string[]
  ): string {
    const lines: string[] = ['graph TD'];
    const label = (value: string) => value.replace(/["\r\n]/g, ' ').trim();

    const entryLabel = label(entryPoints[0] || 'Entrypoint');
    lines.push(`  ENTRY["${entryLabel}"] --> APP["${label(framework || projectType)} Application"]`);

    modules.forEach((mod, idx) => {
      const id = `MOD_${idx}`;
      lines.push(`  APP --> ${id}["${label(mod.name)} (${label(mod.role)})"]`);
    });

    return lines.join('\n');
  }
}
