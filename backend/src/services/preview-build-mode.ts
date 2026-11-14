/**
 * Determines whether a Vite repository already contains deployable production output.
 * Only dist/index.html is considered; source files are never executed by the backend.
 */
export function hasPrebuiltViteOutput(filePaths: string[]): boolean {
  return filePaths.some(filePath =>
    filePath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase() === 'dist/index.html'
  );
}
