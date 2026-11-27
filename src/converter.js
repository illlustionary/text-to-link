/**
 * DOM 转换核心：把文本节点里的 URL / 裸域名替换成可点击的 <a>。
 * detect 由调用方注入，这里只负责遍历、跳过规则与 DOM 重建。
 */

export const CONVERTED_CLASS = 't2l-link'
export const UI_ATTR = 'data-t2l-ui'
export const DONE_ATTR = 'data-t2l-done'

// 这些标签内部属于代码 / 表单 / 媒体等，文本不应被改成链接
const SKIP_TAGS = new Set([
  'A',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'BUTTON',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'SVG',
  'MATH',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'IFRAME',
  'HEAD',
  'TITLE',
  'META',
  'LINK',
  'TEMPLATE',
])

// 已成功转换过的文本节点，避免 MutationObserver 反复处理同一个节点
const convertedNodes = new WeakSet()

/** 取元素所属文档的默认视图，用于 getComputedStyle */
function getView(el) {
  const doc = el && el.ownerDocument
  return (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null)
}

/** 元素是否因不可见而不该处理；jsdom 等环境取不到样式时按可见处理 */
function isInvisible(el) {
  const view = getView(el)
  if (!view || typeof view.getComputedStyle !== 'function') return false
  try {
    const style = view.getComputedStyle(el)
    if (!style) return false
    return style.display === 'none' || style.visibility === 'hidden'
  } catch {
    return false
  }
}

/** 是否已由本脚本生成链接 */
function isConvertedLink(el) {
  if (!el || el.nodeType !== 1) return false
  if (el.classList && el.classList.contains(CONVERTED_CLASS)) return true
  const className = el.getAttribute && el.getAttribute('class')
  return typeof className === 'string' && className.split(/\s+/).includes(CONVERTED_CLASS)
}

/** 沿祖先链判断元素是否应该跳过；会跨过 Shadow DOM 边界检查宿主 */
export function isSkippedElement(el) {
  let current = el && el.nodeType === 1 ? el : el && el.parentElement
  let guard = 0

  while (current && current.nodeType === 1 && guard < 100) {
    guard += 1

    if (SKIP_TAGS.has(current.tagName)) return true

    const editable = current.getAttribute && current.getAttribute('contenteditable')
    if (
      current.isContentEditable === true ||
      editable === '' ||
      editable === 'true' ||
      editable === 'plaintext-only'
    ) {
      return true
    }

    if (current.hasAttribute && current.hasAttribute(UI_ATTR)) return true
    if (isConvertedLink(current)) return true
    if (isInvisible(current)) return true

    // Shadow DOM 内的文本节点不会经过宿主元素的 parentElement，
    // 这里主动跳到宿主，才能识别脚本自己的设置框 / 右键菜单。
    const root = current.getRootNode && current.getRootNode()
    if (root && root.host && root.host !== current) {
      current = root.host
    } else {
      current = current.parentElement
    }
  }
  return false
}

/** 取文本节点所属文档 */
function getDocument(node) {
  return (node && node.ownerDocument) || (typeof document !== 'undefined' ? document : null)
}

/** 过滤并排序 detect 返回的匹配，丢掉越界与重叠项 */
function normalizeMatches(matches, length) {
  if (!Array.isArray(matches) || matches.length === 0) return []
  const list = []
  for (const match of matches) {
    if (!match || typeof match !== 'object') continue
    const start = Math.floor(Number(match.start))
    const end = Math.floor(Number(match.end))
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start < 0 || end > length || end <= start) continue
    list.push({ match, start, end })
  }
  list.sort((a, b) => a.start - b.start || b.end - a.end)
  const result = []
  let cursor = 0
  for (const item of list) {
    if (item.start < cursor) continue
    result.push(item)
    cursor = item.end
  }
  return result
}

/** 创建一个本脚本风格的链接元素 */
function createLink(doc, match, displayText, openMode) {
  const link = doc.createElement('a')
  link.textContent = displayText
  link.setAttribute('href', match.href)
  link.className = CONVERTED_CLASS
  link.target = openMode === 'self' ? '_self' : '_blank'
  if (openMode !== 'self') link.rel = 'noopener noreferrer'
  link.title = match.href
  link.dataset.t2lType = match.type
  link.dataset.t2lHref = match.href
  return link
}

