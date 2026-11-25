import * as dailyTasksApi from '@/api/modules/dailyTasks';

const ACCESS_REFRESH_SAFETY_MS = 30_000;
const MAX_CONCURRENT_MEDIA_REQUESTS = 4;

type CachedMediaAccess = dailyTasksApi.DailyTaskOrderFileAccess & {
  cachedAt: number;
};

type AccessRequest = {
  taskId: string;
  participantId: string;
  fileId: string;
  variant: 'thumbnail' | 'original';
};

const accessCache = new Map<string, CachedMediaAccess>();
const accessInflight = new Map<string, Promise<dailyTasksApi.DailyTaskOrderFileAccess>>();
const requestQueue: Array<() => void> = [];
let activeRequestCount = 0;

export async function getTaskOrderMediaAccess(
  params: AccessRequest,
  options: { force?: boolean } = {}
): Promise<dailyTasksApi.DailyTaskOrderFileAccess> {
  const key = buildAccessCacheKey(params);
  const cached = accessCache.get(key);
  if (!options.force && cached && isAccessUsable(cached)) {
    return cached;
  }

  const inflight = accessInflight.get(key);
  if (inflight) return inflight;

  const requestTask = enqueueRequest(async () => {
    const access = await dailyTasksApi.getDailyTaskOrderFileAccess(
      params.taskId,
      params.participantId,
      params.fileId,
      params.variant
    );
    accessCache.set(key, { ...access, cachedAt: Date.now() });
    return access;
  });

  accessInflight.set(key, requestTask);
  try {
    return await requestTask;
  } finally {
    accessInflight.delete(key);
  }
}

export function clearTaskOrderMediaAccessCache(params?: Partial<AccessRequest>) {
  if (!params) {
    accessCache.clear();
    return;
  }

  for (const key of accessCache.keys()) {
    const [taskId, participantId, fileId, variant] = key.split('|');
    if (params.taskId && params.taskId !== taskId) continue;
    if (params.participantId && params.participantId !== participantId) continue;
    if (params.fileId && params.fileId !== fileId) continue;
    if (params.variant && params.variant !== variant) continue;
    accessCache.delete(key);
  }
}

function buildAccessCacheKey(params: AccessRequest) {
  return [params.taskId, params.participantId, params.fileId, params.variant].join('|');
}

function isAccessUsable(access: CachedMediaAccess) {
  if (!access.expiresAt) return true;
  const expiresAt = Date.parse(access.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + ACCESS_REFRESH_SAFETY_MS;
}

function enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequestCount += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeRequestCount = Math.max(0, activeRequestCount - 1);
          const next = requestQueue.shift();
          if (next) next();
        });
    };

    if (activeRequestCount < MAX_CONCURRENT_MEDIA_REQUESTS) {
      run();
      return;
    }

    requestQueue.push(run);
  });
}
