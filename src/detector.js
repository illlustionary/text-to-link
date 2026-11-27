/**
 * 文本识别引擎：只识别 http/https URL 与裸域名。
 * 不处理邮箱、ftp、magnet、ed2k 等其它协议。
 */

// 常见顶级域名（gTLD + 全部 ccTLD + 常用新 gTLD）。
// 故意不收录 bar：让 foo.bar 在安全模式下保持普通单词。
const SAFE_TLDS = new Set(
  `
com cn net org io dev app xyz top cc tv me co info biz edu gov mil site online shop vip club live fun icu work link tech store blog wiki news art design cloud ai gg so to ly gl fm im pro mobi asia name travel museum aero coop jobs cat tel int eu us uk jp kr de fr ru in au ca br it nl se no fi dk ch at be es pt pl cz gr tr il ae sa sg hk tw mo my th vn id ph nz za mx ar cl pe
wang ren xin pub run red blue pink black green plus team group world life love email chat page zone space website host press media studio agency solutions services software systems network digital technology computer codes tools center city global international academy education school university institute foundation charity community social family friends today now click download stream video audio music photo pics gallery graphics games game play sport football basketball tennis golf fishing holiday vacations flights hotels restaurant cafe beer wine food recipes kitchen farm garden flowers eco energy solar health care clinic hospital doctor dental fitness coach yoga beauty hair skin makeup jewelry shoes clothing fashion style wedding party events tickets deals discount sale shopping market auction finance financial bank credit insurance legal lawyer attorney tax accountant realestate properties rentals apartments house construction builders plumbing electrician cleaning repair glass paint lighting furniture decor interior architecture engineering science research bio chem physics math statistics data analytics hosting domains security protection support help guide how tips review reviews ratings compare best new radio film movie cinema theater show band rock jazz hiphop dance tattoo photography productions company business enterprise industries ventures holdings capital fund investments money exchange trading stocks forex crypto bitcoin wallet pay payment card creditcard loans mortgage claims law court police fire army navy airforce veterans military government town village kids baby toys soccer baseball hockey hunting camping outdoors cruises tours coffee tea pizza sushi organic
ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw
`.trim().split(/\s+/),
)

// 既是常见文件后缀、又可能是顶级域名的歧义后缀。
// 没有端口 / 路径 / 查询 / 锚点时按文件名处理，避免把 index.js、archive.zip 全变成链接。
const AMBIGUOUS_EXT = new Set(
  'zip app mov mp4 mp3 png jpg jpeg gif svg pdf doc docx xls xlsx ppt pptx txt md js ts jsx tsx css html htm json xml yml yaml exe dmg rar 7z tar gz sh rs so py'.split(
    /\s+/,
  ),
)

