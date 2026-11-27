/**
 * 自动转换：监听 DOM 变化，防抖后分片扫描新增 / 变化的文本节点。
 * 只负责调度，具体的文本判断与替换都交给 converter。
 */
import {
  CONVERTED_CLASS,
  UI_ATTR,
  convertElement,
  convertTextNode,
  isSkippedElement,
} from './converter.js'

const DEBOUNCE_MS = 350
const CHUNK_SIZE = 100
const DEFAULT_MAX_SCAN_NODES = 6000

// 这些标签整体忽略，避免扫描脚本 / 样式内容
const IGNORE_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT'])

/** 取遍历文本节点用的 SHOW_TEXT 常量 */
function getShowText(doc) {
  if (typeof NodeFilter !== 'undefined' && NodeFilter.SHOW_TEXT) return NodeFilter.SHOW_TEXT
  const view = doc && doc.defaultView
  if (view && view.NodeFilter && view.NodeFilter.SHOW_TEXT) return view.NodeFilter.SHOW_TEXT
  return 4
}

/** 新增的元素是否属于脚本自身或无需扫描的内容 */
function shouldIgnoreElement(el) {
  if (!el || el.nodeType !== 1) return true
  if (IGNORE_TAGS.has(el.tagName)) return true
  if (el.hasAttribute && el.hasAttribute(UI_ATTR)) return true
  if (el.classList && el.classList.contains(CONVERTED_CLASS)) return true
  const className = el.getAttribute && el.getAttribute('class')
  if (typeof className === 'string' && className.split(/\s+/).includes(CONVERTED_CLASS)) return true
  return false
}

/** 元素是否已脱离文档 */
function isDetached(node) {
  return typeof node.isConnected === 'boolean' && !node.isConnected
}

/** 构造传给 converter / detect 的选项 */
function buildOptions(settings, detect) {
  const source = settings && typeof settings === 'object' ? settings : {}
  return {
    ...source,
    detect,
    openMode: source.openMode === 'self' ? 'self' : 'blank',
    markDone: true,
  }
}

/**
 * 启动自动转换。
 * @param {object} deps
 * @param {() => object} deps.getSettings 每次处理时读取最新设置
 * @param {(text: string, options: object) => Array} deps.detect 文本识别函数
 * @param {(count: number) => void} [deps.onConvert] 单轮有转换时的回调
 * @returns {{ stop: () => void, rescan: () => number }}
 */
