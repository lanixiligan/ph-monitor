// A download that is tried once more when it fails.
// Feeds sometimes answer "busy" or drop the connection for a moment; one
// more try a little later usually works.

/** The shape of `fetch`, so a test can pass in a pretend one. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type RetryOptions = {
  /** The function that does the download. Default: the real `fetch`. */
  fetcher?: Fetcher; // `?` means the field may be left out
  /** How long to wait before the second try. */
  pauseMs?: number;
};

const DEFAULT_PAUSE_MS = 5_000;

/**
 * Downloads `url`. If the server answers with an error or cannot be reached,
 * waits and tries exactly once more. Throws if the second try fails too.
 * `init` is a function so every try gets its own fresh timeout.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit | (() => RequestInit),
  options: RetryOptions = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const pauseMs = options.pauseMs ?? DEFAULT_PAUSE_MS;
  let lastError = new Error('request failed');

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (attempt === 2 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    try {
      const response = await fetcher(url, typeof init === 'function' ? init() : init);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError;
}
