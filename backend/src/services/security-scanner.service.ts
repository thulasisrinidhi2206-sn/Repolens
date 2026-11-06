/**
 * RepoLens - Security & Secret Exposure Scanner Service
 * Detects accidentally committed secrets, unsafe configurations, and dangerous patterns.
 */

import { SecurityFinding, FindingSeverity } from '@repolens/shared';

export interface SecurityScannerContext {
  allFiles: string[];
  packageJsonRaw?: string | null;
  fileContents?: Map<string, string>; // path -> content
}

// Regex patterns to detect exposed credentials and sensitive files
const SENSITIVE_FILE_PATTERNS = [
  { pattern: /^\.env(\.local|\.production|\.staging)?$/i, severity: 'High' as FindingSeverity, title: 'Committed Environment File' },
  { pattern: /\.(pem|key|pkcs12|p12|id_rsa|id_ed25519)$/i, severity: 'Critical' as FindingSeverity, title: 'Private Cryptographic Key' },
  { pattern: /(id_rsa\.pub|id_dsa|authorized_keys)$/i, severity: 'High' as FindingSeverity, title: 'Committed SSH Key File' },
  { pattern: /(credentials\.json|service-account.*\.json)$/i, severity: 'Critical' as FindingSeverity, title: 'Cloud Service Account Key' },
];

export class SecurityScannerService {
  /**
   * Scans repository file paths and sample contents for security vulnerabilities
   */
  public static scan(context: SecurityScannerContext): {
    score: number;
    findings: SecurityFinding[];
    exposedSecretsCount: number;
  } {
    const { allFiles, packageJsonRaw, fileContents = new Map() } = context;
    const findings: SecurityFinding[] = [];
    let exposedSecretsCount = 0;

    // 1. Scan file paths for committed sensitive files
    for (const filePath of allFiles) {
      const normalized = filePath.replace(/\\/g, '/');
      const basename = normalized.split('/').pop() || '';

      for (const rule of SENSITIVE_FILE_PATTERNS) {
        if (rule.pattern.test(basename) || rule.pattern.test(normalized)) {
          exposedSecretsCount++;
          findings.push({
            id: `sec-file-${findings.length + 1}`,
            title: rule.title,
            severity: rule.severity,
            category: 'secret_exposure',
            description: `Potentially sensitive file '${normalized}' was committed to version control.`,
            file: normalized,
            recommendation: `Add '${basename}' to your .gitignore and revoke any credentials stored in it immediately.`,
            isConfirmed: true,
          });
        }
      }
    }

    // 2. Scan package.json for unsafe scripts or vulnerable patterns
    if (packageJsonRaw) {
      try {
        const pkg = JSON.parse(packageJsonRaw);
        if (pkg.scripts) {
          for (const [scriptName, cmd] of Object.entries(pkg.scripts)) {
            if (typeof cmd === 'string') {
              if (cmd.includes('curl ') && (cmd.includes('| sh') || cmd.includes('| bash'))) {
                findings.push({
                  id: `sec-script-${findings.length + 1}`,
                  title: 'Unsafe Remote Execution in npm Script',
                  severity: 'High',
                  category: 'unsafe_config',
                  description: `Script '${scriptName}' executes remote shell scripts directly via curl/bash pipe.`,
                  file: 'package.json',
                  recommendation: 'Download, verify SHA checksum, and inspect scripts before executing them.',
                  isConfirmed: true,
                });
              }

              if (cmd.includes('--ignore-scripts=false')) {
                findings.push({
                  id: `sec-script-${findings.length + 1}`,
                  title: 'Explicit Script Execution Flag',
                  severity: 'Low',
                  category: 'unsafe_config',
                  description: `Script '${scriptName}' enables automatic execution of third-party package lifecycle scripts.`,
                  file: 'package.json',
                  recommendation: 'Use default npm configuration or verify package authors.',
                  isConfirmed: false,
                });
              }
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }

    // 3. Scan file contents for secret patterns (API keys, tokens, etc.)
    for (const [filePath, content] of fileContents.entries()) {
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // GitHub Token Pattern: ghp_[A-Za-z0-9]{36} or github_pat_[A-Za-z0-9_]{82}
        if (/ghp_[A-Za-z0-9]{30,}/i.test(line) || /github_pat_[A-Za-z0-9_]{50,}/i.test(line)) {
          exposedSecretsCount++;
          findings.push({
            id: `sec-token-${findings.length + 1}`,
            title: 'Exposed GitHub Personal Access Token',
            severity: 'Critical',
            category: 'secret_exposure',
            description: `Potential active GitHub Personal Access Token discovered on line ${i + 1} of ${filePath}. Value has been redacted.`,
            file: filePath,
            line: i + 1,
            recommendation: 'Revoke this token immediately on GitHub Settings and use environment variables (process.env).',
            isConfirmed: true,
          });
        }

        // AWS Access Key ID Pattern: AKIA[0-9A-Z]{16}
        if (/AKIA[0-9A-Z]{16}/.test(line)) {
          exposedSecretsCount++;
          findings.push({
            id: `sec-aws-${findings.length + 1}`,
            title: 'Exposed AWS Access Key ID',
            severity: 'Critical',
            category: 'secret_exposure',
            description: `Potential AWS Access Key ID detected on line ${i + 1} of ${filePath}.`,
            file: filePath,
            line: i + 1,
            recommendation: 'Rotate the AWS IAM key immediately and inject credentials via AWS IAM Roles or environment secrets.',
            isConfirmed: true,
          });
        }

        // Generic Private Key Header
        if (/-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/.test(line)) {
          exposedSecretsCount++;
          findings.push({
            id: `sec-privkey-${findings.length + 1}`,
            title: 'Exposed Private Key Block',
            severity: 'Critical',
            category: 'secret_exposure',
            description: `Cryptographic private key block found in ${filePath} on line ${i + 1}.`,
            file: filePath,
            line: i + 1,
            recommendation: 'Remove private keys from repository history and revoke associated certificates.',
            isConfirmed: true,
          });
        }

        // Unsafe eval() in JavaScript/TypeScript
        if (/\beval\s*\(/.test(line) && !filePath.includes('test') && !filePath.includes('spec')) {
          findings.push({
            id: `sec-eval-${findings.length + 1}`,
            title: 'Use of eval() Detected',
            severity: 'Medium',
            category: 'injection_risk',
            description: `Dynamic code execution via eval() detected on line ${i + 1} of ${filePath}.`,
            file: filePath,
            line: i + 1,
            recommendation: 'Refactor code to use JSON.parse() or structured logic instead of eval().',
            isConfirmed: false,
          });
        }
      }
    }

    // Calculate security score out of 100
    let score = 100;
    for (const finding of findings) {
      if (finding.severity === 'Critical') score -= 30;
      else if (finding.severity === 'High') score -= 15;
      else if (finding.severity === 'Medium') score -= 10;
      else if (finding.severity === 'Low') score -= 5;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      findings,
      exposedSecretsCount,
    };
  }
}
