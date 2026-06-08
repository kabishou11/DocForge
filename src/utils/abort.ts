export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { name?: unknown };
  return maybeError.name === 'AbortError';
}
