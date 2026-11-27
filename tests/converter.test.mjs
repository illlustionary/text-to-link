import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  CONVERTED_CLASS,
  convertAtPoint,
  convertElement,
  convertSelection,
  convertTextNode,
  getSelectedTextInfo,
  getTextNodeAtPoint,
  isSkippedElement,
} from '../src/converter.js'

/**
 * 用 jsdom 建一个页面，并把常用全局挂到 globalThis，
 * 让 converter 里的 typeof document / window 判断可用。
 */
function setup(html = '') {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://page.test/',
    pretendToBeVisual: true,
  })
  const { window } = dom

  globalThis.window = window
  globalThis.document = window.document
  globalThis.Node = window.Node
  globalThis.NodeFilter = window.NodeFilter
  globalThis.TreeWalker = window.TreeWalker
  globalThis.DocumentFragment = window.DocumentFragment
  globalThis.MutationObserver = window.MutationObserver
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.requestIdleCallback = (callback) =>
    setTimeout(() => callback({ timeRemaining: () => 0, didTimeout: true }), 0)
  globalThis.cancelIdleCallback = (id) => clearTimeout(id)

  return dom
}

/** 测试用的简化 detect，接口与 detector.detect 一致 */
function detect(text) {
  const matches = []
  const pattern =
    /https?:\/\/[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>"']*)?/gi
  let match
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0]
    const isUrl = /^https?:\/\//i.test(raw)
    matches.push({
      start: match.index,
      end: match.index + raw.length,
      text: raw,
      href: isUrl ? raw : `https://${raw}`,
      type: isUrl ? 'url' : 'domain',
    })
  }
  return matches
}

test('普通文本中的 URL 被替换为 a，前后文本保留', () => {
  const dom = setup('<p id="p">访问 https://example.com 看看</p>')
  const { document } = dom.window
  const p = document.getElementById('p')
  const textNode = p.firstChild

  const count = convertTextNode(textNode, { detect, openMode: 'blank' })

  assert.equal(count, 1)
  const link = p.querySelector('a')
  assert.ok(link)
  assert.equal(link.textContent, 'https://example.com')
  assert.equal(link.getAttribute('href'), 'https://example.com')
  assert.equal(link.className, CONVERTED_CLASS)
  assert.equal(p.textContent, '访问 https://example.com 看看')
  assert.equal(p.firstChild.nodeType, 3)
  assert.equal(p.firstChild.nodeValue, '访问 ')
  assert.equal(p.lastChild.nodeType, 3)
  assert.equal(p.lastChild.nodeValue, ' 看看')
})

test('已有 a 内部不重复转换', () => {
  const dom = setup('<p><a href="https://example.com">https://example.com</a></p>')
  const { document } = dom.window

  const count = convertElement(document.body, { detect })

  assert.equal(count, 0)
  assert.equal(document.querySelectorAll('a').length, 1)
})

test('code / pre / textarea / contenteditable 内不转换', () => {
  const dom = setup(
    [
      '<code>example.com</code>',
      '<pre>example.com</pre>',
      '<textarea>example.com</textarea>',
      '<div contenteditable="true">example.com</div>',
      '<div contenteditable="">example.com</div>',
    ].join(''),
  )
  const { document } = dom.window

  const count = convertElement(document.body, { detect })

  assert.equal(count, 0)
  assert.equal(document.querySelectorAll('a').length, 0)
})

test('裸域名补全 https://', () => {
  const dom = setup('<p>example.com</p>')
  const { document } = dom.window
  const p = document.querySelector('p')

  const count = convertTextNode(p.firstChild, { detect })

  assert.equal(count, 1)
  const link = p.querySelector('a')
  assert.equal(link.getAttribute('href'), 'https://example.com')
  assert.equal(link.dataset.t2lType, 'domain')
  assert.equal(link.dataset.t2lHref, 'https://example.com')
})

test("openMode='self' 时 target=_self，blank 时 _blank + rel", () => {
  const dom = setup('<p id="a">a.com</p><p id="b">b.com</p>')
  const { document } = dom.window

  convertTextNode(document.getElementById('a').firstChild, { detect, openMode: 'self' })
  convertTextNode(document.getElementById('b').firstChild, { detect, openMode: 'blank' })

  const selfLink = document.querySelector('#a a')
  const blankLink = document.querySelector('#b a')

  assert.equal(selfLink.target, '_self')
  assert.equal(selfLink.getAttribute('rel'), null)

  assert.equal(blankLink.target, '_blank')
  assert.equal(blankLink.getAttribute('rel'), 'noopener noreferrer')
})

