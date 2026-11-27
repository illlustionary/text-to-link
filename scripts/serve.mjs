// 仅用于本地浏览器测试的极简静态服务器：node scripts/serve.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join, normalize } from 'path'
import { fileURLToPath } from 'url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const pathname = decodeURIComponent(url.pathname)
    const target = normalize(join(root, pathname === '/' ? '/tests/fixture.html' : pathname))
    if (!target.startsWith(normalize(root))) {
      response.writeHead(403)
      response.end('forbidden')
      return
    }
    const body = await readFile(target)
    response.writeHead(200, {
      'content-type': MIME[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('not found')
  }
}).listen(port, () => {
  console.log(`[serve] http://localhost:${port}/tests/fixture.html`)
})
