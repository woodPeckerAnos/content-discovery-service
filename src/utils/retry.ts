export async function retryOnce<T>(
  fn: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
): Promise<{ result: T; retried: boolean }> {
  const first = await fn();
  if (!shouldRetry(first)) {
    return { result: first, retried: false };
  }
  const second = await fn();
  return { result: second, retried: true };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
