import test from 'node:test'
import assert from 'node:assert/strict'
import { detect } from '../src/detector.js'

/** 取所有匹配的 href，便于断言 */
function hrefs(text, options) {
  return detect(text, options).map((item) => item.href)
}

test('识别带协议的 URL', () => {
  const result = detect('访问 https://example.com 看看')
  assert.equal(result.length, 1)
  assert.equal(result[0].type, 'url')
  assert.equal(result[0].href, 'https://example.com')
  assert.equal(result[0].text, 'https://example.com')
})

test('中文句号不进入链接', () => {
  assert.deepEqual(hrefs('访问 https://example.com。'), ['https://example.com'])
  assert.deepEqual(hrefs('（https://example.com）'), ['https://example.com'])
})

test('英文尾部标点被剥离', () => {
  assert.deepEqual(hrefs('see https://example.com, ok'), ['https://example.com'])
  assert.deepEqual(hrefs('see https://example.com.'), ['https://example.com'])
  assert.deepEqual(hrefs('see https://example.com?'), ['https://example.com'])
})

test('URL 中的成对括号保留', () => {
  assert.deepEqual(hrefs('https://en.wikipedia.org/wiki/Foo_(bar)'), [
    'https://en.wikipedia.org/wiki/Foo_(bar)',
  ])
})

test('URL 末尾多余的右括号被剥离', () => {
  assert.deepEqual(hrefs('https://example.com/foo)'), ['https://example.com/foo'])
})

test('识别裸域名并补 https://', () => {
  const result = detect('baidu.com')
  assert.equal(result.length, 1)
  assert.equal(result[0].type, 'domain')
  assert.equal(result[0].href, 'https://baidu.com')
})

test('识别 www 开头与带路径的裸域名', () => {
  assert.deepEqual(hrefs('www.baidu.com'), ['https://www.baidu.com'])
  assert.deepEqual(hrefs('baidu.com/a?b=1#top'), ['https://baidu.com/a?b=1#top'])
})

test('裸域名支持端口', () => {
  assert.deepEqual(hrefs('example.com:8080'), ['https://example.com:8080'])
})

test('IPv4 补 http:// 并保留端口', () => {
  assert.deepEqual(hrefs('192.168.1.1:8080'), ['http://192.168.1.1:8080'])
  assert.deepEqual(hrefs('10.0.0.1'), ['http://10.0.0.1'])
})

test('非法 IPv4 不识别', () => {
  assert.equal(detect('999.1.1.1').length, 0)
  assert.equal(detect('192.168.1.1.5').length, 0)
})

test('localhost 与无点主机不识别', () => {
  assert.equal(detect('localhost').length, 0)
  assert.equal(detect('localhost:3000').length, 0)
})

test('版本号与小数不识别', () => {
  assert.equal(detect('1.2.3').length, 0)
  assert.equal(detect('3.14').length, 0)
  assert.equal(detect('v1.2.3').length, 0)
})

test('代码文件名不识别', () => {
  assert.equal(detect('index.js').length, 0)
  assert.equal(detect('file.png').length, 0)
  assert.equal(detect('archive.zip').length, 0)
  assert.equal(detect('example.app').length, 0)
})

test('歧义后缀带路径时按域名识别', () => {
  assert.deepEqual(hrefs('archive.zip/file'), ['https://archive.zip/file'])
  assert.deepEqual(hrefs('example.app/path'), ['https://example.app/path'])
})

test('邮箱内部不拆分', () => {
  assert.equal(detect('user@example.com').length, 0)
  assert.equal(detect('user.name@example.com').length, 0)
})

test('安全模式下 foo.bar 不识别', () => {
  assert.equal(detect('foo.bar').length, 0)
})

test('宽松模式下任意后缀被识别', () => {
  assert.deepEqual(hrefs('foo.bar', { aggressiveDomain: true }), ['https://foo.bar'])
})

test('额外后缀生效', () => {
  assert.deepEqual(hrefs('nas.local', { extraTlds: ['local'] }), ['https://nas.local'])
  assert.deepEqual(hrefs('nas.LOCAL', { extraTlds: ['.LOCAL'] }), ['https://nas.LOCAL'])
})

test('中文紧邻域名也能识别', () => {
  assert.deepEqual(hrefs('访问baidu.com看看'), ['https://baidu.com'])
})

test('大小写域名识别', () => {
  assert.deepEqual(hrefs('BAIDU.COM'), ['https://BAIDU.COM'])
})

test('多个链接按位置排序', () => {
  const result = detect('a.com 和 https://b.org/x')
  assert.equal(result.length, 2)
  assert.equal(result[0].href, 'https://a.com')
  assert.equal(result[1].href, 'https://b.org/x')
  assert.ok(result[0].start < result[1].start)
})

test('URL 内部的域名不重复产出', () => {
  const result = detect('https://example.com/path')
  assert.equal(result.length, 1)
  assert.equal(result[0].type, 'url')
})

test('关闭 URL 识别后只产出域名', () => {
  const result = detect('https://example.com', { url: false })
  assert.equal(result.length, 1)
  assert.equal(result[0].type, 'domain')
  assert.equal(result[0].text, 'example.com')
})

test('关闭域名识别后只产出 URL', () => {
  const result = detect('https://example.com 和 baidu.com', { domain: false })
  assert.equal(result.length, 1)
  assert.equal(result[0].type, 'url')
})

test('types 形式与顶层开关等价', () => {
  assert.equal(detect('https://example.com', { types: { url: false } }).length, 1)
  assert.equal(detect('https://example.com', { types: { url: true } }).length, 1)
  assert.equal(detect('baidu.com', { types: { domain: false } }).length, 0)
})

test('空字符串与超长文本直接返回空', () => {
  assert.deepEqual(detect(''), [])
  assert.deepEqual(detect('a'.repeat(100001)), [])
})

test('常见新顶级域名可识别', () => {
  assert.deepEqual(hrefs('example.dev'), ['https://example.dev'])
  assert.deepEqual(hrefs('example.io'), ['https://example.io'])
  assert.deepEqual(hrefs('example.xyz'), ['https://example.xyz'])
})

test('末尾多余右括号与句号组合处理', () => {
  assert.deepEqual(hrefs('example.com/path).'), ['https://example.com/path'])
  assert.deepEqual(hrefs('example.com/wiki/Foo_(bar)).'), [
    'https://example.com/wiki/Foo_(bar)',
  ])
})

test('相邻域名被逗号分隔时分别识别', () => {
  assert.deepEqual(hrefs('a.com,b.com'), ['https://a.com', 'https://b.com'])
})

test('不会从连字符文件名中间截取域名', () => {
  const result = detect('my-example.com')
  assert.equal(result.length, 1)
  assert.equal(result[0].href, 'https://my-example.com')
  assert.equal(detect('abc-example.com-foo').length, 0)
})
