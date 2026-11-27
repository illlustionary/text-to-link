/**
 * 设置的持久化、订阅与设置对话框。
 * 存储优先走 GM_getValue / GM_setValue，缺失时回退 localStorage。
 */
import {
  DEFAULT_SETTINGS,
  OPEN_MODE_LABELS,
  OPEN_MODE_ORDER,
  TRIGGER_LABELS,
  TRIGGER_ORDER,
  normalizeSettings,
} from './config.js'

const STORAGE_KEY = 't2l_settings'

// 所有设置变化的订阅者
const subscribers = new Set()

// 同一时间只允许存在一个设置框
let activeDialog = null

/** 解析 GM 或 localStorage 里读到的原始值 */
function parseStored(value) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (error) {
      console.warn('[文本转链接] 设置内容不是合法 JSON', error)
      return null
    }
  }
  return value && typeof value === 'object' ? value : null
}

/** 读取原始设置对象，失败时返回 null */
function readRaw() {
  if (typeof GM_getValue === 'function') {
    try {
      return parseStored(GM_getValue(STORAGE_KEY, null))
    } catch (error) {
      console.warn('[文本转链接] GM_getValue 读取失败，尝试 localStorage', error)
    }
  }

  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return text ? JSON.parse(text) : null
  } catch (error) {
    console.warn('[文本转链接] 读取设置失败', error)
    return null
  }
}

/** 写入设置，成功返回 true */
function writeRaw(settings) {
  if (typeof GM_setValue === 'function') {
    try {
      GM_setValue(STORAGE_KEY, settings)
      return true
    } catch (error) {
      console.warn('[文本转链接] GM_setValue 写入失败，尝试 localStorage', error)
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    return true
  } catch (error) {
    console.warn('[文本转链接] 保存设置失败', error)
    return false
  }
}

/** 通知所有订阅者 */
function notify(settings) {
  subscribers.forEach((fn) => {
    try {
      fn(settings)
    } catch (error) {
      console.warn('[文本转链接] 设置订阅回调执行失败', error)
    }
  })
}

/** 深拷贝默认设置，避免调用方意外修改常量 */
function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
}

/** 读取设置，始终返回完整且合法的结构 */
export function loadSettings() {
  return normalizeSettings(readRaw())
}

/** 保存局部设置（types 单独深合并），并通知订阅者 */
export function saveSettings(patch) {
  const current = loadSettings()
  const source = patch && typeof patch === 'object' ? patch : {}
  const merged = { ...current, ...source }

  merged.types = {
    ...current.types,
    ...(source.types && typeof source.types === 'object' ? source.types : {}),
  }

  const next = normalizeSettings(merged)
  writeRaw(next)
  notify(next)
  return next
}

/** 恢复默认设置，并通知订阅者 */
export function resetSettings() {
  const next = normalizeSettings(cloneDefaults())
  writeRaw(next)
  notify(next)
  return next
}

/** 订阅设置变化，返回取消订阅函数 */
export function subscribeSettings(fn) {
  if (typeof fn !== 'function') return () => {}
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

/* ------------------------------ 设置对话框 ------------------------------ */

const DIALOG_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: block;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color-scheme: light dark;
  --t2l-bg: #ffffff;
  --t2l-text: #1f2328;
  --t2l-muted: #6b7280;
  --t2l-border: #d8dde4;
  --t2l-input-bg: #ffffff;
  --t2l-btn-bg: #f6f7f9;
  --t2l-btn-hover: #eceef2;
  --t2l-primary: #2563eb;
  --t2l-primary-hover: #1d4ed8;
  --t2l-mask: rgba(15, 23, 42, 0.48);
}

