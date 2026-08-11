// 挖空功能自动化测试（jsdom + quill）
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>', {
  url: 'http://localhost'
})
// 注入 jsdom 全部全局对象
for (const k of Object.getOwnPropertyNames(dom.window)) {
  if (k === 'constructor' || k === 'toString') continue
  try { global[k] = dom.window[k] } catch (e) {}
}
global.getSelection = dom.window.getSelection.bind(dom.window)
global.document.addEventListener = dom.window.document.addEventListener.bind(dom.window.document)

// Quill 2.x 是 ESM，用动态 import
let Quill
async function getQuill() {
  if (!Quill) {
    const m = await import('quill')
    Quill = m.default
  }
  return Quill
}

let passed = 0, failed = 0
function assert(cond, desc) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + desc) }
  else { failed++; console.error('  \x1b[31m✗\x1b[0m ' + desc) }
}

// ====================== 1. 编解码测试 ======================
console.log('1. clozeEncode / clozeDecode')
const cloze = require('./src/utils/cloze.js')

const raw = '<p><code>hello</code> world <code>foo</code></p>'
const encoded = cloze.encodeClozeInHtml(raw)
assert(encoded.includes('<span class="smm-cloze">hello</span>'), 'encode code→span')
assert(encoded.includes('<span class="smm-cloze">foo</span>'), 'encode 多段')
assert(!encoded.includes('<code>'), 'encode 后无残留code')

const decoded = cloze.decodeClozeFromHtml(
  '<p><span class="smm-cloze">hello</span> world <span class="smm-cloze">foo</span></p>'
)
assert(decoded.includes('<code>hello</code>'), 'decode span→code')
const rt = cloze.decodeClozeFromHtml(cloze.encodeClozeInHtml(raw))
assert(rt === raw, 'round-trip 一致')
console.log(`  编解码: ${passed} passed`)

// ====================== 2. 真实 quill 编辑器交互测试 ======================
async function testQuill() {
  console.log('2. toggleSelectionCloze 真实 quill 交互')
  const Q = await getQuill()

  const quill = new Q('#editor', {
    theme: 'bubble',
    modules: { toolbar: false }
  })
  quill.setText('这是一段测试文字用来挖空')

  cloze.initCloze({ richText: { showTextEdit: true, quill } })

  quill.setSelection(3, 4)
  assert(quill.root.textContent.includes('测试文字'), 'quill 中有初始文字')

  cloze.toggleSelectionCloze()

  const codeEls = quill.root.querySelectorAll('code')
  assert(codeEls.length === 1, 'quill DOM 中有 1 个 <code> 元素')
  if (codeEls.length > 0) assert(codeEls[0].textContent === '测试文字', '<code> 内容正确')

  // 二次按取消
  quill.setSelection(3, 1)
  cloze.toggleSelectionCloze()
  assert(quill.root.querySelectorAll('code').length === 0, '二次切换后 <code> 被清除')

  // 再次挖空
  quill.setSelection(3, 4)
  cloze.toggleSelectionCloze()
  const savedHtml = quill.root.innerHTML
  const final = cloze.encodeClozeInHtml(savedHtml)
  assert(final.includes('<span class="smm-cloze">'), '保存编码: code→smm-cloze')
  assert(!final.includes('<code>'), '保存后无残留 code')

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`)
  process.exit(failed > 0 ? 1 : 0)
}
testQuill()
