import { GitHubUrlValidatorService } from './validator.service';
import { gitHubService, GitHubApiError } from './github.service';

export interface IssueCodeMatch {
  path: string;
  relevance: number;
  reason: string;
  excerpt: string;
  startLine: number;
  endLine: number;
  url: string;
}
export interface IssueNavigatorData {
  repository: string;
  branch: string;
  issue: { number: number; title: string; body: string; state: string; url: string; labels: string[] };
  summary: string;
  matches: IssueCodeMatch[];
  investigationSteps: string[];
  filesInspected: number;
  engine: 'RepoLens Issue Evidence';
}
const EXCLUDED = new Set(['.git','node_modules','vendor','dist','build','coverage','.next','.nuxt','.output','target','out','generated']);
const ALLOWED = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|java|kt|rs|rb|php|cs|cpp|h|css|scss|html|sql|json|ya?ml|md|mdx)$/i;
const STOP = new Set(['the','and','for','with','from','that','this','when','then','have','does','what','where','which','into','after','before','there','their','issue','error','bug','not','but','are','was','were','has','had','will','would','could','should','can','please','using','used','user','users']);
function tokens(value: string): string[] {
  return Array.from(new Set((value.toLowerCase().match(/[a-z][a-z0-9_./-]{2,}/g) || [])
    .map(x => x.replace(/^[./_-]+|[./_-]+$/g, '')).filter(x => x.length > 2 && !STOP.has(x))));
}
function safePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  if (normalized.split('/').some(part => EXCLUDED.has(part))) return false;
  if (/(^|\/)(\.env($|\.)|id_rsa|id_ed25519|.*\.pem$|.*\.key$|credentials?\.|secrets?\.)/i.test(normalized)) return false;
  if (/\.(lock|map|min\.(js|css)|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip)$/i.test(normalized)) return false;
  return ALLOWED.test(normalized);
}
function scorePath(path: string, words: string[]): number {
  const p = path.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (p.includes(word)) score += 8;
    for (const part of word.split(/[./_-]/)) if (part.length > 2 && p.includes(part)) score += 2;
  }
  if (/(test|spec)\.[^.]+$/i.test(p)) score += 2;
  if (/(src|app|lib|server|client)\//i.test(p)) score += 1;
  return score;
}
function issueSteps(body: string, matches: IssueCodeMatch[]): string[] {
  const steps: string[] = [];
  if (/stack trace| at .*\(.*:\d+:\d+\)|\w+error:/i.test(body)) steps.push('Start with the stack-trace location and compare it with the matching source evidence.');
  if (/api|request|http|endpoint|fetch|axios/i.test(body)) steps.push('Trace the request from the calling component through the API client to the server handler.');
  if (/login|auth|token|session|password/i.test(body)) steps.push('Check authentication state, response handling, token/session updates, and error paths.');
  if (/ui|button|click|render|display|screen/i.test(body)) steps.push('Reproduce the UI action and inspect event handlers, state updates, and browser-console errors.');
  if (!steps.length) steps.push('Reproduce the reported behavior and identify the first source location where actual behavior differs from expected behavior.');
  if (matches.some(m => /(^|\/)(test|tests|__tests__|spec)\//i.test(m.path) || /\.(test|spec)\./i.test(m.path))) {
    steps.push('Run the related test files shown in the matches and add a regression test for the reported scenario.');
  } else {
    steps.push('No obvious related test file was ranked; check the project test configuration and add a focused regression test.');
  }
  steps.push('Treat the ranked files as investigation leads, not confirmed root causes; verify each hypothesis before changing code.');
  return steps.slice(0, 5);
}

export class IssueNavigatorService {
  public async investigate(repositoryUrl: string, issueNumber: number): Promise<{success:boolean;statusCode:number;data?:IssueNavigatorData;error?:string}> {
    const validation = GitHubUrlValidatorService.validateAndParse(repositoryUrl);
    if (!validation.isValid || !validation.repo) return { success:false, statusCode:400, error:validation.error || 'Enter a valid public GitHub repository URL.' };
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) return { success:false, statusCode:400, error:'issueNumber must be a positive integer.' };
    try {
      const {owner, repo} = validation.repo;
      const metadata = await gitHubService.getRepositoryMetadata(owner, repo);
      const branch = validation.repo.branch || metadata.defaultBranch;
      const issue = await gitHubService.getIssue(owner, repo, issueNumber);
      if (issue.isPullRequest) return {success:false,statusCode:422,error:'That number belongs to a pull request, not a GitHub issue.'};
      const tree = (await gitHubService.getGitTree(owner, repo, branch, true)).slice(0, 10000);
      const issueText = [issue.title, issue.body, ...issue.labels].join('\n');
      const words = tokens(issueText);
      const candidates = tree.filter(item => item.type === 'blob' && (item.size || 0) <= 100000 && safePath(item.path))
        .map(item => ({path:item.path, score:scorePath(item.path, words)}))
        .sort((a,b) => b.score-a.score || a.path.localeCompare(b.path))
        .slice(0, 18);
      const fetched = await Promise.all(candidates.map(async candidate => ({
        path:candidate.path, pathScore:candidate.score,
        content: await gitHubService.getFileRawContent(owner, repo, candidate.path, branch)
      })));
      const matches: IssueCodeMatch[] = [];
      for (const file of fetched) {
        if (!file.content) continue;
        const lines = file.content.split(/\r?\n/);
        const ranked = lines.map((line,index) => {
          const lower=line.toLowerCase();
          const score=words.reduce((sum,word)=>sum+(lower.includes(word)?2:0),0);
          return {line,index,score};
        }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.index-b.index);
        const best = ranked[0];
        const relevance = Math.min(99, Math.max(1, file.pathScore + (best?.score || 0)));
        const reason = file.pathScore > 0 ? 'Path or filename matches issue terminology' : 'Source content contains matching issue terminology';
        const start = best ? Math.max(0,best.index-2) : 0;
        const end = best ? Math.min(lines.length-1,best.index+3) : Math.min(lines.length-1,5);
        matches.push({
          path:file.path, relevance, reason,
          excerpt:lines.slice(start,end+1).join('\n').slice(0,1800),
          startLine:start+1, endLine:end+1,
          url:'https://github.com/'+owner+'/'+repo+'/blob/'+encodeURIComponent(branch).replace(/%2F/g,'/')+'/'+file.path+'#L'+(start+1)
        });
      }
      matches.sort((a,b)=>b.relevance-a.relevance || a.path.localeCompare(b.path));
      const selected=matches.slice(0,8);
      if (!selected.length) return {success:false,statusCode:422,error:'No readable source files could be matched to this issue. Try a repository with supported text/source files.'};
      return {success:true,statusCode:200,data:{
        repository:metadata.fullName, branch,
        issue:{number:issue.number,title:issue.title,body:issue.body.slice(0,5000),state:issue.state,url:issue.htmlUrl,labels:issue.labels},
        summary:'RepoLens ranked '+selected.length+' candidate files using issue wording, filenames, and source-line matches. These are investigation leads, not verified root causes.',
        matches:selected, investigationSteps:issueSteps(issue.body,selected),
        filesInspected:fetched.filter(x=>x.content).length, engine:'RepoLens Issue Evidence'
      }};
    } catch(error) {
      if(error instanceof GitHubApiError) return {success:false,statusCode:error.statusCode,error:error.message};
      console.error('[IssueNavigatorService] Investigation failed:',error);
      return {success:false,statusCode:500,error:'Unable to investigate this issue right now. Please try again.'};
    }
  }
}
export const issueNavigatorService = new IssueNavigatorService();