test('同一文本节点重复调用只转换一次', () => {
  const dom = setup('<p>example.com</p>')
  const { document } = dom.window
  const p = document.querySelector('p')
  const node = p.firstChild

  const first = convertTextNode(node, { detect })
  const second = convertTextNode(node, { detect })
  const third = convertTextNode(p.firstChild, { detect })

  assert.equal(first, 1)
  assert.equal(second, 0)
  assert.equal(third, 0)
  assert.equal(p.querySelectorAll('a').length, 1)
})

test('convertElement 批量转换多个节点', () => {
  const dom = setup(
    '<div><p>one.com</p><p>no link here</p><p>https://two.org/path</p><span>three.net</span></div>',
  )
  const { document } = dom.window

  const count = convertElement(document.body, { detect })

  assert.equal(count, 3)
  assert.equal(document.querySelectorAll('a').length, 3)
  const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))
  assert.deepEqual(hrefs, ['https://one.com', 'https://two.org/path', 'https://three.net'])
})

test('convertSelection 只转换选中的部分', () => {
  const dom = setup('<p>看 example.com 和 b.org</p>')
  const { document, window } = dom.window
  const p = document.querySelector('p')
  const node = p.firstChild

  const start = node.nodeValue.indexOf('example.com')
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, start + 'example.com'.length)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)

  const info = getSelectedTextInfo()
  assert.ok(info)
  assert.equal(info.text, 'example.com')

  const count = convertSelection({ detect })

  assert.equal(count, 1)
  assert.equal(p.querySelectorAll('a').length, 1)
  assert.equal(p.querySelector('a').textContent, 'example.com')
  assert.equal(p.textContent, '看 example.com 和 b.org')
  // 未选中的 b.org 仍是普通文本
  assert.equal(p.textContent.includes('b.org'), true)
  assert.equal(p.querySelectorAll('a').length, 1)
})

test('getTextNodeAtPoint 使用 caretRangeFromPoint（mock）', () => {
  const dom = setup('<p id="p">hello world</p>')
  const { document } = dom.window
  const node = document.getElementById('p').firstChild

  document.caretRangeFromPoint = (x, y) => {
    const range = document.createRange()
    range.setStart(node, 2)
    range.setEnd(node, 2)
    return range
  }

  const hit = getTextNodeAtPoint(10, 10)
  assert.ok(hit)
  assert.equal(hit.node, node)
  assert.equal(hit.offset, 2)
})

test('getTextNodeAtPoint 落在已转换链接内返回 null', () => {
  const dom = setup('<p>example.com</p>')
  const { document } = dom.window
  const p = document.querySelector('p')

  convertTextNode(p.firstChild, { detect })
  const linkNode = p.querySelector('a').firstChild

  document.caretRangeFromPoint = () => {
    const range = document.createRange()
    range.setStart(linkNode, 1)
    range.setEnd(linkNode, 1)
    return range
  }

  assert.equal(getTextNodeAtPoint(10, 10), null)
  assert.equal(convertAtPoint(10, 10, { detect }), 0)
})

test('隐藏元素不转换', () => {
  const dom = setup(
    '<p style="display:none">hidden.com</p><p style="visibility:hidden">invisible.com</p><p>shown.com</p>',
  )
  const { document } = dom.window

  const hidden = document.querySelectorAll('p')[0]
  const invisible = document.querySelectorAll('p')[1]
  const shown = document.querySelectorAll('p')[2]

  assert.equal(isSkippedElement(hidden), true)
  assert.equal(isSkippedElement(invisible), true)
  assert.equal(convertElement(document.body, { detect }), 1)
  assert.equal(hidden.querySelectorAll('a').length, 0)
  assert.equal(invisible.querySelectorAll('a').length, 0)
  assert.equal(shown.querySelectorAll('a').length, 1)
})

test('脚本 Shadow DOM 内的文本被跳过', () => {
  const dom = setup('<div id="ui" data-t2l-ui></div>')
  const { document } = dom.window
  const host = document.getElementById('ui')
  const shadow = host.attachShadow({ mode: 'open' })
  const p = document.createElement('p')
  p.textContent = 'ui.com'
  shadow.appendChild(p)

  assert.equal(isSkippedElement(p), true)
  assert.equal(convertElement(p, { detect }), 0)
  assert.equal(p.querySelectorAll('a').length, 0)
})
