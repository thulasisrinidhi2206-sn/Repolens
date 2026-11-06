/**
 * RepoLens - AI & Static Code Review Service
 * Evaluates repository source code for bugs, code smells, and maintainability issues.
 * Uses Google Gemini API if GEMINI_API_KEY is configured, with seamless fallback to static analysis.
 */

import { CodeReviewFinding, CodeReviewReport, FindingSeverity } from '@repolens/shared';

export interface CodeReviewContext {
  allFiles: string[];
  fileContents?: Map<string, string>; // path -> content
  projectType: string;
  framework: string;
}

export class AiReviewService {
  /**
   * Performs code review using Gemini AI (if configured) or deterministic static analyzer
   */
  public static async review(context: CodeReviewContext): Promise<CodeReviewReport> {
    const geminiKey = process.env.GEMINI_API_KEY;

    // If GEMINI_API_KEY is present and sample contents exist, attempt Gemini AI review
    if (geminiKey && geminiKey.trim().length > 0 && context.fileContents && context.fileContents.size > 0) {
      try {
        const aiReport = await this.performGeminiReview(context, geminiKey.trim());
        if (aiReport) {
          return aiReport;
        }
      } catch (err: unknown) {
        console.warn('[AiReviewService] Gemini API review failed or timed out. Falling back to static analyzer:', err);
      }
    }

    // Default: Deterministic static code review
    return this.performStaticReview(context);
  }