/**
 * 用文本 + 匹配区间重建 DocumentFragment。
 * before / after 用于选区场景，保留未选中的文本。
 */
function buildFragment(doc, text, matches, openMode, before = '', after = '') {
  const fragment = doc.createDocumentFragment()
  if (before) fragment.appendChild(doc.createTextNode(before))

  const list = normalizeMatches(matches, text.length)
  if (list.length === 0) {
    if (after) fragment.appendChild(doc.createTextNode(after))
    return { fragment, count: 0 }
  }

  let cursor = 0
  let count = 0
  for (const item of list) {
    const { match, start, end } = item
    if (start > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor, start)))
    const displayText = match.text != null ? String(match.text) : text.slice(start, end)
    fragment.appendChild(createLink(doc, match, displayText, openMode))
    cursor = end
    count += 1
  }
  if (cursor < text.length) fragment.appendChild(doc.createTextNode(text.slice(cursor)))
  if (after) fragment.appendChild(doc.createTextNode(after))

  return { fragment, count }
}

/** 标记已处理区域的父元素，便于外部识别 */
function markDone(element) {
  if (element && element.setAttribute) element.setAttribute(DONE_ATTR, '1')
}

/** 转换单个文本节点，返回新生成的链接数量 */
export function convertTextNode(node, options = {}) {
  if (!node || node.nodeType !== 3) return 0
  const text = node.nodeValue
  if (!text) return 0
  if (typeof node.isConnected === 'boolean' && !node.isConnected) return 0

  const parent = node.parentElement
  if (!parent) return 0
  if (convertedNodes.has(node)) return 0
  if (isSkippedElement(parent)) return 0

  const detect = options && options.detect
  if (typeof detect !== 'function') return 0

  let matches = null
  try {
    matches = detect(text, options)
  } catch {
    return 0
  }
  if (!Array.isArray(matches) || matches.length === 0) return 0

  const doc = getDocument(node)
  if (!doc) return 0

  const openMode = options.openMode === 'self' ? 'self' : 'blank'
  const { fragment, count } = buildFragment(doc, text, matches, openMode)
  if (count === 0) return 0

  convertedNodes.add(node)
  node.replaceWith(fragment)
  if (options.markDone !== false) markDone(parent)
  return count
}

/** 取遍历文本节点用的 SHOW_TEXT 常量，兼容不同环境 */
function getShowText(doc) {
  if (typeof NodeFilter !== 'undefined' && NodeFilter.SHOW_TEXT) return NodeFilter.SHOW_TEXT
  const view = doc && doc.defaultView
  if (view && view.NodeFilter && view.NodeFilter.SHOW_TEXT) return view.NodeFilter.SHOW_TEXT
  return 4
}

/** 收集 root 内所有文本节点（先收集再改 DOM，避免边遍历边修改） */
function collectTextNodes(root, limit = Infinity) {
  const doc = getDocument(root)
  if (!doc) return []
  const nodes = []
  let walker = null
  try {
    walker = doc.createTreeWalker(root, getShowText(doc), null)
  } catch {
    return nodes
  }
  let current = walker.nextNode()
  while (current && nodes.length < limit) {
    nodes.push(current)
    current = walker.nextNode()
  }
  return nodes
}

/** 转换 root 元素内所有文本节点，返回总链接数量 */
export function convertElement(root, options = {}) {
  if (!root) return 0
  let element = root
  if (root.nodeType === 9) element = root.documentElement
  else if (root.nodeType !== 1) element = root.parentElement
  if (!element || element.nodeType !== 1) return 0
  if (isSkippedElement(element)) return 0

  // 首轮整页扫描也要有上限，避免超大页面长时间阻塞主线程
  const rawLimit = Number(options.maxScanNodes ?? options.maxNodes)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : Infinity

  const nodes = collectTextNodes(element, limit)
  let total = 0
  for (const node of nodes) {
    total += convertTextNode(node, options)
  }
  return total
}

