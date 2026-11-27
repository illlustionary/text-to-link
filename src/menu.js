/**
 * ScriptCat 用户脚本菜单注册。
 * 菜单文字随设置变化：注销旧菜单后重新注册，避免出现重复项。
 */
import {
  DEFAULT_SETTINGS,
  OPEN_MODE_LABELS,
  TRIGGER_LABELS,
  TRIGGER_ORDER,
} from './config.js'
import { loadSettings, subscribeSettings } from './settings.js'

/**
 * 注册用户脚本菜单。
 * @param {{
 *   getSettings: () => object,
 *   updateSettings: (patch: object) => unknown,
 *   rescan: () => unknown,
 *   openSettings: () => unknown,
 * }} handlers
 * @returns {() => void} 注销所有菜单
 */
export function registerMenus({ getSettings, updateSettings, rescan, openSettings } = {}) {
  if (typeof GM_registerMenuCommand !== 'function') {
    console.warn('[文本转链接] 当前环境不支持 GM_registerMenuCommand，已跳过菜单注册')
    return () => {}
  }

  const menuIds = []
  // GM_unregisterMenuCommand 存在且能拿到菜单 id 时才允许动态刷新
  let canRefresh = typeof GM_unregisterMenuCommand === 'function'

  /** 读取当前设置，异常时退回默认值；优先读存储，避免订阅顺序导致读到旧值 */
  function currentSettings() {
    try {
      const stored = loadSettings()
      if (stored && typeof stored === 'object') return stored
    } catch (error) {
      console.warn('[文本转链接] 读取设置失败', error)
    }
    try {
      const value = typeof getSettings === 'function' ? getSettings() : null
      return value && typeof value === 'object' ? value : DEFAULT_SETTINGS
    } catch (error) {
      console.warn('[文本转链接] 读取设置失败', error)
      return DEFAULT_SETTINGS
    }
  }

  /** 注册一条菜单，记录返回的 id */
  function addMenu(text, onClick) {
    const id = GM_registerMenuCommand(text, onClick)
    if (id == null) {
      // 拿不到 id 就无法注销，后续只保留这一轮静态菜单
      canRefresh = false
      return
    }
    menuIds.push(id)
  }

  /** 注销已记录的菜单 */
  function clearMenus() {
    if (typeof GM_unregisterMenuCommand !== 'function') {
      menuIds.length = 0
      return
    }
    while (menuIds.length) {
      const id = menuIds.pop()
      if (id == null) continue
      try {
        GM_unregisterMenuCommand(id)
      } catch (error) {
        console.warn('[文本转链接] 注销菜单失败', error)
      }
    }
  }

  /** 执行设置更新，并在完成后刷新菜单文字 */
  function applyPatch(patch) {
    if (typeof updateSettings !== 'function') {
      refresh()
      return
    }
    try {
      const result = updateSettings(patch)
      if (result && typeof result.then === 'function') {
        result.then(refresh, refresh)
        return
      }
    } catch (error) {
      console.warn('[文本转链接] 更新设置失败', error)
    }
    refresh()
  }

  /** 按当前设置注册全部菜单 */
  function register() {
    const settings = currentSettings()

    const autoLabel = settings.autoConvert !== false ? '开' : '关'
    const triggerLabel = TRIGGER_LABELS[settings.manualTrigger] || TRIGGER_LABELS.dblclick
    const openModeLabel = OPEN_MODE_LABELS[settings.openMode] || OPEN_MODE_LABELS.blank

    addMenu('⚙ 设置…', () => {
      if (typeof openSettings === 'function') openSettings()
    })

    addMenu(`自动转换：${autoLabel}`, () => {
      const latest = currentSettings()
      applyPatch({ autoConvert: latest.autoConvert !== true })
    })

    addMenu(`手动触发：${triggerLabel}`, () => {
      const latest = currentSettings()
      const index = TRIGGER_ORDER.indexOf(latest.manualTrigger)
      const next = TRIGGER_ORDER[(index + 1) % TRIGGER_ORDER.length] || 'dblclick'
      applyPatch({ manualTrigger: next })
    })

    addMenu(`打开方式：${openModeLabel}`, () => {
      const latest = currentSettings()
      applyPatch({ openMode: latest.openMode === 'blank' ? 'self' : 'blank' })
    })

    addMenu('立即扫描当前页', () => {
      if (typeof rescan === 'function') rescan()
    })

    addMenu('恢复默认设置', () => {
      const confirmed = window.confirm('确定要恢复默认设置吗？当前配置将被覆盖。')
      if (!confirmed) return
      applyPatch(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))
    })
  }

  /** 重新注册菜单以更新文字 */
  function refresh() {
    if (!canRefresh) return
    clearMenus()
    register()
  }

  register()

  // 设置面板保存、其它入口修改设置时也同步刷新菜单文字
  const unsubscribeSettings = subscribeSettings(() => refresh())

  return function unregister() {
    unsubscribeSettings()
    clearMenus()
  }
}
