/**
 * 手动触发：单击 / 双击 / 中键转换，以及页面右键菜单。
 * 所有监听都注册在 document 捕获阶段，事件发生时读取最新设置，设置变化无需重装。
 */
import {
  convertAtPoint,
  convertSelection,
  getTextNodeAtPoint,
  getSelectedTextInfo,
  isSkippedElement,
} from './converter.js'
import { showToast } from './ui.js'

const MENU_CSS = `
:host {
  all: initial;
}
.menu {
  position: absolute;
  left: 0;
  top: 0;
  box-sizing: border-box;
  min-width: 180px;
  max-width: 320px;
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: #ffffff;
  color: #1f2328;
  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.12);
  user-select: none;
  -webkit-user-select: none;
}
.item {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.item + .item {
  margin-top: 1px;
}
.item:hover,
.item:focus {
  background: rgba(0, 0, 0, 0.07);
  outline: none;
}
.item:active {
  background: rgba(0, 0, 0, 0.12);
}
@media (prefers-color-scheme: dark) {
  .menu {
    border-color: rgba(255, 255, 255, 0.1);
    background: #1f2328;
    color: #e6edf3;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
  }
  .item:hover,
  .item:focus {
    background: rgba(255, 255, 255, 0.1);
  }
  .item:active {
    background: rgba(255, 255, 255, 0.16);
  }
}
`

// 单击延迟，用来和双击区分
const CLICK_DELAY = 260
// 位移平方阈值，超过视为拖动（5px）
const DRAG_THRESHOLD_SQ = 25
const MENU_GAP = 8
const TOAST_DURATION = 1800

/**
 * 安装手动触发与右键菜单。
 * @param {{ getSettings: () => object, detect: Function }} deps
 * @returns {() => void} dispose
 */
