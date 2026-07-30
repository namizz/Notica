const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const RENDER_WAKEUP_ENABLED =
  process.env.NEXT_PUBLIC_RENDER?.toLowerCase() === 'true';

const READY_CACHE_MS = 60_000;
const WAKEUP_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;

let wakeupPromise: Promise<void> | null = null;
let lastReadyAt = 0;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function probeApi() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function wakeApi() {
  if (!RENDER_WAKEUP_ENABLED) {
    return;
  }

  if (Date.now() - lastReadyAt < READY_CACHE_MS) {
    return;
  }

  if (wakeupPromise) {
    return wakeupPromise;
  }

  wakeupPromise = (async () => {
    const deadline = Date.now() + WAKEUP_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        await probeApi();
        lastReadyAt = Date.now();
        return;
      } catch {
        if (Date.now() + RETRY_DELAY_MS >= deadline) {
          break;
        }
        await delay(RETRY_DELAY_MS);
      }
    }

    throw new Error('This is taking longer than expected. Please try again.');
  })();

  try {
    await wakeupPromise;
  } finally {
    wakeupPromise = null;
  }
}
