import crypto from 'crypto';
import { AnalyzeRepoData } from '@repolens/shared';
import { GitHubUrlValidatorService, ValidationResult } from './validator.service';

export class AnalyzeService {
  /**
   * Accepts and validates a repository analysis request
   */
  public analyzeRepository(rawUrl: string): { success: true; data: AnalyzeRepoData } | { success: false; error: string } {
    const validation: ValidationResult = GitHubUrlValidatorService.validateAndParse(rawUrl);

    if (!validation.isValid || !validation.repo || !validation.normalizedUrl) {
      return {
        success: false,
        error: validation.error || 'Invalid GitHub repository URL provided.'
      };
    }

    const analysisSessionId = crypto.randomUUID();

    const data: AnalyzeRepoData = {
      id: analysisSessionId,
      repo: validation.repo,
      status: 'idle',
      repositoryUrl: validation.normalizedUrl,
      receivedAt: new Date().toISOString(),
      message: `Repository analysis request accepted for ${validation.repo.owner}/${validation.repo.repo}.`
    };

    return {
      success: true,
      data
    };
  }
}

export const analyzeService = new AnalyzeService();
