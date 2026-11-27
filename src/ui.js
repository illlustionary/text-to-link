/**
 * 页面级 UI：全局样式注入与轻量 toast。
 */
import cssText from './style.css'

let styleInjected = false
let toastEl = null
let toastTimer = 0

/** 注入全局样式，只注入一次 */
export function ensureStyle() {
  if (styleInjected) return
  if (typeof document === 'undefined') return

  // 页面里可能已经存在（例如脚本被重复执行），直接复用
  if (document.getElementById('t2l-style')) {
    styleInjected = true
    return
  }

  const parent = document.head || document.documentElement
  if (!parent) return

  const style = document.createElement('style')
  style.id = 't2l-style'
  style.setAttribute('data-t2l-ui', '')
  style.textContent = cssText
  parent.appendChild(style)
  styleInjected = true
}

/** 底部居中提示，单例复用，重复调用会重置计时器 */
export function showToast(text, duration = 2600) {
  if (typeof document === 'undefined' || !document.body) return

  ensureStyle()

  if (!toastEl || !toastEl.isConnected) {
    toastEl = document.createElement('div')
    toastEl.className = 't2l-toast'
    toastEl.setAttribute('data-t2l-ui', '')
    toastEl.setAttribute('role', 'status')
    toastEl.setAttribute('aria-live', 'polite')
    document.body.appendChild(toastEl)
  }

  toastEl.textContent = text

  // 强制一次重排，保证连续提示时过渡动画仍会触发
  void toastEl.offsetWidth
  toastEl.classList.add('t2l-toast--show')

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastTimer = 0
    if (toastEl) toastEl.classList.remove('t2l-toast--show')
  }, Math.max(0, Number(duration) || 0))
}
