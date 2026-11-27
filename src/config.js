/**
 * 全局设置契约。所有模块都从这里读取默认值与标签，避免各处硬编码。
 */
export const DEFAULT_SETTINGS = {
  // 自动扫描整页并转换
  autoConvert: true,
  // 识别类型：邮箱与其它协议刻意不做
  types: {
    url: true,
    domain: true,
  },
  // 宽松模式：任意 2-24 位字母后缀都当作域名（默认关）
  aggressiveDomain: false,
  // 额外认可的顶级域名，例如 local / corp / lan
  extraTlds: [],
  // 生成链接的打开方式
  openMode: 'blank', // 'blank' | 'self'
  // 手动触发方式
  manualTrigger: 'dblclick', // 'off' | 'click' | 'dblclick' | 'middle'
  // 是否启用页面右键菜单
  contextMenu: true,
  // 不生效的站点，每项一个域名，支持 *.example.com
  excludedSites: [],
  // 单次自动扫描的节点上限，防止超大页面卡顿
  maxScanNodes: 6000,
}

export const OPEN_MODE_LABELS = {
  blank: '新标签页',
  self: '当前页',
}

export const TRIGGER_LABELS = {
  dblclick: '双击',
  middle: '鼠标中键',
  click: '单击',
  off: '关闭',
}

export const TRIGGER_ORDER = ['dblclick', 'middle', 'click', 'off']
export const OPEN_MODE_ORDER = ['blank', 'self']

/** 深合并设置，兼容旧版本缺失字段与用户手改坏的存储 */
export function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const types = source.types && typeof source.types === 'object' ? source.types : {}

  const extraTlds = Array.isArray(source.extraTlds)
    ? source.extraTlds
        .map((item) => String(item).trim().replace(/^\.+/, '').toLowerCase())
        .filter((item) => /^[a-z0-9-]{2,24}$/.test(item))
    : []

  const excludedSites = Array.isArray(source.excludedSites)
    ? source.excludedSites
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean)
    : []

  return {
    autoConvert: source.autoConvert !== false,
    types: {
      url: types.url !== false,
      domain: types.domain !== false,
    },
    aggressiveDomain: source.aggressiveDomain === true,
    extraTlds: Array.from(new Set(extraTlds)),
    openMode: OPEN_MODE_ORDER.includes(source.openMode) ? source.openMode : 'blank',
    manualTrigger: TRIGGER_ORDER.includes(source.manualTrigger)
      ? source.manualTrigger
      : 'dblclick',
    contextMenu: source.contextMenu !== false,
    excludedSites,
    maxScanNodes:
      Number.isFinite(source.maxScanNodes) && source.maxScanNodes > 0
        ? Math.min(Math.floor(source.maxScanNodes), 50000)
        : DEFAULT_SETTINGS.maxScanNodes,
  }
}

/** 当前站点是否在排除名单内，支持 *.example.com 与 example.com */
export function isSiteExcluded(settings, hostname = location.hostname) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false

  return (settings.excludedSites || []).some((rule) => {
    const pattern = String(rule).trim().toLowerCase()
    if (!pattern) return false
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2)
      return host === base || host.endsWith('.' + base)
    }
    return host === pattern || host.endsWith('.' + pattern)
  })
}