export function installManualTriggers({ getSettings, detect } = {}) {
  if (typeof getSettings !== 'function' || typeof detect !== 'function') {
    return () => {}
  }

  let clickTimer = 0
  let pointerDown = null
  let middleDown = false
  let menuState = null
  const disposers = []

  function safe(handler) {
    return function wrapped(event) {
      try {
        return handler(event)
      } catch {
        return undefined
      }
    }
  }

  function listen(target, type, handler, options) {
    try {
      target.addEventListener(type, handler, options)
      disposers.push(() => {
        try {
          target.removeEventListener(type, handler, options)
        } catch {}
      })
    } catch {}
  }

  function makeOptions(settings) {
    const source = settings && typeof settings === 'object' ? settings : {}
    // 与 auto.js 保持一致：展开全部设置，识别器与转换器共用同一份选项
    return {
      ...source,
      detect,
      openMode: source.openMode === 'self' ? 'self' : 'blank',
      markDone: true,
    }
  }

  function currentOptions() {
    return makeOptions(getSettings())
  }

  function notify(count) {
    if (!count || count <= 0) return
    try {
      showToast(`已转换 ${count} 处文本`, TOAST_DURATION)
    } catch {}
  }

  function hasMatch(text, options) {
    if (!text || !text.trim()) return false
    try {
      const result = detect(text, options)
      if (Array.isArray(result)) return result.length > 0
      if (result && typeof result === 'object' && typeof result.length === 'number') {
        return result.length > 0
      }
      return Boolean(result)
    } catch {
      return false
    }
  }

  function resolveElement(target) {
    if (!target) return null
    if (target.nodeType === 1) return target
    if (target.nodeType === 3) return target.parentElement || null
    return null
  }

  function isSkippedTarget(target) {
    const el = resolveElement(target)
    if (!el) return true
    try {
      if (el.closest && el.closest('[data-t2l-ui]')) return true
      return Boolean(isSkippedElement(el))
    } catch {
      return true
    }
  }

  function isModified(event) {
    return Boolean(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
  }

  function movedFar(event, down) {
    if (!down) return false
    const dx = event.clientX - down.x
    const dy = event.clientY - down.y
    return dx * dx + dy * dy > DRAG_THRESHOLD_SQ
  }

  function hasActiveSelection() {
    try {
      const selection = window.getSelection()
      return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
    } catch {
      return false
    }
  }

  function clearClickTimer() {
    if (!clickTimer) return
    try {
      clearTimeout(clickTimer)
    } catch {}
    clickTimer = 0
  }

  // ---------- 手动触发 ----------

  const onMouseDown = safe((event) => {
    if (event.button === 1) {
      middleDown = false
      const settings = getSettings()
      if (settings.manualTrigger !== 'middle') return
      if (isModified(event) || isSkippedTarget(event.target)) return
      middleDown = true
      event.preventDefault()
      notify(convertAtPoint(event.clientX, event.clientY, makeOptions(settings)))
      return
    }
    if (event.button === 0) {
      pointerDown = { x: event.clientX, y: event.clientY }
    }
  })

  const onMouseUp = safe((event) => {
    if (event.button !== 1) return
    if (!middleDown) return
    middleDown = false
    event.preventDefault()
  })

  const onClick = safe((event) => {
    const down = pointerDown
    pointerDown = null
    const settings = getSettings()
    if (settings.manualTrigger !== 'click') return
    // 键盘或程序化触发的 click 没有真实坐标
    if (event.detail === 0) return
    if (isModified(event)) return
    if (isSkippedTarget(event.target)) return
    if (movedFar(event, down)) return
    if (hasActiveSelection()) return

    const x = event.clientX
    const y = event.clientY
    clearClickTimer()
    clickTimer = window.setTimeout(() => {
      clickTimer = 0
      try {
        const latest = getSettings()
        if (latest.manualTrigger !== 'click') return
        notify(convertAtPoint(x, y, makeOptions(latest)))
      } catch {}
    }, CLICK_DELAY)
  })

  const onDblClick = safe((event) => {
    // 双击成立，取消待执行的单击
    clearClickTimer()
    const settings = getSettings()
    if (settings.manualTrigger !== 'dblclick') return
    if (isModified(event)) return
    if (isSkippedTarget(event.target)) return

    const options = makeOptions(settings)
    const info = getSelectedTextInfo()
    if (info && info.text && hasMatch(info.text, options)) {
      notify(convertSelection(options))
      return
    }
    notify(convertAtPoint(event.clientX, event.clientY, options))
  })

  // ---------- 右键菜单 ----------

  function eventInsideHost(event, host) {
    try {
      if (typeof event.composedPath === 'function') {
        return event.composedPath().includes(host)
      }
      return event.target === host || Boolean(host.contains && host.contains(event.target))
    } catch {
      return false
    }
  }

  function closeMenu() {
    const state = menuState
    if (!state) return
    menuState = null
    try {
      document.removeEventListener('keydown', state.onKeyDown, true)
      document.removeEventListener('mousedown', state.onOutside, true)
      document.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu, true)
      window.removeEventListener('blur', closeMenu, true)
      if (state.host.parentNode) state.host.parentNode.removeChild(state.host)
    } catch {}
  }

  function pushItem(items, seen, label, action) {
    if (seen.has(label)) return
    seen.add(label)
    items.push({ label, action })
  }

  function runAction(action) {
    try {
      const result = action()
      if (result && typeof result.catch === 'function') {
        result.catch(() => {})
      }
    } catch {}
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text)
        showToast('链接已复制', TOAST_DURATION)
        return
      }
    } catch {}
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.cssText = 'position: fixed; top: 0; left: -9999px; opacity: 0;'
      const parent = document.body || document.documentElement
      parent.appendChild(area)
      area.select()
      area.setSelectionRange(0, area.value.length)
      const ok = document.execCommand('copy')
      area.remove()
      if (ok) showToast('链接已复制', TOAST_DURATION)
    } catch {}
  }

  function buildContextItems(event, settings) {
    const items = []
    const seen = new Set()
    const options = makeOptions(settings)
    const x = event.clientX
    const y = event.clientY
    const el = resolveElement(event.target)
    const anchor = el && el.closest ? el.closest('a') : null

    if (anchor) {
      // 普通链接保留页面原生右键菜单，只接管脚本自己生成的链接
      if (!anchor.matches || !anchor.matches('a.t2l-link')) return items
      const href = anchor.href || anchor.getAttribute('href') || ''
      if (!href) return items
      pushItem(items, seen, '在新标签页打开', () => {
        try {
          window.open(href, '_blank', 'noopener')
        } catch {}
      })
      pushItem(items, seen, '复制链接', () => {
        copyText(href)
      })
      return items
    }

    // 1. 选区非折叠且可识别
    const info = getSelectedTextInfo()
    if (
      info &&
      info.text &&
      info.node &&
      info.node.nodeType === 3 &&
      info.range &&
      info.range.endContainer === info.node &&
      hasMatch(info.text, options)
    ) {
      pushItem(items, seen, '转换选中文本为链接', () => {
        notify(convertSelection(currentOptions()))
      })
    }

    // 2. 光标处文本节点可识别
    const point = getTextNodeAtPoint(x, y)
    if (point && point.node && hasMatch(point.node.textContent || '', options)) {
      pushItem(items, seen, '转换此处文本为链接', () => {
        notify(convertAtPoint(x, y, currentOptions()))
      })
    }

    return items
  }

  function openMenu(x, y, items) {
    closeMenu()
    if (!items.length) return
    try {
      const host = document.createElement('div')
      host.setAttribute('data-t2l-ui', '')
      host.style.cssText =
        'all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; visibility: hidden;'

      const shadow = host.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      style.textContent = MENU_CSS

      const menu = document.createElement('div')
      menu.className = 'menu'
      menu.setAttribute('role', 'menu')

      for (const item of items) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'item'
        button.setAttribute('role', 'menuitem')
        button.textContent = item.label
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          closeMenu()
          runAction(item.action)
        })
        menu.appendChild(button)
      }

      shadow.appendChild(style)
      shadow.appendChild(menu)
      const parent = document.documentElement || document.body
      if (!parent) return
      parent.appendChild(host)

      // 先测量尺寸，再决定是否向左 / 向上翻转
      const rect = menu.getBoundingClientRect()
      const vw = window.innerWidth || document.documentElement.clientWidth || 0
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      let left = x
      let top = y
      if (left + rect.width > vw - MENU_GAP) left = x - rect.width
      if (top + rect.height > vh - MENU_GAP) top = y - rect.height
      left = Math.max(MENU_GAP, Math.min(left, vw - rect.width - MENU_GAP))
      top = Math.max(MENU_GAP, Math.min(top, vh - rect.height - MENU_GAP))
      menu.style.left = `${left}px`
      menu.style.top = `${top}px`
      host.style.visibility = 'visible'

      const onKeyDown = (event) => {
        try {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const buttons = Array.from(menu.querySelectorAll('.item'))
            if (!buttons.length) return
            event.preventDefault()
            const active = shadow.activeElement
            let index = buttons.indexOf(active)
            if (event.key === 'ArrowDown') {
              index = index < 0 ? 0 : (index + 1) % buttons.length
            } else {
              index = index <= 0 ? buttons.length - 1 : index - 1
            }
            buttons[index].focus({ preventScroll: true })
          }
        } catch {}
      }

      const onOutside = (event) => {
        if (eventInsideHost(event, host)) return
        closeMenu()
      }

      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('mousedown', onOutside, true)
      document.addEventListener('scroll', closeMenu, true)
      window.addEventListener('resize', closeMenu, true)
      window.addEventListener('blur', closeMenu, true)

      menuState = { host, onKeyDown, onOutside }
    } catch {}
  }

  const onContextMenu = safe((event) => {
    if (menuState && eventInsideHost(event, menuState.host)) {
      event.preventDefault()
      return
    }
    const settings = getSettings()
    if (!settings.contextMenu) return
    const items = buildContextItems(event, settings)
    if (!items.length) return
    event.preventDefault()
    event.stopPropagation()
    openMenu(event.clientX, event.clientY, items)
  })

  // ---------- 注册与清理 ----------

  listen(document, 'mousedown', onMouseDown, true)
  listen(document, 'mouseup', onMouseUp, true)
  listen(document, 'click', onClick, true)
  listen(document, 'dblclick', onDblClick, true)
  listen(document, 'contextmenu', onContextMenu, true)

  return function dispose() {
    clearClickTimer()
    pointerDown = null
    middleDown = false
    closeMenu()
    for (const off of disposers.splice(0)) {
      try {
        off()
      } catch {}
    }
  }
}
