// 挖空功能自动化测试（jsdom + quill）
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>')
global.window = dom.window
global.document = dom.window.document
global.Node = dom.window.Node
global.getSelection = () => dom.window.getSelection()
global.dispatchEvent = (e) => {}
// 模拟 Element.prototype.contains（jsdom 需要）
const origGetSelection = dom.window.getSelection.bind(dom.window)
global.window.getSelection = origGetSelection

import Quill from 'quill'

let passed = 0, failed = 0
function assert(cond, desc) {
  if (cond) { passed++; console.log('  ✓ ' + desc) }
  else { failed++; console.error('  ✗ ' + desc) }
}

// ====================== 测试 cloze 编解码 ======================
console.log('1. clozeEncode / clozeDecode 编解码')
import('./src/utils/cloze.js').then(mod => {
  const { encodeClozeInHtml, decodeClozeFromHtml } = mod

  const raw = '<p><code>hello</code> world <code>foo</code></p>'
  const encoded = encodeClozeInHtml(raw)
  assert(encoded.includes('<span class="smm-cloze">hello</span>'), 'encode code→span')
  assert(encoded.includes('<span class="smm-cloze">foo</span>'), 'encode 多段')
  assert(!encoded.includes('<code>'), 'encode 后无残留code')

  const decoded = decodeClozeFromHtml(
    '<p><span class="smm-cloze">hello</span> world <span class="smm-cloze">foo</span></p>'
  )
  assert(decoded.includes('<code>hello</code>'), 'decode span→code')
  assert(decoded.includes('<code>foo</code>'), 'decode 多段')

  // round-trip
  const rt = decodeClozeFromHtml(encodeClozeInHtml(raw))
  assert(rt === raw, 'round-trip 一致')

  // ====================== 测试 toggleSelectionCloze ======================
  console.log('2. toggleSelectionCloze 真实 quill 编辑器交互')

  const quill = new Quill('#editor', { theme: 'snow' })
  quill.setText('这是一段测试文字用来挖空')
  // 选择 "测试文字" (位置 3-7)
  const range = { index: 3, length: 4 }
  quill.setSelection(range.index, range.length)

  // 模拟 mindMap.richText
  global.__mockRichText = { showTextEdit: true, quill }
  global.__mockMindMap = { richText: global.__mockRichText }

  // 重写 cloze 模块的 mindMapRef（用模块全局状态）
  mod.initCloze(global.__mockMindMap)

  // 执行挖空
  mod.toggleSelectionCloze()

  // 检查 quill.root 中是否出现了 <code>
  const codeEls = quill.root.querySelectorAll('code')
  assert(codeEls.length === 1, 'quill DOM 中有 1 个 <code> 元素')
  if (codeEls.length > 0) {
    assert(codeEls[0].textContent === '测试文字', '<code> 内容正确')
  }

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`)
  process.exit(failed > 0 ? 1 : 0)
})
