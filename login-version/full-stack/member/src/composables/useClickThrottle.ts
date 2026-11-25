import { onBeforeUnmount } from 'vue'

interface ClickThrottleOptions {
  wait?: number
  blockDuringExecution?: boolean
}

export function useClickThrottle(defaultWait = 800) {
  const lastTriggeredAt = new Map<string, number>()
  const runningKeys = new Set<string>()

  const runThrottled = async <T>(
    key: string,
    action: () => Promise<T> | T,
    options: ClickThrottleOptions = {},
  ) => {
    const wait = Math.max(0, Number(options.wait ?? defaultWait) || 0)
    const now = Date.now()
    const lastTime = lastTriggeredAt.get(key) || 0
    if (wait > 0 && now - lastTime < wait) return

    const shouldBlockDuringExecution = options.blockDuringExecution !== false
    if (shouldBlockDuringExecution && runningKeys.has(key)) return

    lastTriggeredAt.set(key, now)
    if (shouldBlockDuringExecution) runningKeys.add(key)

    try {
      return await action()
    } finally {
      if (shouldBlockDuringExecution) runningKeys.delete(key)
    }
  }

  onBeforeUnmount(() => {
    lastTriggeredAt.clear()
    runningKeys.clear()
  })

  return {
    runThrottled,
    isActionRunning: (key: string) => runningKeys.has(key),
  }
}
