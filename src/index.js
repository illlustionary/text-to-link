import { detect } from './detector.js'
import { convertElement } from './converter.js'
import { startAutoConvert } from './auto.js'
import { installManualTriggers } from './manual.js'
import {
  loadSettings,
  saveSettings,
  subscribeSettings,
  openSettingsDialog,
} from './settings.js'
import { registerMenus } from './menu.js'
import { ensureStyle, showToast } from './ui.js'
import { isSiteExcluded } from './config.js'

/** 站内路由变化监听（SPA 切换页面时重新判断是否启用） */
function onUrlChange(callback) {
  let last = location.href
  const fire = () => {
    if (location.href === last) return
    last = location.href
    callback()
  }

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method]
    if (typeof original !== 'function') continue
    history[method] = function patched(...args) {
      const result = original.apply(this, args)
      fire()
      return result
    }
  }
  window.addEventListener('popstate', fire)
}

function init() {
  ensureStyle()

  let settings = loadSettings()
  let auto = null
  let manual = null
  let routeTimer = 0

  const getSettings = () => settings
  const autoAllowed = () => settings.autoConvert && !isSiteExcluded(settings)
  const manualAllowed = () => !isSiteExcluded(settings)

  function syncAuto() {
    if (autoAllowed()) {
      if (!auto) {
        auto = startAutoConvert({ getSettings, detect })
      }
    } else if (auto) {
      auto.stop()
      auto = null
    }
  }

  function syncManual() {
    if (manualAllowed()) {
      if (!manual) manual = installManualTriggers({ getSettings, detect })
    } else if (manual) {
      manual()
      manual = null
    }
  }

  function syncAll() {
    syncAuto()
    syncManual()
  }

  function rescan() {
    if (auto) return auto.rescan()
    if (!document.body) return 0
    return convertElement(document.body, {
      detect,
      openMode: settings.openMode,
    })
  }

  function updateSettings(patch) {
    // saveSettings 会同步通知订阅者，由订阅回调完成模式切换
    return saveSettings(patch)
  }

  const unregisterMenus = registerMenus({
    getSettings,
    updateSettings,
    rescan: () => {
      const count = rescan()
      if (count > 0) showToast(`已转换 ${count} 处文本`)
      else showToast('没有找到可转换的文本')
      return count
    },
    openSettings: () => {
      openSettingsDialog({
        settings,
        onChange: (next) => {
          settings = next
          syncAll()
        },
      })
    },
  })

  subscribeSettings((next) => {
    settings = next
    syncAll()
  })

  onUrlChange(() => {
    syncAll()
    if (!autoAllowed()) return
    // SPA 可能整块替换内容，路由变化后补一次扫描
    clearTimeout(routeTimer)
    routeTimer = window.setTimeout(() => {
      if (auto) auto.rescan()
    }, 500)
  })

  syncAll()

  // 页面进入后台时不做处理，浏览器卸载时会自动回收；
  // 保留引用避免打包器把清理函数当成死代码
  void unregisterMenus
}

if (document.body) {
  init()
} else {
  window.addEventListener('DOMContentLoaded', init, { once: true })
}