@media (prefers-color-scheme: dark) {
  :host {
    --t2l-bg: #1f2329;
    --t2l-text: #e6e8eb;
    --t2l-muted: #9aa2ad;
    --t2l-border: #3a4048;
    --t2l-input-bg: #16191d;
    --t2l-btn-bg: #2a2f36;
    --t2l-btn-hover: #343a42;
    --t2l-primary: #3b82f6;
    --t2l-primary-hover: #60a5fa;
    --t2l-mask: rgba(0, 0, 0, 0.62);
  }
}

* {
  box-sizing: border-box;
}

.t2l-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--t2l-mask);
}

.t2l-panel {
  display: flex;
  flex-direction: column;
  width: min(560px, 92vw);
  max-height: 86vh;
  overflow: hidden;
  color: var(--t2l-text);
  background: var(--t2l-bg);
  border: 1px solid var(--t2l-border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
  transform: translate(0, 0);
  will-change: transform;
}

.t2l-header {
  flex: 0 0 auto;
  padding: 13px 18px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid var(--t2l-border);
  cursor: move;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.t2l-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 16px 18px;
}

.t2l-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.t2l-label {
  font-weight: 500;
}

.t2l-check {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  cursor: pointer;
}

.t2l-check input[type="checkbox"] {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin: 3px 0 0;
  accent-color: var(--t2l-primary);
  cursor: pointer;
}

.t2l-check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.t2l-hint {
  color: var(--t2l-muted);
  font-size: 12px;
  line-height: 1.45;
}

.t2l-input,
.t2l-select,
.t2l-textarea {
  width: 100%;
  padding: 7px 10px;
  color: var(--t2l-text);
  background: var(--t2l-input-bg);
  border: 1px solid var(--t2l-border);
  border-radius: 6px;
  font: inherit;
  outline: none;
}

.t2l-input:focus,
.t2l-select:focus,
.t2l-textarea:focus {
  border-color: var(--t2l-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
}

.t2l-textarea {
  min-height: 92px;
  resize: vertical;
}

.t2l-footer {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--t2l-border);
}

.t2l-btn {
  padding: 7px 16px;
  color: var(--t2l-text);
  background: var(--t2l-btn-bg);
  border: 1px solid var(--t2l-border);
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

.t2l-btn:hover {
  background: var(--t2l-btn-hover);
}

.t2l-btn:focus-visible {
  outline: 2px solid var(--t2l-primary);
  outline-offset: 1px;
}

.t2l-btn--primary {
  color: #ffffff;
  background: var(--t2l-primary);
  border-color: var(--t2l-primary);
}

.t2l-btn--primary:hover {
  background: var(--t2l-primary-hover);
  border-color: var(--t2l-primary-hover);
}

@media (prefers-reduced-motion: reduce) {
  .t2l-panel {
    will-change: auto;
  }
}
`

/** 创建元素的小工具 */
function createEl(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/** 复选框行 */
function createCheckboxRow(labelText, checked, hintText) {
  const row = createEl('label', 't2l-check')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked === true

  const textWrap = createEl('span', 't2l-check-text')
  textWrap.appendChild(createEl('span', 't2l-check-label', labelText))
  if (hintText) textWrap.appendChild(createEl('span', 't2l-hint', hintText))

  row.appendChild(input)
  row.appendChild(textWrap)
  return { row, input }
}

/** 下拉框行 */
function createSelectRow(labelText, options, value) {
  const row = createEl('div', 't2l-field')
  row.appendChild(createEl('label', 't2l-label', labelText))

  const select = document.createElement('select')
  select.className = 't2l-select'
  select.setAttribute('aria-label', labelText)

  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement('option')
    option.value = optionValue
    option.textContent = optionLabel
    select.appendChild(option)
  })

  select.value = value
  row.appendChild(select)
  return { row, select }
}

/** 单行输入行 */
function createInputRow(labelText, value, placeholder) {
  const row = createEl('div', 't2l-field')
  row.appendChild(createEl('label', 't2l-label', labelText))

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 't2l-input'
  input.value = value
  input.setAttribute('aria-label', labelText)
  if (placeholder) input.placeholder = placeholder

  row.appendChild(input)
  return { row, input }
}

/** 多行输入行 */
function createTextareaRow(labelText, value, hintText, placeholder) {
  const row = createEl('div', 't2l-field')
  row.appendChild(createEl('label', 't2l-label', labelText))

  const textarea = document.createElement('textarea')
  textarea.className = 't2l-textarea'
  textarea.rows = 4
  textarea.value = value
  textarea.setAttribute('aria-label', labelText)
  if (placeholder) textarea.placeholder = placeholder

  row.appendChild(textarea)
  if (hintText) row.appendChild(createEl('span', 't2l-hint', hintText))
  return { row, textarea }
}

/** 逗号 / 空格 / 顿号分隔的列表 */
function parseList(value) {
  return String(value || '')
    .split(/[\s,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 每行一项的列表 */
function parseLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 数值限制 */
function clamp(value, min, max) {
  if (min > max) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * 打开设置对话框。
 * @param {{ settings?: object, onChange?: (settings: object) => void }} options
 */
export function openSettingsDialog({ settings, onChange } = {}) {
  if (typeof document === 'undefined') return

  // 同一时间只保留一个设置框
  if (activeDialog) activeDialog.close()

  let current = normalizeSettings(settings || loadSettings())

  const host = document.createElement('div')
  host.setAttribute('data-t2l-ui', '')

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = DIALOG_CSS
  shadow.appendChild(style)

  const mask = createEl('div', 't2l-mask')
  shadow.appendChild(mask)

  const panel = createEl('div', 't2l-panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', '文本转链接设置')
  mask.appendChild(panel)

  // 标题栏，可拖动
  const header = createEl('div', 't2l-header', '文本转链接设置')
  panel.appendChild(header)

  const body = createEl('div', 't2l-body')
  panel.appendChild(body)

  // 1. 自动转换
  const autoConvertField = createCheckboxRow('自动转换', current.autoConvert)
  body.appendChild(autoConvertField.row)

  // 2. 识别 http/https 链接
  const urlField = createCheckboxRow('识别 http/https 链接', current.types.url)
  body.appendChild(urlField.row)

  // 3. 识别裸域名
  const domainField = createCheckboxRow(
    '识别裸域名',
    current.types.domain,
    '如 baidu.com，自动补 https://'
  )
  body.appendChild(domainField.row)

  // 4. 宽松识别任意后缀
  const aggressiveField = createCheckboxRow(
    '宽松识别任意后缀',
    current.aggressiveDomain,
    '可能误伤普通单词，默认关闭'
  )
  body.appendChild(aggressiveField.row)

  // 5. 额外认可的域名后缀
  const extraTldsField = createInputRow(
    '额外认可的域名后缀',
    current.extraTlds.join(', '),
    'local, corp'
  )
  body.appendChild(extraTldsField.row)

  // 6. 打开方式
  const openModeField = createSelectRow(
    '打开方式',
    OPEN_MODE_ORDER.map((mode) => [mode, OPEN_MODE_LABELS[mode]]),
    current.openMode
  )
  body.appendChild(openModeField.row)

  // 7. 手动触发方式
  const triggerField = createSelectRow(
    '手动触发方式',
    TRIGGER_ORDER.map((trigger) => [trigger, TRIGGER_LABELS[trigger]]),
    current.manualTrigger
  )
  body.appendChild(triggerField.row)

  // 8. 页面右键菜单
  const contextMenuField = createCheckboxRow('页面右键菜单', current.contextMenu)
  body.appendChild(contextMenuField.row)

  // 9. 本站黑名单
  const excludedField = createTextareaRow(
    '本站黑名单',
    current.excludedSites.join('\n'),
    '每行一个域名，支持 *.example.com',
    'example.com\n*.example.com'
  )
  body.appendChild(excludedField.row)

  // 底部按钮
  const footer = createEl('div', 't2l-footer')
  panel.appendChild(footer)

  const saveButton = createEl('button', 't2l-btn t2l-btn--primary', '保存')
  saveButton.type = 'button'
  const resetButton = createEl('button', 't2l-btn', '恢复默认')
  resetButton.type = 'button'
  const cancelButton = createEl('button', 't2l-btn', '取消')
  cancelButton.type = 'button'

  footer.appendChild(saveButton)
  footer.appendChild(resetButton)
  footer.appendChild(cancelButton)

  /** 用设置对象回填表单 */
  function fillForm(value) {
    current = value
    autoConvertField.input.checked = value.autoConvert
    urlField.input.checked = value.types.url
    domainField.input.checked = value.types.domain
    aggressiveField.input.checked = value.aggressiveDomain
    extraTldsField.input.value = value.extraTlds.join(', ')
    openModeField.select.value = value.openMode
    triggerField.select.value = value.manualTrigger
    contextMenuField.input.checked = value.contextMenu
    excludedField.textarea.value = value.excludedSites.join('\n')
  }

  /** 从表单组装完整设置对象 */
  function readForm() {
    return {
      ...current,
      autoConvert: autoConvertField.input.checked,
      types: {
        url: urlField.input.checked,
        domain: domainField.input.checked,
      },
      aggressiveDomain: aggressiveField.input.checked,
      extraTlds: parseList(extraTldsField.input.value),
      openMode: openModeField.select.value,
      manualTrigger: triggerField.select.value,
      contextMenu: contextMenuField.input.checked,
      excludedSites: parseLines(excludedField.textarea.value),
    }
  }

  // 拖动状态
  let offsetX = 0
  let offsetY = 0
  let drag = null

  function onPointerDown(event) {
    if (event.button !== 0) return
    const rect = panel.getBoundingClientRect()
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
      rect,
    }
    try {
      header.setPointerCapture(event.pointerId)
    } catch (error) {
      // 某些环境不支持指针捕获，忽略即可
    }
    event.preventDefault()
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    const dx = clamp(
      event.clientX - drag.startX,
      -drag.rect.left,
      window.innerWidth - drag.rect.right
    )
    const dy = clamp(
      event.clientY - drag.startY,
      -drag.rect.top,
      window.innerHeight - drag.rect.bottom
    )
    offsetX = drag.offsetX + dx
    offsetY = drag.offsetY + dy
    panel.style.transform = `translate(${offsetX}px, ${offsetY}px)`
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    drag = null
    try {
      if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId)
      }
    } catch (error) {
      // 忽略释放失败
    }
  }

  header.addEventListener('pointerdown', onPointerDown)
  header.addEventListener('pointermove', onPointerMove)
  header.addEventListener('pointerup', onPointerUp)
  header.addEventListener('pointercancel', onPointerUp)

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }
  document.addEventListener('keydown', onKeyDown, true)

  // 点遮罩关闭（用 pointerdown，避免拖动结束误触）
  mask.addEventListener('pointerdown', (event) => {
    if (event.target === mask) close()
  })

  function handleSave() {
    const next = saveSettings(readForm())
    if (typeof onChange === 'function') {
      try {
        onChange(next)
      } catch (error) {
        console.warn('[文本转链接] onChange 回调执行失败', error)
      }
    }
    close()
  }

  function handleReset() {
    const next = resetSettings()
    fillForm(next)
  }

  saveButton.addEventListener('click', handleSave)
  resetButton.addEventListener('click', handleReset)
  cancelButton.addEventListener('click', close)

  function close() {
    if (activeDialog === dialog) activeDialog = null
    document.removeEventListener('keydown', onKeyDown, true)
    if (host.parentNode) host.parentNode.removeChild(host)
  }

  const dialog = { close }
  activeDialog = dialog

  const parent = document.body || document.documentElement
  if (!parent) return
  parent.appendChild(host)
}
