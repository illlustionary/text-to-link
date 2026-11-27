import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { detect } from '../src/detector.js'
import { startAutoConvert } from '../src/auto.js'

/** 用 jsdom 搭一个页面，并把 auto / converter 需要的全局补齐 */
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

  window.requestIdleCallback = globalThis.requestIdleCallback
  window.cancelIdleCallback = globalThis.cancelIdleCallback

  return dom
}

const baseSettings = {
  autoConvert: true,
  types: { url: true, domain: true },
  aggressiveDomain: false,
  extraTlds: [],
  openMode: 'blank',
  maxScanNodes: 1000,
}

/** 启动自动转换，返回停止函数与可替换的设置 */
function start(settings) {
  let current = { ...baseSettings, ...settings }
  const controller = startAutoConvert({
    getSettings: () => current,
    detect,
  })
  return {
    controller,
    setSettings(next) {
      current = { ...current, ...next }
    },
  }
}

test('自动扫描整页并转换 URL 与裸域名', () => {
  const dom = setup('<p>访问 https://example.com 和 baidu.com</p>')
  const { document } = dom.window
  const { controller } = start()

  const links = Array.from(document.querySelectorAll('a.t2l-link'))
  assert.equal(links.length, 2)
  assert.equal(links[0].getAttribute('href'), 'https://example.com')
  assert.equal(links[1].getAttribute('href'), 'https://baidu.com')
  assert.equal(document.querySelector('p').textContent, '访问 https://example.com 和 baidu.com')

  controller.stop()
})

test('自动扫描遵守 types 开关', () => {
  const dom = setup('<p>https://example.com 和 baidu.com</p>')
  const { document } = dom.window
  const { controller } = start({ types: { url: true, domain: false } })

  const links = Array.from(document.querySelectorAll('a.t2l-link'))
  assert.equal(links.length, 1)
  assert.equal(links[0].getAttribute('href'), 'https://example.com')

  controller.stop()
})

test('自动扫描遵守打开方式', () => {
  const dom = setup('<p>example.com</p>')
  const { document } = dom.window
  const { controller } = start({ openMode: 'self' })

  const link = document.querySelector('a.t2l-link')
  assert.equal(link.target, '_self')
  assert.equal(link.getAttribute('rel'), null)

  controller.stop()
})

test('自动扫描跳过代码块与已有链接', () => {
  const dom = setup(
    [
      '<code>https://code.com</code>',
      '<a href="https://old.com">https://old.com</a>',
      '<p>https://new.com</p>',
    ].join(''),
  )
  const { document } = dom.window
  const { controller } = start()

  assert.equal(document.querySelectorAll('a.t2l-link').length, 1)
  assert.equal(document.querySelector('a.t2l-link').getAttribute('href'), 'https://new.com')
  assert.equal(document.querySelector('code a'), null)
  assert.equal(document.querySelector('a[href="https://old.com"]').className, '')

  controller.stop()
})

test('MutationObserver 会处理后插入的内容', async () => {
  const dom = setup('<p>static</p>')
  const { document } = dom.window
  const { controller } = start()

  const p = document.createElement('p')
  p.textContent = 'dynamic.com'
  document.body.appendChild(p)

  await new Promise((resolve) => setTimeout(resolve, 800))

  const link = p.querySelector('a.t2l-link')
  assert.ok(link, '后插入的文本应被自动转换')
  assert.equal(link.getAttribute('href'), 'https://dynamic.com')

  controller.stop()
})

test('stop 后不再处理新内容', async () => {
  const dom = setup('<p>static</p>')
  const { document } = dom.window
  const { controller } = start()

  controller.stop()

  const p = document.createElement('p')
  p.textContent = 'after-stop.com'
  document.body.appendChild(p)

  await new Promise((resolve) => setTimeout(resolve, 500))

  assert.equal(p.querySelector('a'), null)
})
