import * as esbuild from 'esbuild'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const watch = process.argv.includes('--watch')

// 直接截取模板字符串内容，避免用户脚本元数据里出现反引号或 ${ 时被正则截断
const metaSource = readFileSync(resolve(root, 'src', 'usermeta.js'), 'utf-8')
const firstTick = metaSource.indexOf('`')
const lastTick = metaSource.lastIndexOf('`')
const baseMeta =
  firstTick === -1 || lastTick <= firstTick
    ? ''
    : metaSource.slice(firstTick + 1, lastTick).trim()

// CI 构建时在版本号后追加构建号，保证每次产物版本都递增，用户无需手动改版本；
// 本地构建不设置 BUILD_NUMBER，保持源码里的版本号原样
const buildNumber = (process.env.BUILD_NUMBER || '').replace(/[^\w.-]/g, '')
const meta = buildNumber
  ? baseMeta.replace(/^(\/\/ @version\s+)(\S+)$/m, (_, prefix, version) => `${prefix}${version}.${buildNumber}`)
  : baseMeta

console.log(`[build] version -> ${(meta.match(/^\/\/ @version\s+(\S+)$/m) || [])[1] || 'unknown'}`)

const config = {
  entryPoints: [resolve(root, 'src', 'index.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  outfile: resolve(root, 'dist', 'script.user.js'),
  loader: { '.css': 'text' },
  banner: { js: meta + '\n' },
  minifySyntax: true,
  legalComments: 'inline',
}

if (watch) {
  const ctx = await esbuild.context(config)
  await ctx.watch()
  console.log('[dev] watching for changes...')
} else {
  await esbuild.build(config)
  console.log('[build] done -> dist/script.user.js')
}