// URL 候选：从 http(s):// 开始，到空白 / 尖括号 / 引号 / 全角空格为止。
// 尾部标点与括号由 trimCandidate 处理。
const URL_RE = /https?:\/\/[^\s<>"'`\u3000]+/gi

// 域名候选：至少一个标签 + 点 + 2-24 位字母 TLD，可带端口、路径、查询、锚点。
const DOMAIN_RE =
  /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?/gi

// IPv4 候选：四段数字，可带端口 / 路径 / 查询 / 锚点。
const IPV4_RE =
  /(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?/g

// 邮箱只用于“占位排除”，本脚本不会把邮箱变成链接。
// 这样 user.name@example.com 里的 user.name 与 example.com 都不会被单独转。
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi

// 行尾标点（中英文），逐轮剥离
const TRAILING_PUNCT = /[.,;:!?'"`#\u3000，。；：！？、]+$/

// 成对括号：右括号多于左括号时剥掉多余的右括号
const BRACKET_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['（', '）'],
  ['【', '】'],
  ['《', '》'],
  ['「', '」'],
  ['『', '』'],
]

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const TLD_RE = /^[a-z]{2,24}$/i
const PUNYCODE_RE = /^xn--[a-z0-9-]{2,59}$/i

/** 统计子串出现次数 */
function countOf(text, token) {
  if (!token) return 0
  return text.split(token).length - 1
}

/**
 * 去掉候选末尾的标点与不平衡的右括号。
 * 例：`https://example.com。` -> `https://example.com`
 *     `https://en.wikipedia.org/wiki/Foo_(bar)` 保持原样
 */
function trimCandidate(raw) {
  let text = String(raw || '')
  if (!text) return ''

  let changed = true
  while (changed) {
    changed = false

    const next = text.replace(TRAILING_PUNCT, '')
    if (next !== text) {
      text = next
      changed = true
    }

    for (const [open, close] of BRACKET_PAIRS) {
      if (!text.endsWith(close)) continue
      if (countOf(text, close) > countOf(text, open)) {
        text = text.slice(0, -1)
        changed = true
      }
    }
  }

  return text
}

/** 规范化调用方传入的选项，兼容 { url } 与 { types: { url } } 两种形式 */
function normalizeOptions(options) {
  const source = options && typeof options === 'object' ? options : {}
  const types = source.types && typeof source.types === 'object' ? source.types : {}

  const extraTlds = Array.isArray(source.extraTlds)
    ? source.extraTlds
        .map((item) => String(item).trim().replace(/^\.+/, '').toLowerCase())
        .filter((item) => /^[a-z0-9-]{2,24}$/.test(item))
    : []

  return {
    url: source.url !== undefined ? source.url !== false : types.url !== false,
    domain:
      source.domain !== undefined ? source.domain !== false : types.domain !== false,
    aggressiveDomain: source.aggressiveDomain === true,
    extraTlds: new Set(extraTlds),
  }
}

/** 拆分 host / port / 其余部分 */
function splitCandidate(raw) {
  const match = /^([^/?#:]+)(?::(\d{1,5}))?([/?#].*)?$/.exec(raw)
  if (!match) return null
  return {
    host: match[1],
    port: match[2] || '',
    rest: match[3] || '',
  }
}

/** 普通域名 host 是否合法 */
function isValidHost(host) {
  if (!host || host.length > 253) return false
  const labels = host.split('.')
  if (labels.length < 2) return false
  if (!labels.every((label) => LABEL_RE.test(label))) return false

  const tld = labels[labels.length - 1]
  return PUNYCODE_RE.test(tld) || TLD_RE.test(tld)
}

/** IPv4 host 是否合法 */
function isValidIPv4(host) {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every(
    (part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
  )
}

/** TLD 是否被允许 */
function isTldAllowed(tld, options) {
  const lower = String(tld || '').toLowerCase()
  if (!lower) return false
  if (options.extraTlds.has(lower)) return true
  if (options.aggressiveDomain) return true
  return SAFE_TLDS.has(lower)
}

/** 端口是否在合法范围内 */
function isValidPort(port) {
  if (!port) return true
  const value = Number(port)
  return Number.isInteger(value) && value >= 1 && value <= 65535
}

/** 域名前后的 ASCII 边界检查，允许中文与标点紧邻 */
function isDomainBoundary(text, start, end) {
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''

  // 邮箱、子域名中间、连字符文件名都不应该从中间截一段出来
  if (before && /[a-z0-9_@.-]/i.test(before)) return false
  if (after && /[a-z0-9_-]/i.test(after)) return false
  // 形如 1.2.3.4.5 的版本号，不要截出前四段
  if (after === '.' && /[a-z0-9]/i.test(text[end + 1] || '')) return false
  return true
}

/** 与已有区间是否重叠 */
function overlapsAny(start, end, ranges) {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)
}

/** 把匹配列表按位置排序，并去掉重叠项 */
function normalizeMatches(matches) {
  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const result = []
  let cursor = -1
  for (const match of matches) {
    if (match.start < cursor) continue
    result.push(match)
    cursor = match.end
  }
  return result
}

/**
 * 识别文本中的链接。
 * @param {string} text
 * @param {{ url?: boolean, domain?: boolean, aggressiveDomain?: boolean, extraTlds?: string[], types?: { url?: boolean, domain?: boolean } }} options
 * @returns {Array<{ start: number, end: number, text: string, href: string, type: 'url'|'domain' }>}
 */
export function detect(text, options = {}) {
  if (typeof text !== 'string' || !text) return []
  if (text.length > 100000) return []

  const settings = normalizeOptions(options)
  const matches = []
  const urlRanges = []
  const emailRanges = []

  // 0. 先占位邮箱区间，后续域名识别整体跳过
  EMAIL_RE.lastIndex = 0
  let email
  while ((email = EMAIL_RE.exec(text)) !== null) {
    emailRanges.push([email.index, email.index + email[0].length])
  }

  // 1. 带协议的 URL
  if (settings.url) {
    URL_RE.lastIndex = 0
    let found
    while ((found = URL_RE.exec(text)) !== null) {
      const raw = trimCandidate(found[0])
      if (!raw || !/^https?:\/\//i.test(raw)) continue

      let valid = false
      try {
        const parsed = new URL(raw)
        valid =
          (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
          Boolean(parsed.hostname)
      } catch {
        valid = false
      }
      if (!valid) continue

      const start = found.index
      const end = start + raw.length
      matches.push({ start, end, text: raw, href: raw, type: 'url' })
      urlRanges.push([start, end])
    }
  }

  if (!settings.domain) return normalizeMatches(matches)

  // 2. IPv4（补 http://，局域网地址更常见）
  IPV4_RE.lastIndex = 0
  let ip
  while ((ip = IPV4_RE.exec(text)) !== null) {
    const raw = trimCandidate(ip[0])
    if (!raw) continue

    const split = splitCandidate(raw)
    if (!split || !isValidIPv4(split.host)) continue
    if (!isValidPort(split.port)) continue

    const start = ip.index
    const end = start + raw.length
    if (overlapsAny(start, end, urlRanges)) continue
    if (overlapsAny(start, end, emailRanges)) continue
    if (!isDomainBoundary(text, start, end)) continue

    matches.push({
      start,
      end,
      text: raw,
      href: `http://${raw}`,
      type: 'domain',
    })
  }

  // 3. 裸域名（补 https://）
  DOMAIN_RE.lastIndex = 0
  let domain
  while ((domain = DOMAIN_RE.exec(text)) !== null) {
    const raw = trimCandidate(domain[0])
    if (!raw) continue

    const start = domain.index
    const end = start + raw.length
    if (overlapsAny(start, end, urlRanges)) continue
    if (overlapsAny(start, end, emailRanges)) continue
    if (!isDomainBoundary(text, start, end)) continue

    const split = splitCandidate(raw)
    if (!split || !isValidHost(split.host)) continue
    if (!isValidPort(split.port)) continue

    const tld = split.host.split('.').pop()
    const hasDomainHint = Boolean(split.port || split.rest)

    // 歧义后缀：没有端口/路径/查询/锚点时按文件名处理；
    // 有附加信息时说明它确实是个域名，允许绕过 TLD 白名单（如 archive.zip/file）。
    if (AMBIGUOUS_EXT.has(tld.toLowerCase())) {
      if (!hasDomainHint) continue
    } else if (!isTldAllowed(tld, settings)) {
      continue
    }

    matches.push({
      start,
      end,
      text: raw,
      href: `https://${raw}`,
      type: 'domain',
    })
  }

  return normalizeMatches(matches)
}
