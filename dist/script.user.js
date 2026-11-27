// ==UserScript==
// @name         网页文本转链接
// @name:en      Text to Link
// @namespace    https://gitee.com/neko_nya/text-to-link
// @description  自动或手动把网页中的纯文本 URL、裸域名转换为可点击链接，支持 ScriptCat 菜单配置打开方式与触发方式
// @version      1.0.0
// @author       neko_nya
// @downloadURL  https://gitee.com/neko_nya/text-to-link/raw/master/dist/script.user.js
// @updateURL    https://gitee.com/neko_nya/text-to-link/raw/master/dist/script.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @noframes
// @tag          文本 链接 转换
// @license      AGPL-3.0
// ==/UserScript==

(() => {
  // src/detector.js
  var SAFE_TLDS = new Set(
    `
com cn net org io dev app xyz top cc tv me co info biz edu gov mil site online shop vip club live fun icu work link tech store blog wiki news art design cloud ai gg so to ly gl fm im pro mobi asia name travel museum aero coop jobs cat tel int eu us uk jp kr de fr ru in au ca br it nl se no fi dk ch at be es pt pl cz gr tr il ae sa sg hk tw mo my th vn id ph nz za mx ar cl pe
wang ren xin pub run red blue pink black green plus team group world life love email chat page zone space website host press media studio agency solutions services software systems network digital technology computer codes tools center city global international academy education school university institute foundation charity community social family friends today now click download stream video audio music photo pics gallery graphics games game play sport football basketball tennis golf fishing holiday vacations flights hotels restaurant cafe beer wine food recipes kitchen farm garden flowers eco energy solar health care clinic hospital doctor dental fitness coach yoga beauty hair skin makeup jewelry shoes clothing fashion style wedding party events tickets deals discount sale shopping market auction finance financial bank credit insurance legal lawyer attorney tax accountant realestate properties rentals apartments house construction builders plumbing electrician cleaning repair glass paint lighting furniture decor interior architecture engineering science research bio chem physics math statistics data analytics hosting domains security protection support help guide how tips review reviews ratings compare best new radio film movie cinema theater show band rock jazz hiphop dance tattoo photography productions company business enterprise industries ventures holdings capital fund investments money exchange trading stocks forex crypto bitcoin wallet pay payment card creditcard loans mortgage claims law court police fire army navy airforce veterans military government town village kids baby toys soccer baseball hockey hunting camping outdoors cruises tours coffee tea pizza sushi organic
ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw
`.trim().split(/\s+/)
  ), AMBIGUOUS_EXT = new Set(
    "zip app mov mp4 mp3 png jpg jpeg gif svg pdf doc docx xls xlsx ppt pptx txt md js ts jsx tsx css html htm json xml yml yaml exe dmg rar 7z tar gz sh rs so py".split(
      /\s+/
    )
  ), URL_RE = /https?:\/\/[^\s<>"'`\u3000]+/gi, DOMAIN_RE = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?/gi, IPV4_RE = /(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?/g, EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi, TRAILING_PUNCT = /[.,;:!?'"`#\u3000，。；：！？、]+$/, BRACKET_PAIRS = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["\uFF08", "\uFF09"],
    ["\u3010", "\u3011"],
    ["\u300A", "\u300B"],
    ["\u300C", "\u300D"],
    ["\u300E", "\u300F"]
  ], LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i, TLD_RE = /^[a-z]{2,24}$/i, PUNYCODE_RE = /^xn--[a-z0-9-]{2,59}$/i;
  function countOf(text, token) {
    return token ? text.split(token).length - 1 : 0;
  }
  function trimCandidate(raw) {
    let text = String(raw || "");
    if (!text) return "";
    let changed = !0;
    for (; changed; ) {
      changed = !1;
      let next = text.replace(TRAILING_PUNCT, "");
      next !== text && (text = next, changed = !0);
      for (let [open, close] of BRACKET_PAIRS)
        text.endsWith(close) && countOf(text, close) > countOf(text, open) && (text = text.slice(0, -1), changed = !0);
    }
    return text;
  }
  function normalizeOptions(options) {
    let source = options && typeof options == "object" ? options : {}, types = source.types && typeof source.types == "object" ? source.types : {}, extraTlds = Array.isArray(source.extraTlds) ? source.extraTlds.map((item) => String(item).trim().replace(/^\.+/, "").toLowerCase()).filter((item) => /^[a-z0-9-]{2,24}$/.test(item)) : [];
    return {
      url: source.url !== void 0 ? source.url !== !1 : types.url !== !1,
      domain: source.domain !== void 0 ? source.domain !== !1 : types.domain !== !1,
      aggressiveDomain: source.aggressiveDomain === !0,
      extraTlds: new Set(extraTlds)
    };
  }
  function splitCandidate(raw) {
    let match = /^([^/?#:]+)(?::(\d{1,5}))?([/?#].*)?$/.exec(raw);
    return match ? {
      host: match[1],
      port: match[2] || "",
      rest: match[3] || ""
    } : null;
  }
  function isValidHost(host) {
    if (!host || host.length > 253) return !1;
    let labels = host.split(".");
    if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label))) return !1;
    let tld = labels[labels.length - 1];
    return PUNYCODE_RE.test(tld) || TLD_RE.test(tld);
  }
  function isValidIPv4(host) {
    let parts = host.split(".");
    return parts.length !== 4 ? !1 : parts.every(
      (part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255
    );
  }
  function isTldAllowed(tld, options) {
    let lower = String(tld || "").toLowerCase();
    return lower ? options.extraTlds.has(lower) || options.aggressiveDomain ? !0 : SAFE_TLDS.has(lower) : !1;
  }
  function isValidPort(port) {
    if (!port) return !0;
    let value = Number(port);
    return Number.isInteger(value) && value >= 1 && value <= 65535;
  }
  function isDomainBoundary(text, start, end) {
    let before = start > 0 ? text[start - 1] : "", after = end < text.length ? text[end] : "";
    return !(before && /[a-z0-9_@.-]/i.test(before) || after && /[a-z0-9_-]/i.test(after) || after === "." && /[a-z0-9]/i.test(text[end + 1] || ""));
  }
  function overlapsAny(start, end, ranges) {
    return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
  }
  function normalizeMatches(matches) {
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    let result = [], cursor = -1;
    for (let match of matches)
      match.start < cursor || (result.push(match), cursor = match.end);
    return result;
  }
  function detect(text, options = {}) {
    if (typeof text != "string" || !text) return [];
    if (text.length > 1e5) return [];
    let settings = normalizeOptions(options), matches = [], urlRanges = [], emailRanges = [];
    EMAIL_RE.lastIndex = 0;
    let email;
    for (; (email = EMAIL_RE.exec(text)) !== null; )
      emailRanges.push([email.index, email.index + email[0].length]);
    if (settings.url) {
      URL_RE.lastIndex = 0;
      let found;
      for (; (found = URL_RE.exec(text)) !== null; ) {
        let raw = trimCandidate(found[0]);
        if (!raw || !/^https?:\/\//i.test(raw)) continue;
        let valid = !1;
        try {
          let parsed = new URL(raw);
          valid = (parsed.protocol === "http:" || parsed.protocol === "https:") && !!parsed.hostname;
        } catch {
          valid = !1;
        }
        if (!valid) continue;
        let start = found.index, end = start + raw.length;
        matches.push({ start, end, text: raw, href: raw, type: "url" }), urlRanges.push([start, end]);
      }
    }
    if (!settings.domain) return normalizeMatches(matches);
    IPV4_RE.lastIndex = 0;
    let ip;
    for (; (ip = IPV4_RE.exec(text)) !== null; ) {
      let raw = trimCandidate(ip[0]);
      if (!raw) continue;
      let split = splitCandidate(raw);
      if (!split || !isValidIPv4(split.host) || !isValidPort(split.port)) continue;
      let start = ip.index, end = start + raw.length;
      overlapsAny(start, end, urlRanges) || overlapsAny(start, end, emailRanges) || isDomainBoundary(text, start, end) && matches.push({
        start,
        end,
        text: raw,
        href: `http://${raw}`,
        type: "domain"
      });
    }
    DOMAIN_RE.lastIndex = 0;
    let domain;
    for (; (domain = DOMAIN_RE.exec(text)) !== null; ) {
      let raw = trimCandidate(domain[0]);
      if (!raw) continue;
      let start = domain.index, end = start + raw.length;
      if (overlapsAny(start, end, urlRanges) || overlapsAny(start, end, emailRanges) || !isDomainBoundary(text, start, end)) continue;
      let split = splitCandidate(raw);
      if (!split || !isValidHost(split.host) || !isValidPort(split.port)) continue;
      let tld = split.host.split(".").pop(), hasDomainHint = !!(split.port || split.rest);
      if (AMBIGUOUS_EXT.has(tld.toLowerCase())) {
        if (!hasDomainHint) continue;
      } else if (!isTldAllowed(tld, settings))
        continue;
      matches.push({
        start,
        end,
        text: raw,
        href: `https://${raw}`,
        type: "domain"
      });
    }
    return normalizeMatches(matches);
  }

  // src/converter.js
  var CONVERTED_CLASS = "t2l-link", UI_ATTR = "data-t2l-ui", DONE_ATTR = "data-t2l-done", SKIP_TAGS = /* @__PURE__ */ new Set([
    "A",
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "BUTTON",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "SVG",
    "MATH",
    "CANVAS",
    "VIDEO",
    "AUDIO",
    "IFRAME",
    "HEAD",
    "TITLE",
    "META",
    "LINK",
    "TEMPLATE"
  ]), convertedNodes = /* @__PURE__ */ new WeakSet();
  function getView(el) {
    let doc = el && el.ownerDocument;
    return doc && doc.defaultView || (typeof window < "u" ? window : null);
  }
  function isInvisible(el) {
    let view = getView(el);
    if (!view || typeof view.getComputedStyle != "function") return !1;
    try {
      let style = view.getComputedStyle(el);
      return style ? style.display === "none" || style.visibility === "hidden" : !1;
    } catch {
      return !1;
    }
  }
  function isConvertedLink(el) {
    if (!el || el.nodeType !== 1) return !1;
    if (el.classList && el.classList.contains(CONVERTED_CLASS)) return !0;
    let className = el.getAttribute && el.getAttribute("class");
    return typeof className == "string" && className.split(/\s+/).includes(CONVERTED_CLASS);
  }
  function isSkippedElement(el) {
    let current = el && el.nodeType === 1 ? el : el && el.parentElement, guard = 0;
    for (; current && current.nodeType === 1 && guard < 100; ) {
      if (guard += 1, SKIP_TAGS.has(current.tagName)) return !0;
      let editable = current.getAttribute && current.getAttribute("contenteditable");
      if (current.isContentEditable === !0 || editable === "" || editable === "true" || editable === "plaintext-only" || current.hasAttribute && current.hasAttribute(UI_ATTR) || isConvertedLink(current) || isInvisible(current)) return !0;
      let root = current.getRootNode && current.getRootNode();
      root && root.host && root.host !== current ? current = root.host : current = current.parentElement;
    }
    return !1;
  }
  function getDocument(node) {
    return node && node.ownerDocument || (typeof document < "u" ? document : null);
  }
  function normalizeMatches2(matches, length) {
    if (!Array.isArray(matches) || matches.length === 0) return [];
    let list = [];
    for (let match of matches) {
      if (!match || typeof match != "object") continue;
      let start = Math.floor(Number(match.start)), end = Math.floor(Number(match.end));
      !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > length || end <= start || list.push({ match, start, end });
    }
    list.sort((a, b) => a.start - b.start || b.end - a.end);
    let result = [], cursor = 0;
    for (let item of list)
      item.start < cursor || (result.push(item), cursor = item.end);
    return result;
  }
  function createLink(doc, match, displayText, openMode) {
    let link = doc.createElement("a");
    return link.textContent = displayText, link.setAttribute("href", match.href), link.className = CONVERTED_CLASS, link.target = openMode === "self" ? "_self" : "_blank", openMode !== "self" && (link.rel = "noopener noreferrer"), link.title = match.href, link.dataset.t2lType = match.type, link.dataset.t2lHref = match.href, link;
  }
  function buildFragment(doc, text, matches, openMode, before = "", after = "") {
    let fragment = doc.createDocumentFragment();
    before && fragment.appendChild(doc.createTextNode(before));
    let list = normalizeMatches2(matches, text.length);
    if (list.length === 0)
      return after && fragment.appendChild(doc.createTextNode(after)), { fragment, count: 0 };
    let cursor = 0, count = 0;
    for (let item of list) {
      let { match, start, end } = item;
      start > cursor && fragment.appendChild(doc.createTextNode(text.slice(cursor, start)));
      let displayText = match.text != null ? String(match.text) : text.slice(start, end);
      fragment.appendChild(createLink(doc, match, displayText, openMode)), cursor = end, count += 1;
    }
    return cursor < text.length && fragment.appendChild(doc.createTextNode(text.slice(cursor))), after && fragment.appendChild(doc.createTextNode(after)), { fragment, count };
  }
  function markDone(element) {
    element && element.setAttribute && element.setAttribute(DONE_ATTR, "1");
  }
  function convertTextNode(node, options = {}) {
    if (!node || node.nodeType !== 3) return 0;
    let text = node.nodeValue;
    if (!text || typeof node.isConnected == "boolean" && !node.isConnected) return 0;
    let parent = node.parentElement;
    if (!parent || convertedNodes.has(node) || isSkippedElement(parent)) return 0;
    let detect2 = options && options.detect;
    if (typeof detect2 != "function") return 0;
    let matches = null;
    try {
      matches = detect2(text, options);
    } catch {
      return 0;
    }
    if (!Array.isArray(matches) || matches.length === 0) return 0;
    let doc = getDocument(node);
    if (!doc) return 0;
    let openMode = options.openMode === "self" ? "self" : "blank", { fragment, count } = buildFragment(doc, text, matches, openMode);
    return count === 0 ? 0 : (convertedNodes.add(node), node.replaceWith(fragment), options.markDone !== !1 && markDone(parent), count);
  }
  function getShowText(doc) {
    if (typeof NodeFilter < "u" && NodeFilter.SHOW_TEXT) return NodeFilter.SHOW_TEXT;
    let view = doc && doc.defaultView;
    return view && view.NodeFilter && view.NodeFilter.SHOW_TEXT ? view.NodeFilter.SHOW_TEXT : 4;
  }
  function collectTextNodes(root, limit = 1 / 0) {
    let doc = getDocument(root);
    if (!doc) return [];
    let nodes = [], walker = null;
    try {
      walker = doc.createTreeWalker(root, getShowText(doc), null);
    } catch {
      return nodes;
    }
    let current = walker.nextNode();
    for (; current && nodes.length < limit; )
      nodes.push(current), current = walker.nextNode();
    return nodes;
  }
  function convertElement(root, options = {}) {
    if (!root) return 0;
    let element = root;
    if (root.nodeType === 9 ? element = root.documentElement : root.nodeType !== 1 && (element = root.parentElement), !element || element.nodeType !== 1 || isSkippedElement(element)) return 0;
    let rawLimit = Number(options.maxScanNodes ?? options.maxNodes), limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 1 / 0, nodes = collectTextNodes(element, limit), total = 0;
    for (let node of nodes)
      total += convertTextNode(node, options);
    return total;
  }
  function findFirstTextNode(node) {
    if (!node) return null;
    if (node.nodeType === 3) return node.nodeValue && node.nodeValue.trim() ? node : null;
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return null;
    let children = node.childNodes || [];
    for (let child of children) {
      let found = findFirstTextNode(child);
      if (found) return found;
    }
    return null;
  }
  function inConvertedLink(node) {
    let current = node && node.nodeType === 1 ? node : node && node.parentElement;
    for (; current && current.nodeType === 1; ) {
      if (isConvertedLink(current)) return !0;
      current = current.parentElement;
    }
    return !1;
  }
  function getTextNodeAtPoint(x, y) {
    let doc = typeof document < "u" ? document : null;
    if (!doc) return null;
    let node = null, offset = 0;
    if (typeof doc.caretRangeFromPoint == "function")
      try {
        let range = doc.caretRangeFromPoint(x, y);
        range && (node = range.startContainer, offset = range.startOffset);
      } catch {
        node = null;
      }
    if (!node && typeof doc.caretPositionFromPoint == "function")
      try {
        let position = doc.caretPositionFromPoint(x, y);
        position && (node = position.offsetNode, offset = position.offset);
      } catch {
        node = null;
      }
    if (!node) return null;
    if (node.nodeType === 1) {
      if (node = findFirstTextNode(node), !node) return null;
      offset = 0;
    }
    return node.nodeType !== 3 || inConvertedLink(node) ? null : { node, offset };
  }
  function getSelectedTextInfo() {
    let win = typeof window < "u" ? window : null;
    if (!win || typeof win.getSelection != "function") return null;
    let selection = win.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    let text = selection.toString();
    if (!text || !text.trim()) return null;
    let range = selection.getRangeAt(0), node = range.startContainer;
    return !node || node.nodeType !== 3 ? null : { text, range, node };
  }
  function convertSelection(options = {}) {
    let info = getSelectedTextInfo();
    if (!info) return 0;
    let { range, node } = info;
    if (!node || node.nodeType !== 3 || range.startContainer !== node || range.endContainer !== node || convertedNodes.has(node) || typeof node.isConnected == "boolean" && !node.isConnected) return 0;
    let parent = node.parentElement;
    if (!parent || isSkippedElement(parent)) return 0;
    let detect2 = options && options.detect;
    if (typeof detect2 != "function") return 0;
    let fullText = node.nodeValue || "", start = Math.max(0, Math.min(range.startOffset, fullText.length)), end = Math.max(start, Math.min(range.endOffset, fullText.length));
    if (end <= start) return 0;
    let selected = fullText.slice(start, end);
    if (!selected) return 0;
    let matches = null;
    try {
      matches = detect2(selected, options);
    } catch {
      return 0;
    }
    if (!Array.isArray(matches) || matches.length === 0) return 0;
    let doc = getDocument(node);
    if (!doc) return 0;
    let openMode = options.openMode === "self" ? "self" : "blank", { fragment, count } = buildFragment(
      doc,
      selected,
      matches,
      openMode,
      fullText.slice(0, start),
      fullText.slice(end)
    );
    if (count === 0) return 0;
    convertedNodes.add(node), node.replaceWith(fragment), options.markDone !== !1 && markDone(parent);
    let win = typeof window < "u" ? window : null;
    if (win && typeof win.getSelection == "function")
      try {
        let selection = win.getSelection();
        selection && typeof selection.removeAllRanges == "function" && selection.removeAllRanges();
      } catch {
      }
    return count;
  }
  function convertAtPoint(x, y, options = {}) {
    let hit = getTextNodeAtPoint(x, y);
    return !hit || !hit.node ? 0 : convertTextNode(hit.node, options);
  }

  // src/auto.js
  var DEBOUNCE_MS = 350, CHUNK_SIZE = 100, DEFAULT_MAX_SCAN_NODES = 6e3, IGNORE_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "NOSCRIPT"]);
  function getShowText2(doc) {
    if (typeof NodeFilter < "u" && NodeFilter.SHOW_TEXT) return NodeFilter.SHOW_TEXT;
    let view = doc && doc.defaultView;
    return view && view.NodeFilter && view.NodeFilter.SHOW_TEXT ? view.NodeFilter.SHOW_TEXT : 4;
  }
  function shouldIgnoreElement(el) {
    if (!el || el.nodeType !== 1 || IGNORE_TAGS.has(el.tagName) || el.hasAttribute && el.hasAttribute(UI_ATTR) || el.classList && el.classList.contains(CONVERTED_CLASS)) return !0;
    let className = el.getAttribute && el.getAttribute("class");
    return !!(typeof className == "string" && className.split(/\s+/).includes(CONVERTED_CLASS));
  }
  function isDetached(node) {
    return typeof node.isConnected == "boolean" && !node.isConnected;
  }
  function buildOptions(settings, detect2) {
    let source = settings && typeof settings == "object" ? settings : {};
    return {
      ...source,
      detect: detect2,
      openMode: source.openMode === "self" ? "self" : "blank",
      markDone: !0
    };
  }
  function startAutoConvert({ getSettings, detect: detect2, onConvert } = {}) {
    let settingsFn = typeof getSettings == "function" ? getSettings : () => ({}), detectFn = typeof detect2 == "function" ? detect2 : null, notify2 = typeof onConvert == "function" ? onConvert : null, observer = null, stopped = !1, debounceTimer = null, idleId = null, idleView = null, timeoutId = null, running = !1, pendingElements = [], pendingTexts = [];
    function readSettings() {
      try {
        return settingsFn() || {};
      } catch {
        return {};
      }
    }
    function readMaxNodes(settings) {
      let value = Number(settings.maxScanNodes);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_SCAN_NODES;
    }
    function cancelIdle() {
      if (idleId !== null && idleView && typeof idleView.cancelIdleCallback == "function")
        try {
          idleView.cancelIdleCallback(idleId);
        } catch {
        }
      idleId = null, idleView = null, timeoutId !== null && (clearTimeout(timeoutId), timeoutId = null);
    }
    function scheduleIdle(task) {
      let view = typeof window < "u" ? window : null;
      if (view && typeof view.requestIdleCallback == "function") {
        idleView = view, idleId = view.requestIdleCallback(
          () => {
            idleId = null, idleView = null, task();
          },
          { timeout: 1e3 }
        );
        return;
      }
      timeoutId = setTimeout(() => {
        timeoutId = null, task();
      }, 0);
    }
    function schedule() {
      stopped || (debounceTimer !== null && clearTimeout(debounceTimer), debounceTimer = setTimeout(() => {
        debounceTimer = null, flush();
      }, DEBOUNCE_MS));
    }
    function collectElementTexts(element, pushText, budget) {
      if (budget.left <= 0 || !element || element.nodeType !== 1 || isDetached(element) || isSkippedElement(element)) return;
      let doc = element.ownerDocument;
      if (!doc || typeof doc.createTreeWalker != "function") return;
      let walker = null;
      try {
        walker = doc.createTreeWalker(element, getShowText2(doc), null);
      } catch {
        return;
      }
      let current = walker.nextNode();
      for (; current && budget.left > 0; )
        pushText(current), current = walker.nextNode();
    }
    function flush() {
      if (stopped || running) return;
      let settings = readSettings(), maxNodes = readMaxNodes(settings), elements = pendingElements, texts = pendingTexts;
      if (pendingElements = [], pendingTexts = [], !detectFn) return;
      let tasks = [], seen = /* @__PURE__ */ new WeakSet(), budget = { left: maxNodes }, pushText = (node) => {
        if (budget.left <= 0 || !node || node.nodeType !== 3 || !node.nodeValue || !node.nodeValue.trim() || isDetached(node) || seen.has(node)) return;
        seen.add(node);
        let parent = node.parentElement;
        !parent || isSkippedElement(parent) || (tasks.push(node), budget.left -= 1);
      };
      for (let element of elements) {
        if (budget.left <= 0) break;
        shouldIgnoreElement(element) || collectElementTexts(element, pushText, budget);
      }
      for (let node of texts) {
        if (budget.left <= 0) break;
        pushText(node);
      }
      if (tasks.length === 0) return;
      running = !0;
      let index = 0, converted = 0, runChunk = () => {
        if (stopped) {
          running = !1;
          return;
        }
        let currentSettings = readSettings(), currentOptions = buildOptions(currentSettings, detectFn), end = Math.min(index + CHUNK_SIZE, tasks.length);
        for (; index < end; index += 1) {
          let node = tasks[index];
          isDetached(node) || (converted += convertTextNode(node, currentOptions));
        }
        if (index < tasks.length) {
          scheduleIdle(runChunk);
          return;
        }
        if (running = !1, converted > 0 && notify2)
          try {
            notify2(converted);
          } catch {
          }
        !stopped && (pendingElements.length > 0 || pendingTexts.length > 0) && schedule();
      };
      scheduleIdle(runChunk);
    }
    function handleMutations(mutations) {
      if (!stopped) {
        for (let mutation of mutations)
          if (mutation.type === "childList")
            for (let node of mutation.addedNodes)
              node.nodeType === 1 ? shouldIgnoreElement(node) || pendingElements.push(node) : node.nodeType === 3 && node.nodeValue && node.nodeValue.trim() && pendingTexts.push(node);
          else if (mutation.type === "characterData") {
            let node = mutation.target;
            node && node.nodeType === 3 && node.nodeValue && node.nodeValue.trim() && pendingTexts.push(node);
          }
        schedule();
      }
    }
    function rescan() {
      if (!detectFn) return 0;
      let doc = typeof document < "u" ? document : null;
      if (!doc || !doc.body) return 0;
      let settings = readSettings(), count = convertElement(doc.body, buildOptions(settings, detectFn));
      if (count > 0 && notify2)
        try {
          notify2(count);
        } catch {
        }
      return count;
    }
    function stop() {
      if (stopped = !0, running = !1, observer) {
        try {
          observer.disconnect();
        } catch {
        }
        observer = null;
      }
      debounceTimer !== null && (clearTimeout(debounceTimer), debounceTimer = null), cancelIdle(), pendingElements = [], pendingTexts = [];
    }
    rescan();
    let MO = typeof MutationObserver < "u" ? MutationObserver : typeof window < "u" ? window.MutationObserver : null;
    return MO && typeof document < "u" && document.documentElement && (observer = new MO(handleMutations), observer.observe(document.documentElement, {
      childList: !0,
      subtree: !0,
      characterData: !0
    })), { stop, rescan };
  }

  // src/style.css
  var style_default = `/**
 * \u4EC5\u4FDD\u7559 toast \u8FD9\u7C7B\u5FC5\u987B\u6302\u5728\u9875\u9762\u4E0A\u7684\u5168\u5C40\u6837\u5F0F\u3002
 * \u8BBE\u7F6E\u6846\u6837\u5F0F\u5168\u90E8\u4F4D\u4E8E Shadow DOM \u5185\uFF0C\u907F\u514D\u6C61\u67D3\u5BBF\u4E3B\u9875\u9762\u3002
 */

.t2l-toast {
  position: fixed;
  left: 50%;
  bottom: 48px;
  z-index: 2147483647;
  max-width: min(80vw, 420px);
  padding: 10px 16px;
  color: #ffffff;
  background: rgba(20, 20, 22, 0.92);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  word-break: break-word;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.t2l-toast--show {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .t2l-toast {
    transition: none;
  }
}
`;

  // src/ui.js
  var styleInjected = !1, toastEl = null, toastTimer = 0;
  function ensureStyle() {
    if (styleInjected || typeof document > "u") return;
    if (document.getElementById("t2l-style")) {
      styleInjected = !0;
      return;
    }
    let parent = document.head || document.documentElement;
    if (!parent) return;
    let style = document.createElement("style");
    style.id = "t2l-style", style.setAttribute("data-t2l-ui", ""), style.textContent = style_default, parent.appendChild(style), styleInjected = !0;
  }
  function showToast(text, duration = 2600) {
    typeof document > "u" || !document.body || (ensureStyle(), (!toastEl || !toastEl.isConnected) && (toastEl = document.createElement("div"), toastEl.className = "t2l-toast", toastEl.setAttribute("data-t2l-ui", ""), toastEl.setAttribute("role", "status"), toastEl.setAttribute("aria-live", "polite"), document.body.appendChild(toastEl)), toastEl.textContent = text, toastEl.offsetWidth, toastEl.classList.add("t2l-toast--show"), toastTimer && clearTimeout(toastTimer), toastTimer = setTimeout(() => {
      toastTimer = 0, toastEl && toastEl.classList.remove("t2l-toast--show");
    }, Math.max(0, Number(duration) || 0)));
  }

  // src/manual.js
  var MENU_CSS = `
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
`, CLICK_DELAY = 260, DRAG_THRESHOLD_SQ = 25, MENU_GAP = 8, TOAST_DURATION = 1800;
  function installManualTriggers({ getSettings, detect: detect2 } = {}) {
    if (typeof getSettings != "function" || typeof detect2 != "function")
      return () => {
      };
    let clickTimer = 0, pointerDown = null, middleDown = !1, menuState = null, disposers = [];
    function safe(handler) {
      return function(event) {
        try {
          return handler(event);
        } catch {
          return;
        }
      };
    }
    function listen(target, type, handler, options) {
      try {
        target.addEventListener(type, handler, options), disposers.push(() => {
          try {
            target.removeEventListener(type, handler, options);
          } catch {
          }
        });
      } catch {
      }
    }
    function makeOptions(settings) {
      let source = settings && typeof settings == "object" ? settings : {};
      return {
        ...source,
        detect: detect2,
        openMode: source.openMode === "self" ? "self" : "blank",
        markDone: !0
      };
    }
    function currentOptions() {
      return makeOptions(getSettings());
    }
    function notify2(count) {
      if (!(!count || count <= 0))
        try {
          showToast(`\u5DF2\u8F6C\u6362 ${count} \u5904\u6587\u672C`, TOAST_DURATION);
        } catch {
        }
    }
    function hasMatch(text, options) {
      if (!text || !text.trim()) return !1;
      try {
        let result = detect2(text, options);
        return Array.isArray(result) || result && typeof result == "object" && typeof result.length == "number" ? result.length > 0 : !!result;
      } catch {
        return !1;
      }
    }
    function resolveElement(target) {
      return target ? target.nodeType === 1 ? target : target.nodeType === 3 && target.parentElement || null : null;
    }
    function isSkippedTarget(target) {
      let el = resolveElement(target);
      if (!el) return !0;
      try {
        return el.closest && el.closest("[data-t2l-ui]") ? !0 : !!isSkippedElement(el);
      } catch {
        return !0;
      }
    }
    function isModified(event) {
      return !!(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);
    }
    function movedFar(event, down) {
      if (!down) return !1;
      let dx = event.clientX - down.x, dy = event.clientY - down.y;
      return dx * dx + dy * dy > DRAG_THRESHOLD_SQ;
    }
    function hasActiveSelection() {
      try {
        let selection = window.getSelection();
        return !!(selection && !selection.isCollapsed && selection.toString().trim());
      } catch {
        return !1;
      }
    }
    function clearClickTimer() {
      if (clickTimer) {
        try {
          clearTimeout(clickTimer);
        } catch {
        }
        clickTimer = 0;
      }
    }
    let onMouseDown = safe((event) => {
      if (event.button === 1) {
        middleDown = !1;
        let settings = getSettings();
        if (settings.manualTrigger !== "middle" || isModified(event) || isSkippedTarget(event.target)) return;
        middleDown = !0, event.preventDefault(), notify2(convertAtPoint(event.clientX, event.clientY, makeOptions(settings)));
        return;
      }
      event.button === 0 && (pointerDown = { x: event.clientX, y: event.clientY });
    }), onMouseUp = safe((event) => {
      event.button === 1 && middleDown && (middleDown = !1, event.preventDefault());
    }), onClick = safe((event) => {
      let down = pointerDown;
      if (pointerDown = null, getSettings().manualTrigger !== "click" || event.detail === 0 || isModified(event) || isSkippedTarget(event.target) || movedFar(event, down) || hasActiveSelection()) return;
      let x = event.clientX, y = event.clientY;
      clearClickTimer(), clickTimer = window.setTimeout(() => {
        clickTimer = 0;
        try {
          let latest = getSettings();
          if (latest.manualTrigger !== "click") return;
          notify2(convertAtPoint(x, y, makeOptions(latest)));
        } catch {
        }
      }, CLICK_DELAY);
    }), onDblClick = safe((event) => {
      clearClickTimer();
      let settings = getSettings();
      if (settings.manualTrigger !== "dblclick" || isModified(event) || isSkippedTarget(event.target)) return;
      let options = makeOptions(settings), info = getSelectedTextInfo();
      if (info && info.text && hasMatch(info.text, options)) {
        notify2(convertSelection(options));
        return;
      }
      notify2(convertAtPoint(event.clientX, event.clientY, options));
    });
    function eventInsideHost(event, host) {
      try {
        return typeof event.composedPath == "function" ? event.composedPath().includes(host) : event.target === host || !!(host.contains && host.contains(event.target));
      } catch {
        return !1;
      }
    }
    function closeMenu() {
      let state = menuState;
      if (state) {
        menuState = null;
        try {
          document.removeEventListener("keydown", state.onKeyDown, !0), document.removeEventListener("mousedown", state.onOutside, !0), document.removeEventListener("scroll", closeMenu, !0), window.removeEventListener("resize", closeMenu, !0), window.removeEventListener("blur", closeMenu, !0), state.host.parentNode && state.host.parentNode.removeChild(state.host);
        } catch {
        }
      }
    }
    function pushItem(items, seen, label, action) {
      seen.has(label) || (seen.add(label), items.push({ label, action }));
    }
    function runAction(action) {
      try {
        let result = action();
        result && typeof result.catch == "function" && result.catch(() => {
        });
      } catch {
      }
    }
    async function copyText(text) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText == "function") {
          await navigator.clipboard.writeText(text), showToast("\u94FE\u63A5\u5DF2\u590D\u5236", TOAST_DURATION);
          return;
        }
      } catch {
      }
      try {
        let area = document.createElement("textarea");
        area.value = text, area.setAttribute("readonly", ""), area.style.cssText = "position: fixed; top: 0; left: -9999px; opacity: 0;", (document.body || document.documentElement).appendChild(area), area.select(), area.setSelectionRange(0, area.value.length);
        let ok = document.execCommand("copy");
        area.remove(), ok && showToast("\u94FE\u63A5\u5DF2\u590D\u5236", TOAST_DURATION);
      } catch {
      }
    }
    function buildContextItems(event, settings) {
      let items = [], seen = /* @__PURE__ */ new Set(), options = makeOptions(settings), x = event.clientX, y = event.clientY, el = resolveElement(event.target), anchor = el && el.closest ? el.closest("a") : null;
      if (anchor) {
        if (!anchor.matches || !anchor.matches("a.t2l-link")) return items;
        let href = anchor.href || anchor.getAttribute("href") || "";
        return href && (pushItem(items, seen, "\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00", () => {
          try {
            window.open(href, "_blank", "noopener");
          } catch {
          }
        }), pushItem(items, seen, "\u590D\u5236\u94FE\u63A5", () => {
          copyText(href);
        })), items;
      }
      let info = getSelectedTextInfo();
      info && info.text && info.node && info.node.nodeType === 3 && info.range && info.range.endContainer === info.node && hasMatch(info.text, options) && pushItem(items, seen, "\u8F6C\u6362\u9009\u4E2D\u6587\u672C\u4E3A\u94FE\u63A5", () => {
        notify2(convertSelection(currentOptions()));
      });
      let point = getTextNodeAtPoint(x, y);
      return point && point.node && hasMatch(point.node.textContent || "", options) && pushItem(items, seen, "\u8F6C\u6362\u6B64\u5904\u6587\u672C\u4E3A\u94FE\u63A5", () => {
        notify2(convertAtPoint(x, y, currentOptions()));
      }), items;
    }
    function openMenu(x, y, items) {
      if (closeMenu(), !!items.length)
        try {
          let host = document.createElement("div");
          host.setAttribute("data-t2l-ui", ""), host.style.cssText = "all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; visibility: hidden;";
          let shadow = host.attachShadow({ mode: "open" }), style = document.createElement("style");
          style.textContent = MENU_CSS;
          let menu = document.createElement("div");
          menu.className = "menu", menu.setAttribute("role", "menu");
          for (let item of items) {
            let button = document.createElement("button");
            button.type = "button", button.className = "item", button.setAttribute("role", "menuitem"), button.textContent = item.label, button.addEventListener("click", (event) => {
              event.preventDefault(), event.stopPropagation(), closeMenu(), runAction(item.action);
            }), menu.appendChild(button);
          }
          shadow.appendChild(style), shadow.appendChild(menu);
          let parent = document.documentElement || document.body;
          if (!parent) return;
          parent.appendChild(host);
          let rect = menu.getBoundingClientRect(), vw = window.innerWidth || document.documentElement.clientWidth || 0, vh = window.innerHeight || document.documentElement.clientHeight || 0, left = x, top = y;
          left + rect.width > vw - MENU_GAP && (left = x - rect.width), top + rect.height > vh - MENU_GAP && (top = y - rect.height), left = Math.max(MENU_GAP, Math.min(left, vw - rect.width - MENU_GAP)), top = Math.max(MENU_GAP, Math.min(top, vh - rect.height - MENU_GAP)), menu.style.left = `${left}px`, menu.style.top = `${top}px`, host.style.visibility = "visible";
          let onKeyDown = (event) => {
            try {
              if (event.key === "Escape") {
                event.preventDefault(), event.stopPropagation(), closeMenu();
                return;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                let buttons = Array.from(menu.querySelectorAll(".item"));
                if (!buttons.length) return;
                event.preventDefault();
                let active = shadow.activeElement, index = buttons.indexOf(active);
                event.key === "ArrowDown" ? index = index < 0 ? 0 : (index + 1) % buttons.length : index = index <= 0 ? buttons.length - 1 : index - 1, buttons[index].focus({ preventScroll: !0 });
              }
            } catch {
            }
          }, onOutside = (event) => {
            eventInsideHost(event, host) || closeMenu();
          };
          document.addEventListener("keydown", onKeyDown, !0), document.addEventListener("mousedown", onOutside, !0), document.addEventListener("scroll", closeMenu, !0), window.addEventListener("resize", closeMenu, !0), window.addEventListener("blur", closeMenu, !0), menuState = { host, onKeyDown, onOutside };
        } catch {
        }
    }
    let onContextMenu = safe((event) => {
      if (menuState && eventInsideHost(event, menuState.host)) {
        event.preventDefault();
        return;
      }
      let settings = getSettings();
      if (!settings.contextMenu) return;
      let items = buildContextItems(event, settings);
      items.length && (event.preventDefault(), event.stopPropagation(), openMenu(event.clientX, event.clientY, items));
    });
    return listen(document, "mousedown", onMouseDown, !0), listen(document, "mouseup", onMouseUp, !0), listen(document, "click", onClick, !0), listen(document, "dblclick", onDblClick, !0), listen(document, "contextmenu", onContextMenu, !0), function() {
      clearClickTimer(), pointerDown = null, middleDown = !1, closeMenu();
      for (let off of disposers.splice(0))
        try {
          off();
        } catch {
        }
    };
  }

  // src/config.js
  var DEFAULT_SETTINGS = {
    // 自动扫描整页并转换
    autoConvert: !0,
    // 识别类型：邮箱与其它协议刻意不做
    types: {
      url: !0,
      domain: !0
    },
    // 宽松模式：任意 2-24 位字母后缀都当作域名（默认关）
    aggressiveDomain: !1,
    // 额外认可的顶级域名，例如 local / corp / lan
    extraTlds: [],
    // 生成链接的打开方式
    openMode: "blank",
    // 'blank' | 'self'
    // 手动触发方式
    manualTrigger: "dblclick",
    // 'off' | 'click' | 'dblclick' | 'middle'
    // 是否启用页面右键菜单
    contextMenu: !0,
    // 不生效的站点，每项一个域名，支持 *.example.com
    excludedSites: [],
    // 单次自动扫描的节点上限，防止超大页面卡顿
    maxScanNodes: 6e3
  }, OPEN_MODE_LABELS = {
    blank: "\u65B0\u6807\u7B7E\u9875",
    self: "\u5F53\u524D\u9875"
  }, TRIGGER_LABELS = {
    dblclick: "\u53CC\u51FB",
    middle: "\u9F20\u6807\u4E2D\u952E",
    click: "\u5355\u51FB",
    off: "\u5173\u95ED"
  }, TRIGGER_ORDER = ["dblclick", "middle", "click", "off"], OPEN_MODE_ORDER = ["blank", "self"];
  function normalizeSettings(raw) {
    let source = raw && typeof raw == "object" ? raw : {}, types = source.types && typeof source.types == "object" ? source.types : {}, extraTlds = Array.isArray(source.extraTlds) ? source.extraTlds.map((item) => String(item).trim().replace(/^\.+/, "").toLowerCase()).filter((item) => /^[a-z0-9-]{2,24}$/.test(item)) : [], excludedSites = Array.isArray(source.excludedSites) ? source.excludedSites.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [];
    return {
      autoConvert: source.autoConvert !== !1,
      types: {
        url: types.url !== !1,
        domain: types.domain !== !1
      },
      aggressiveDomain: source.aggressiveDomain === !0,
      extraTlds: Array.from(new Set(extraTlds)),
      openMode: OPEN_MODE_ORDER.includes(source.openMode) ? source.openMode : "blank",
      manualTrigger: TRIGGER_ORDER.includes(source.manualTrigger) ? source.manualTrigger : "dblclick",
      contextMenu: source.contextMenu !== !1,
      excludedSites,
      maxScanNodes: Number.isFinite(source.maxScanNodes) && source.maxScanNodes > 0 ? Math.min(Math.floor(source.maxScanNodes), 5e4) : DEFAULT_SETTINGS.maxScanNodes
    };
  }
  function isSiteExcluded(settings, hostname = location.hostname) {
    let host = String(hostname || "").toLowerCase();
    return host ? (settings.excludedSites || []).some((rule) => {
      let pattern = String(rule).trim().toLowerCase();
      if (!pattern) return !1;
      if (pattern.startsWith("*.")) {
        let base = pattern.slice(2);
        return host === base || host.endsWith("." + base);
      }
      return host === pattern || host.endsWith("." + pattern);
    }) : !1;
  }

  // src/settings.js
  var STORAGE_KEY = "t2l_settings", subscribers = /* @__PURE__ */ new Set(), activeDialog = null;
  function parseStored(value) {
    if (typeof value == "string") {
      let text = value.trim();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (error) {
        return console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u8BBE\u7F6E\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON", error), null;
      }
    }
    return value && typeof value == "object" ? value : null;
  }
  function readRaw() {
    if (typeof GM_getValue == "function")
      try {
        return parseStored(GM_getValue(STORAGE_KEY, null));
      } catch (error) {
        console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] GM_getValue \u8BFB\u53D6\u5931\u8D25\uFF0C\u5C1D\u8BD5 localStorage", error);
      }
    try {
      let text = localStorage.getItem(STORAGE_KEY);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      return console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25", error), null;
    }
  }
  function writeRaw(settings) {
    if (typeof GM_setValue == "function")
      try {
        return GM_setValue(STORAGE_KEY, settings), !0;
      } catch (error) {
        console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] GM_setValue \u5199\u5165\u5931\u8D25\uFF0C\u5C1D\u8BD5 localStorage", error);
      }
    try {
      return localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)), !0;
    } catch (error) {
      return console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25", error), !1;
    }
  }
  function notify(settings) {
    subscribers.forEach((fn) => {
      try {
        fn(settings);
      } catch (error) {
        console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u8BBE\u7F6E\u8BA2\u9605\u56DE\u8C03\u6267\u884C\u5931\u8D25", error);
      }
    });
  }
  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  function loadSettings() {
    return normalizeSettings(readRaw());
  }
  function saveSettings(patch) {
    let current = loadSettings(), source = patch && typeof patch == "object" ? patch : {}, merged = { ...current, ...source };
    merged.types = {
      ...current.types,
      ...source.types && typeof source.types == "object" ? source.types : {}
    };
    let next = normalizeSettings(merged);
    return writeRaw(next), notify(next), next;
  }
  function resetSettings() {
    let next = normalizeSettings(cloneDefaults());
    return writeRaw(next), notify(next), next;
  }
  function subscribeSettings(fn) {
    return typeof fn != "function" ? () => {
    } : (subscribers.add(fn), () => {
      subscribers.delete(fn);
    });
  }
  var DIALOG_CSS = `
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
`;
  function createEl(tag, className, text) {
    let node = document.createElement(tag);
    return className && (node.className = className), text != null && (node.textContent = text), node;
  }
  function createCheckboxRow(labelText, checked, hintText) {
    let row = createEl("label", "t2l-check"), input = document.createElement("input");
    input.type = "checkbox", input.checked = checked === !0;
    let textWrap = createEl("span", "t2l-check-text");
    return textWrap.appendChild(createEl("span", "t2l-check-label", labelText)), hintText && textWrap.appendChild(createEl("span", "t2l-hint", hintText)), row.appendChild(input), row.appendChild(textWrap), { row, input };
  }
  function createSelectRow(labelText, options, value) {
    let row = createEl("div", "t2l-field");
    row.appendChild(createEl("label", "t2l-label", labelText));
    let select = document.createElement("select");
    return select.className = "t2l-select", select.setAttribute("aria-label", labelText), options.forEach(([optionValue, optionLabel]) => {
      let option = document.createElement("option");
      option.value = optionValue, option.textContent = optionLabel, select.appendChild(option);
    }), select.value = value, row.appendChild(select), { row, select };
  }
  function createInputRow(labelText, value, placeholder) {
    let row = createEl("div", "t2l-field");
    row.appendChild(createEl("label", "t2l-label", labelText));
    let input = document.createElement("input");
    return input.type = "text", input.className = "t2l-input", input.value = value, input.setAttribute("aria-label", labelText), placeholder && (input.placeholder = placeholder), row.appendChild(input), { row, input };
  }
  function createTextareaRow(labelText, value, hintText, placeholder) {
    let row = createEl("div", "t2l-field");
    row.appendChild(createEl("label", "t2l-label", labelText));
    let textarea = document.createElement("textarea");
    return textarea.className = "t2l-textarea", textarea.rows = 4, textarea.value = value, textarea.setAttribute("aria-label", labelText), placeholder && (textarea.placeholder = placeholder), row.appendChild(textarea), hintText && row.appendChild(createEl("span", "t2l-hint", hintText)), { row, textarea };
  }
  function parseList(value) {
    return String(value || "").split(/[\s,，、;；]+/).map((item) => item.trim()).filter(Boolean);
  }
  function parseLines(value) {
    return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  function clamp(value, min, max) {
    return min > max ? min : Math.min(Math.max(value, min), max);
  }
  function openSettingsDialog({ settings, onChange } = {}) {
    if (typeof document > "u") return;
    activeDialog && activeDialog.close();
    let current = normalizeSettings(settings || loadSettings()), host = document.createElement("div");
    host.setAttribute("data-t2l-ui", "");
    let shadow = host.attachShadow({ mode: "open" }), style = document.createElement("style");
    style.textContent = DIALOG_CSS, shadow.appendChild(style);
    let mask = createEl("div", "t2l-mask");
    shadow.appendChild(mask);
    let panel = createEl("div", "t2l-panel");
    panel.setAttribute("role", "dialog"), panel.setAttribute("aria-modal", "true"), panel.setAttribute("aria-label", "\u6587\u672C\u8F6C\u94FE\u63A5\u8BBE\u7F6E"), mask.appendChild(panel);
    let header = createEl("div", "t2l-header", "\u6587\u672C\u8F6C\u94FE\u63A5\u8BBE\u7F6E");
    panel.appendChild(header);
    let body = createEl("div", "t2l-body");
    panel.appendChild(body);
    let autoConvertField = createCheckboxRow("\u81EA\u52A8\u8F6C\u6362", current.autoConvert);
    body.appendChild(autoConvertField.row);
    let urlField = createCheckboxRow("\u8BC6\u522B http/https \u94FE\u63A5", current.types.url);
    body.appendChild(urlField.row);
    let domainField = createCheckboxRow(
      "\u8BC6\u522B\u88F8\u57DF\u540D",
      current.types.domain,
      "\u5982 baidu.com\uFF0C\u81EA\u52A8\u8865 https://"
    );
    body.appendChild(domainField.row);
    let aggressiveField = createCheckboxRow(
      "\u5BBD\u677E\u8BC6\u522B\u4EFB\u610F\u540E\u7F00",
      current.aggressiveDomain,
      "\u53EF\u80FD\u8BEF\u4F24\u666E\u901A\u5355\u8BCD\uFF0C\u9ED8\u8BA4\u5173\u95ED"
    );
    body.appendChild(aggressiveField.row);
    let extraTldsField = createInputRow(
      "\u989D\u5916\u8BA4\u53EF\u7684\u57DF\u540D\u540E\u7F00",
      current.extraTlds.join(", "),
      "local, corp"
    );
    body.appendChild(extraTldsField.row);
    let openModeField = createSelectRow(
      "\u6253\u5F00\u65B9\u5F0F",
      OPEN_MODE_ORDER.map((mode) => [mode, OPEN_MODE_LABELS[mode]]),
      current.openMode
    );
    body.appendChild(openModeField.row);
    let triggerField = createSelectRow(
      "\u624B\u52A8\u89E6\u53D1\u65B9\u5F0F",
      TRIGGER_ORDER.map((trigger) => [trigger, TRIGGER_LABELS[trigger]]),
      current.manualTrigger
    );
    body.appendChild(triggerField.row);
    let contextMenuField = createCheckboxRow("\u9875\u9762\u53F3\u952E\u83DC\u5355", current.contextMenu);
    body.appendChild(contextMenuField.row);
    let excludedField = createTextareaRow(
      "\u672C\u7AD9\u9ED1\u540D\u5355",
      current.excludedSites.join(`
`),
      "\u6BCF\u884C\u4E00\u4E2A\u57DF\u540D\uFF0C\u652F\u6301 *.example.com",
      `example.com
*.example.com`
    );
    body.appendChild(excludedField.row);
    let footer = createEl("div", "t2l-footer");
    panel.appendChild(footer);
    let saveButton = createEl("button", "t2l-btn t2l-btn--primary", "\u4FDD\u5B58");
    saveButton.type = "button";
    let resetButton = createEl("button", "t2l-btn", "\u6062\u590D\u9ED8\u8BA4");
    resetButton.type = "button";
    let cancelButton = createEl("button", "t2l-btn", "\u53D6\u6D88");
    cancelButton.type = "button", footer.appendChild(saveButton), footer.appendChild(resetButton), footer.appendChild(cancelButton);
    function fillForm(value) {
      current = value, autoConvertField.input.checked = value.autoConvert, urlField.input.checked = value.types.url, domainField.input.checked = value.types.domain, aggressiveField.input.checked = value.aggressiveDomain, extraTldsField.input.value = value.extraTlds.join(", "), openModeField.select.value = value.openMode, triggerField.select.value = value.manualTrigger, contextMenuField.input.checked = value.contextMenu, excludedField.textarea.value = value.excludedSites.join(`
`);
    }
    function readForm() {
      return {
        ...current,
        autoConvert: autoConvertField.input.checked,
        types: {
          url: urlField.input.checked,
          domain: domainField.input.checked
        },
        aggressiveDomain: aggressiveField.input.checked,
        extraTlds: parseList(extraTldsField.input.value),
        openMode: openModeField.select.value,
        manualTrigger: triggerField.select.value,
        contextMenu: contextMenuField.input.checked,
        excludedSites: parseLines(excludedField.textarea.value)
      };
    }
    let offsetX = 0, offsetY = 0, drag = null;
    function onPointerDown(event) {
      if (event.button !== 0) return;
      let rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX,
        offsetY,
        rect
      };
      try {
        header.setPointerCapture(event.pointerId);
      } catch {
      }
      event.preventDefault();
    }
    function onPointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      let dx = clamp(
        event.clientX - drag.startX,
        -drag.rect.left,
        window.innerWidth - drag.rect.right
      ), dy = clamp(
        event.clientY - drag.startY,
        -drag.rect.top,
        window.innerHeight - drag.rect.bottom
      );
      offsetX = drag.offsetX + dx, offsetY = drag.offsetY + dy, panel.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }
    function onPointerUp(event) {
      if (!(!drag || event.pointerId !== drag.pointerId)) {
        drag = null;
        try {
          header.hasPointerCapture(event.pointerId) && header.releasePointerCapture(event.pointerId);
        } catch {
        }
      }
    }
    header.addEventListener("pointerdown", onPointerDown), header.addEventListener("pointermove", onPointerMove), header.addEventListener("pointerup", onPointerUp), header.addEventListener("pointercancel", onPointerUp);
    function onKeyDown(event) {
      event.key === "Escape" && (event.stopPropagation(), close());
    }
    document.addEventListener("keydown", onKeyDown, !0), mask.addEventListener("pointerdown", (event) => {
      event.target === mask && close();
    });
    function handleSave() {
      let next = saveSettings(readForm());
      if (typeof onChange == "function")
        try {
          onChange(next);
        } catch (error) {
          console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] onChange \u56DE\u8C03\u6267\u884C\u5931\u8D25", error);
        }
      close();
    }
    function handleReset() {
      let next = resetSettings();
      fillForm(next);
    }
    saveButton.addEventListener("click", handleSave), resetButton.addEventListener("click", handleReset), cancelButton.addEventListener("click", close);
    function close() {
      activeDialog === dialog && (activeDialog = null), document.removeEventListener("keydown", onKeyDown, !0), host.parentNode && host.parentNode.removeChild(host);
    }
    let dialog = { close };
    activeDialog = dialog;
    let parent = document.body || document.documentElement;
    parent && parent.appendChild(host);
  }

  // src/menu.js
  function registerMenus({ getSettings, updateSettings, rescan, openSettings } = {}) {
    if (typeof GM_registerMenuCommand != "function")
      return console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 GM_registerMenuCommand\uFF0C\u5DF2\u8DF3\u8FC7\u83DC\u5355\u6CE8\u518C"), () => {
      };
    let menuIds = [], canRefresh = typeof GM_unregisterMenuCommand == "function";
    function currentSettings() {
      try {
        let stored = loadSettings();
        if (stored && typeof stored == "object") return stored;
      } catch (error) {
        console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25", error);
      }
      try {
        let value = typeof getSettings == "function" ? getSettings() : null;
        return value && typeof value == "object" ? value : DEFAULT_SETTINGS;
      } catch (error) {
        return console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25", error), DEFAULT_SETTINGS;
      }
    }
    function addMenu(text, onClick) {
      let id = GM_registerMenuCommand(text, onClick);
      if (id == null) {
        canRefresh = !1;
        return;
      }
      menuIds.push(id);
    }
    function clearMenus() {
      if (typeof GM_unregisterMenuCommand != "function") {
        menuIds.length = 0;
        return;
      }
      for (; menuIds.length; ) {
        let id = menuIds.pop();
        if (id != null)
          try {
            GM_unregisterMenuCommand(id);
          } catch (error) {
            console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u6CE8\u9500\u83DC\u5355\u5931\u8D25", error);
          }
      }
    }
    function applyPatch(patch) {
      if (typeof updateSettings != "function") {
        refresh();
        return;
      }
      try {
        let result = updateSettings(patch);
        if (result && typeof result.then == "function") {
          result.then(refresh, refresh);
          return;
        }
      } catch (error) {
        console.warn("[\u6587\u672C\u8F6C\u94FE\u63A5] \u66F4\u65B0\u8BBE\u7F6E\u5931\u8D25", error);
      }
      refresh();
    }
    function register() {
      let settings = currentSettings(), autoLabel = settings.autoConvert !== !1 ? "\u5F00" : "\u5173", triggerLabel = TRIGGER_LABELS[settings.manualTrigger] || TRIGGER_LABELS.dblclick, openModeLabel = OPEN_MODE_LABELS[settings.openMode] || OPEN_MODE_LABELS.blank;
      addMenu("\u2699 \u8BBE\u7F6E\u2026", () => {
        typeof openSettings == "function" && openSettings();
      }), addMenu(`\u81EA\u52A8\u8F6C\u6362\uFF1A${autoLabel}`, () => {
        let latest = currentSettings();
        applyPatch({ autoConvert: latest.autoConvert !== !0 });
      }), addMenu(`\u624B\u52A8\u89E6\u53D1\uFF1A${triggerLabel}`, () => {
        let latest = currentSettings(), index = TRIGGER_ORDER.indexOf(latest.manualTrigger), next = TRIGGER_ORDER[(index + 1) % TRIGGER_ORDER.length] || "dblclick";
        applyPatch({ manualTrigger: next });
      }), addMenu(`\u6253\u5F00\u65B9\u5F0F\uFF1A${openModeLabel}`, () => {
        let latest = currentSettings();
        applyPatch({ openMode: latest.openMode === "blank" ? "self" : "blank" });
      }), addMenu("\u7ACB\u5373\u626B\u63CF\u5F53\u524D\u9875", () => {
        typeof rescan == "function" && rescan();
      }), addMenu("\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E", () => {
        window.confirm("\u786E\u5B9A\u8981\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E\u5417\uFF1F\u5F53\u524D\u914D\u7F6E\u5C06\u88AB\u8986\u76D6\u3002") && applyPatch(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      });
    }
    function refresh() {
      canRefresh && (clearMenus(), register());
    }
    register();
    let unsubscribeSettings = subscribeSettings(() => refresh());
    return function() {
      unsubscribeSettings(), clearMenus();
    };
  }

  // src/index.js
  function onUrlChange(callback) {
    let last = location.href, fire = () => {
      location.href !== last && (last = location.href, callback());
    };
    for (let method of ["pushState", "replaceState"]) {
      let original = history[method];
      typeof original == "function" && (history[method] = function(...args) {
        let result = original.apply(this, args);
        return fire(), result;
      });
    }
    window.addEventListener("popstate", fire);
  }
  function init() {
    ensureStyle();
    let settings = loadSettings(), auto = null, manual = null, routeTimer = 0, getSettings = () => settings, autoAllowed = () => settings.autoConvert && !isSiteExcluded(settings), manualAllowed = () => !isSiteExcluded(settings);
    function syncAuto() {
      autoAllowed() ? auto || (auto = startAutoConvert({ getSettings, detect })) : auto && (auto.stop(), auto = null);
    }
    function syncManual() {
      manualAllowed() ? manual || (manual = installManualTriggers({ getSettings, detect })) : manual && (manual(), manual = null);
    }
    function syncAll() {
      syncAuto(), syncManual();
    }
    function rescan() {
      return auto ? auto.rescan() : document.body ? convertElement(document.body, {
        detect,
        openMode: settings.openMode
      }) : 0;
    }
    function updateSettings(patch) {
      return saveSettings(patch);
    }
    let unregisterMenus = registerMenus({
      getSettings,
      updateSettings,
      rescan: () => {
        let count = rescan();
        return count > 0 ? showToast(`\u5DF2\u8F6C\u6362 ${count} \u5904\u6587\u672C`) : showToast("\u6CA1\u6709\u627E\u5230\u53EF\u8F6C\u6362\u7684\u6587\u672C"), count;
      },
      openSettings: () => {
        openSettingsDialog({
          settings,
          onChange: (next) => {
            settings = next, syncAll();
          }
        });
      }
    });
    subscribeSettings((next) => {
      settings = next, syncAll();
    }), onUrlChange(() => {
      syncAll(), autoAllowed() && (clearTimeout(routeTimer), routeTimer = window.setTimeout(() => {
        auto && auto.rescan();
      }, 500));
    }), syncAll();
  }
  document.body ? init() : window.addEventListener("DOMContentLoaded", init, { once: !0 });
})();