  /**
   * Calls Google Gemini API with timeout and structured response extraction
   */
  private static async performGeminiReview(context: CodeReviewContext, apiKey: string): Promise<CodeReviewReport | null> {
    const filesToReview: { path: string; snippet: string }[] = [];

    // Collect up to 4 significant files (capped at 4000 characters each to avoid token exhaustion)
    for (const [path, content] of (context.fileContents || new Map()).entries()) {
      if (filesToReview.length >= 4) break;
      const lower = path.toLowerCase();
      if (
        lower.endsWith('.ts') ||
        lower.endsWith('.tsx') ||
        lower.endsWith('.js') ||
        lower.endsWith('.py') ||
        lower.endsWith('.html')
      ) {
        filesToReview.push({
          path,
          snippet: content.slice(0, 4000),
        });
      }
    }

    if (filesToReview.length === 0) return null;

    const prompt = `You are a senior software engineer performing an automated code review for a ${context.framework} project.
Analyze the following source files and return a JSON array of up to 5 potential bugs, code smells, or maintainability issues.

Files:
${filesToReview.map(f => `--- File: ${f.path} ---\n${f.snippet}`).join('\n\n')}

Return strictly valid JSON matching this schema:
{
  "summary": "Brief 1-2 sentence overall review summary",
  "findings": [
    {
      "id": "review-1",
      "title": "Short title",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "file": "path/to/file",
      "line": 10,
      "category": "bug" | "code_smell" | "maintainability" | "performance",
      "explanation": "Detailed explanation of why this is a concern",
      "codeSnippet": "problematic line of code",
      "suggestedFix": "corrected code snippet"
    }
  ]
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      // Use standard v1beta Gemini endpoint with gemini-2.5-flash or gemini-1.5-flash
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      const json: any = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);
      const findings: CodeReviewFinding[] = (parsed.findings || []).map((f: any, idx: number) => ({
        id: `ai-${idx + 1}`,
        title: f.title || 'Code Improvement Suggestion',
        severity: (['Critical', 'High', 'Medium', 'Low'].includes(f.severity) ? f.severity : 'Medium') as FindingSeverity,
        file: f.file || filesToReview[0]?.path || 'source',
        line: typeof f.line === 'number' ? f.line : undefined,
        category: f.category || 'maintainability',
        explanation: f.explanation || 'Potential improvement identified by Gemini AI model.',
        codeSnippet: f.codeSnippet || undefined,
        suggestedFix: f.suggestedFix || undefined,
        source: 'ai',
      }));

      return {
        isAiPowered: true,
        engine: 'Google Gemini 2.5 Flash',
        summary: parsed.summary || 'AI code review completed using Google Gemini model.',
        findings,
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * Deterministic static code analyzer identifying common bugs, anti-patterns, and code smells
   */
  private static performStaticReview(context: CodeReviewContext): CodeReviewReport {
    const findings: CodeReviewFinding[] = [];
    const fileContents = context.fileContents || new Map();

    for (const [filePath, content] of fileContents.entries()) {
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Console.log in production code
        if (
          /\bconsole\.log\s*\(/.test(line) &&
          !filePath.includes('test') &&
          !filePath.includes('spec') &&
          !filePath.includes('scripts')
        ) {
          if (findings.filter(f => f.category === 'code_smell').length < 3) {
            findings.push({
              id: `static-${findings.length + 1}`,
              title: 'Production Console Logging',
              severity: 'Low',
              file: filePath,
              line: lineNum,
              category: 'code_smell',
              explanation: 'Direct console.log calls in production code can degrade performance and leak internal debug logs.',
              codeSnippet: line.trim(),
              suggestedFix: '// Use a structured logger or remove debug statement\n// logger.debug(...)',
              source: 'static_analyzer',
            });
          }
        }

        // 2. Unhandled Promise / Empty Catch block
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || /catch\s*\{\s*\}/.test(line)) {
          findings.push({
            id: `static-${findings.length + 1}`,
            title: 'Empty Exception Catch Block',
            severity: 'High',
            file: filePath,
            line: lineNum,
            category: 'bug',
            explanation: 'Swallowing errors in an empty catch block masks fatal failures and makes debugging difficult.',
            codeSnippet: line.trim(),
            suggestedFix: 'catch (err) {\n  console.error("Operation failed:", err);\n  throw err;\n}',
            source: 'static_analyzer',
          });
        }

        // 3. React dangerouslySetInnerHTML
        if (/dangerouslySetInnerHTML/.test(line)) {
          findings.push({
            id: `static-${findings.length + 1}`,
            title: 'Use of dangerouslySetInnerHTML',
            severity: 'High',
            file: filePath,
            line: lineNum,
            category: 'security',
            explanation: 'Direct HTML injection can lead to Cross-Site Scripting (XSS) if input is not sanitized with DOMPurify.',
            codeSnippet: line.trim(),
            suggestedFix: 'import DOMPurify from "dompurify";\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cleanHtml) }} />',
            source: 'static_analyzer',
          });
        }

        // 4. Loose equality (== instead of ===) in TypeScript/JavaScript
        if (/[^!=]==[^=]/.test(line) && !line.includes('typeof') && !line.includes('//')) {
          if (findings.filter(f => f.title.includes('Equality')).length === 0) {
            findings.push({
              id: `static-${findings.length + 1}`,
              title: 'Loose Equality Operator (==)',
              severity: 'Low',
              file: filePath,
              line: lineNum,
              category: 'code_smell',
              explanation: 'Using loose equality (==) allows implicit type coercion, leading to subtle runtime bugs. Prefer strict equality (===).',
              codeSnippet: line.trim(),
              suggestedFix: line.trim().replace(/==/g, '==='),
              source: 'static_analyzer',
            });
          }
        }
      }
    }

    // Heuristic findings based on architecture if few file contents were fetched
    if (findings.length === 0) {
      findings.push({
        id: 'static-clean',
        title: 'Static Code Inspection Clean',
        severity: 'Info',
        file: context.allFiles[0] || 'repository',
        category: 'maintainability',
        explanation: 'No obvious syntax errors, empty catch blocks, or dangerous injection patterns detected in sampled files.',
        source: 'static_analyzer',
      });
    }

    return {
      isAiPowered: false,
      engine: 'RepoLens Static Code Analyzer',
      summary: `Automated code review evaluated source files and identified ${findings.length} item(s) for maintainability and code quality improvement.`,
      findings,
    };
  }
}
