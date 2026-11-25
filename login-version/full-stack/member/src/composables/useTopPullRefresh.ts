import { nextTick, onMounted, onUnmounted, ref } from 'vue'

type UseTopPullRefreshOptions = {
  /** 是否允许当前页面/当前 Tab 使用下拉刷新 */
  active?: () => boolean
  /** 业务侧临时禁用，例如正在加载更多 */
  disabled?: () => boolean
  /** 距离顶部多少像素内才认为已经到达初始位置 */
  topThreshold?: number
  /** 本次手势没有真正触发刷新时，延迟重置下拉组件，避免下拉头残留 */
  idleResetDelay?: number
}

function getScrollTop() {
  if (typeof window === 'undefined') return 0
  return Math.max(
    window.scrollY || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0,
  )
}

function getTouchY(event: TouchEvent) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  return typeof touch?.clientY === 'number' ? touch.clientY : 0
}

export function useTopPullRefresh(options: UseTopPullRefreshOptions = {}) {
  const canPullRefresh = ref(false)
  const pullRefreshKey = ref(0)
  const threshold = Math.max(0, Number(options.topThreshold ?? 2) || 0)
  const idleResetDelay = Math.max(80, Number(options.idleResetDelay ?? 180) || 180)

  let touchStartY = 0
  let touchStartedAtTop = false
  let hasPullDownGesture = false
  let gestureLocked = false
  let resetTimer: number | undefined

  const isEnabledByContext = () => {
    const active = options.active ? options.active() : true
    const disabled = options.disabled ? options.disabled() : false
    return active && !disabled
  }

  const updatePullRefreshState = () => {
    // 关键：如果本次手势不是从页面顶部开始，即使中途滚到顶部，也不允许 Vant PullRefresh 接管。
    // 否则会出现 Tab/内容被拉出位移，但因为手势起点不在顶部而不会真正触发刷新。
    canPullRefresh.value = !gestureLocked && isEnabledByContext() && getScrollTop() <= threshold
  }

  const clearResetTimer = () => {
    if (resetTimer) {
      window.clearTimeout(resetTimer)
      resetTimer = undefined
    }
  }

  const resetIdlePullRefresh = () => {
    clearResetTimer()
    pullRefreshKey.value += 1
    hasPullDownGesture = false
    touchStartedAtTop = false
    touchStartY = 0
    gestureLocked = false
    nextTick(updatePullRefreshState)
  }

  const preparePullRefresh = (event?: TouchEvent) => {
    clearResetTimer()
    const enabled = isEnabledByContext()
    const atTop = getScrollTop() <= threshold
    gestureLocked = !enabled || !atTop
    canPullRefresh.value = enabled && atTop
    touchStartY = event ? getTouchY(event) : 0
    touchStartedAtTop = enabled && atTop
    hasPullDownGesture = false
  }

  const handlePullMove = (event: TouchEvent) => {
    if (gestureLocked || !touchStartedAtTop) return
    const deltaY = getTouchY(event) - touchStartY
    if (deltaY > 8) hasPullDownGesture = true
  }

  const handlePullEnd = (isRefreshing?: () => boolean) => {
    if (gestureLocked || !touchStartedAtTop || !hasPullDownGesture) {
      gestureLocked = false
      touchStartedAtTop = false
      hasPullDownGesture = false
      nextTick(updatePullRefreshState)
      return
    }

    resetTimer = window.setTimeout(() => {
      // 如果已经进入真实刷新态，交给业务刷新完成后的 v-model 回弹处理；
      // 如果只是拉出刷新头后又推回去再松手，强制重建 PullRefresh，避免提示区残留成页面内容。
      if (!isRefreshing?.()) resetIdlePullRefresh()
      else {
        gestureLocked = false
        nextTick(updatePullRefreshState)
      }
    }, idleResetDelay)
  }

  onMounted(() => {
    updatePullRefreshState()
    window.addEventListener('scroll', updatePullRefreshState, { passive: true })
    window.addEventListener('resize', updatePullRefreshState, { passive: true })
    window.addEventListener('orientationchange', updatePullRefreshState, { passive: true })
  })

  onUnmounted(() => {
    clearResetTimer()
    window.removeEventListener('scroll', updatePullRefreshState)
    window.removeEventListener('resize', updatePullRefreshState)
    window.removeEventListener('orientationchange', updatePullRefreshState)
  })

  return {
    canPullRefresh,
    pullRefreshKey,
    preparePullRefresh,
    handlePullMove,
    handlePullEnd,
    updatePullRefreshState,
  }
}
