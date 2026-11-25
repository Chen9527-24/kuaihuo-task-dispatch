import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 测试
import 'vant/es/toast/style'
import App from './App.vue'
import router from './router'
import '@/styles/index.css'
import TopNav from '@/components/TopNav.vue'
import { initH5DebugPanel, recordH5Debug } from '@/services/debug'

const setVh = () => {
  const vh = window.innerHeight * 0.01
  document.documentElement.style.setProperty('--vh', `${vh}px`)
}
setVh()
initH5DebugPanel()
router.afterEach((to, from) => {
  initH5DebugPanel()
  recordH5Debug('router:after-each', {
    from: from.fullPath,
    to: to.fullPath,
    href: window.location.href,
  })
})
window.addEventListener('resize', setVh)
window.addEventListener('orientationchange', setVh)

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.component('TopNav', TopNav)
app.mount('#app')