export function startAutoConvert({ getSettings, detect, onConvert } = {}) {
  const settingsFn = typeof getSettings === 'function' ? getSettings : () => ({})
  const detectFn = typeof detect === 'function' ? detect : null
  const notify = typeof onConvert === 'function' ? onConvert : null

  let observer = null
  let stopped = false
  let debounceTimer = null
  let idleId = null
  let idleView = null
  let timeoutId = null
  let running = false

  // 等待处理的新增元素 / 文本节点
  let pendingElements = []
  let pendingTexts = []

  function readSettings() {
    try {
      return settingsFn() || {}
    } catch {
      return {}
    }
  }

  function readMaxNodes(settings) {
    const value = Number(settings.maxScanNodes)
    if (Number.isFinite(value) && value > 0) return Math.floor(value)
    return DEFAULT_MAX_SCAN_NODES
  }

  function cancelIdle() {
    if (idleId !== null && idleView && typeof idleView.cancelIdleCallback === 'function') {
      try {
        idleView.cancelIdleCallback(idleId)
      } catch {
        // 忽略取消失败
      }
    }
    idleId = null
    idleView = null
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  function scheduleIdle(task) {
    const view = typeof window !== 'undefined' ? window : null
    if (view && typeof view.requestIdleCallback === 'function') {
      idleView = view
      idleId = view.requestIdleCallback(
        () => {
          idleId = null
          idleView = null
          task()
        },
        { timeout: 1000 },
      )
      return
    }
    timeoutId = setTimeout(() => {
      timeoutId = null
      task()
    }, 0)
  }

  function schedule() {
    if (stopped) return
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      flush()
    }, DEBOUNCE_MS)
  }

  /** 把新增元素展开成文本节点，便于按片处理并严格控制节点上限 */
  function collectElementTexts(element, pushText, budget) {
    if (budget.left <= 0) return
    if (!element || element.nodeType !== 1) return
    if (isDetached(element)) return
    if (isSkippedElement(element)) return

    const doc = element.ownerDocument
    if (!doc || typeof doc.createTreeWalker !== 'function') return

    let walker = null
    try {
      walker = doc.createTreeWalker(element, getShowText(doc), null)
    } catch {
      return
    }
    let current = walker.nextNode()
    while (current && budget.left > 0) {
      pushText(current)
      current = walker.nextNode()
    }
  }

  function flush() {
    if (stopped || running) return

    const settings = readSettings()
    const maxNodes = readMaxNodes(settings)

    const elements = pendingElements
    const texts = pendingTexts
    pendingElements = []
    pendingTexts = []

    if (!detectFn) return

    const tasks = []
    const seen = new WeakSet()
    const budget = { left: maxNodes }

    const pushText = (node) => {
      if (budget.left <= 0) return
      if (!node || node.nodeType !== 3) return
      if (!node.nodeValue || !node.nodeValue.trim()) return
      if (isDetached(node)) return
      if (seen.has(node)) return
      seen.add(node)

      const parent = node.parentElement
      if (!parent || isSkippedElement(parent)) return

      tasks.push(node)
      budget.left -= 1
    }

    for (const element of elements) {
      if (budget.left <= 0) break
      if (shouldIgnoreElement(element)) continue
      collectElementTexts(element, pushText, budget)
    }
    for (const node of texts) {
      if (budget.left <= 0) break
      pushText(node)
    }

    if (tasks.length === 0) return

    running = true
    let index = 0
    let converted = 0

    const runChunk = () => {
      if (stopped) {
        running = false
        return
      }

      // 每片都重新读取设置，保证处理期间改配置也能生效
      const currentSettings = readSettings()
      const currentOptions = buildOptions(currentSettings, detectFn)
      const end = Math.min(index + CHUNK_SIZE, tasks.length)

      for (; index < end; index += 1) {
        const node = tasks[index]
        if (isDetached(node)) continue
        converted += convertTextNode(node, currentOptions)
      }

      if (index < tasks.length) {
        scheduleIdle(runChunk)
        return
      }

      running = false
      if (converted > 0 && notify) {
        try {
          notify(converted)
        } catch {
          // 回调异常不影响后续观察
        }
      }

      // 处理期间又积累的变化，安排下一轮
      if (!stopped && (pendingElements.length > 0 || pendingTexts.length > 0)) schedule()
    }

    scheduleIdle(runChunk)
  }

  function handleMutations(mutations) {
    if (stopped) return
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (!shouldIgnoreElement(node)) pendingElements.push(node)
          } else if (node.nodeType === 3) {
            if (node.nodeValue && node.nodeValue.trim()) pendingTexts.push(node)
          }
        }
      } else if (mutation.type === 'characterData') {
        const node = mutation.target
        if (node && node.nodeType === 3 && node.nodeValue && node.nodeValue.trim()) {
          pendingTexts.push(node)
        }
      }
    }
    schedule()
  }

  /** 立即同步扫描整页，返回本轮转换数量（手动调用，stop 后仍可用） */
  function rescan() {
    if (!detectFn) return 0
    const doc = typeof document !== 'undefined' ? document : null
    if (!doc || !doc.body) return 0

    const settings = readSettings()
    const count = convertElement(doc.body, buildOptions(settings, detectFn))
    if (count > 0 && notify) {
      try {
        notify(count)
      } catch {
        // 回调异常不影响后续观察
      }
    }
    return count
  }

  function stop() {
    stopped = true
    running = false
    if (observer) {
      try {
        observer.disconnect()
      } catch {
        // 忽略断开失败
      }
      observer = null
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    cancelIdle()
    pendingElements = []
    pendingTexts = []
  }

  // 先完成首轮扫描，再开始监听，避免自己的改动触发一轮无意义扫描
  rescan()

  const MO =
    typeof MutationObserver !== 'undefined'
      ? MutationObserver
      : typeof window !== 'undefined'
        ? window.MutationObserver
        : null

  if (MO && typeof document !== 'undefined' && document.documentElement) {
    observer = new MO(handleMutations)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  return { stop, rescan }
}