/** 取节点内第一个非空文本节点（含后代） */
function findFirstTextNode(node) {
  if (!node) return null
  if (node.nodeType === 3) return node.nodeValue && node.nodeValue.trim() ? node : null
  if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return null
  const children = node.childNodes || []
  for (const child of children) {
    const found = findFirstTextNode(child)
    if (found) return found
  }
  return null
}

/** 节点是否位于本脚本生成的链接内 */
function inConvertedLink(node) {
  let current = node && node.nodeType === 1 ? node : node && node.parentElement
  while (current && current.nodeType === 1) {
    if (isConvertedLink(current)) return true
    current = current.parentElement
  }
  return false
}

/** 根据视口坐标取文本节点与偏移；取不到时返回 null */
export function getTextNodeAtPoint(x, y) {
  const doc = typeof document !== 'undefined' ? document : null
  if (!doc) return null

  let node = null
  let offset = 0

  if (typeof doc.caretRangeFromPoint === 'function') {
    try {
      const range = doc.caretRangeFromPoint(x, y)
      if (range) {
        node = range.startContainer
        offset = range.startOffset
      }
    } catch {
      node = null
    }
  }

  if (!node && typeof doc.caretPositionFromPoint === 'function') {
    try {
      const position = doc.caretPositionFromPoint(x, y)
      if (position) {
        node = position.offsetNode
        offset = position.offset
      }
    } catch {
      node = null
    }
  }

  if (!node) return null

  if (node.nodeType === 1) {
    node = findFirstTextNode(node)
    if (!node) return null
    offset = 0
  }
  if (node.nodeType !== 3) return null
  if (inConvertedLink(node)) return null

  return { node, offset }
}

/** 取当前选区的文本信息，只在选区起点是文本节点时有效 */
export function getSelectedTextInfo() {
  const win = typeof window !== 'undefined' ? window : null
  if (!win || typeof win.getSelection !== 'function') return null
  const selection = win.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const text = selection.toString()
  if (!text || !text.trim()) return null

  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (!node || node.nodeType !== 3) return null
  return { text, range, node }
}

/** 只转换当前选区（要求选区落在同一个文本节点内） */
export function convertSelection(options = {}) {
  const info = getSelectedTextInfo()
  if (!info) return 0

  const { range, node } = info
  if (!node || node.nodeType !== 3) return 0
  if (range.startContainer !== node || range.endContainer !== node) return 0
  if (convertedNodes.has(node)) return 0
  if (typeof node.isConnected === 'boolean' && !node.isConnected) return 0

  const parent = node.parentElement
  if (!parent || isSkippedElement(parent)) return 0

  const detect = options && options.detect
  if (typeof detect !== 'function') return 0

  const fullText = node.nodeValue || ''
  const start = Math.max(0, Math.min(range.startOffset, fullText.length))
  const end = Math.max(start, Math.min(range.endOffset, fullText.length))
  if (end <= start) return 0

  const selected = fullText.slice(start, end)
  if (!selected) return 0

  let matches = null
  try {
    matches = detect(selected, options)
  } catch {
    return 0
  }
  if (!Array.isArray(matches) || matches.length === 0) return 0

  const doc = getDocument(node)
  if (!doc) return 0

  const openMode = options.openMode === 'self' ? 'self' : 'blank'
  const { fragment, count } = buildFragment(
    doc,
    selected,
    matches,
    openMode,
    fullText.slice(0, start),
    fullText.slice(end),
  )
  if (count === 0) return 0

  convertedNodes.add(node)
  node.replaceWith(fragment)
  if (options.markDone !== false) markDone(parent)

  const win = typeof window !== 'undefined' ? window : null
  if (win && typeof win.getSelection === 'function') {
    try {
      const selection = win.getSelection()
      if (selection && typeof selection.removeAllRanges === 'function') selection.removeAllRanges()
    } catch {
      // 忽略选区清理失败
    }
  }

  return count
}

/** 坐标处触发转换，返回转换数量 */
export function convertAtPoint(x, y, options = {}) {
  const hit = getTextNodeAtPoint(x, y)
  if (!hit || !hit.node) return 0
  return convertTextNode(hit.node, options)
}
