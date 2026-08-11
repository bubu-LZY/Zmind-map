// 挖空 DOM 操作核心测试（不依赖 Quill 初始化）
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root" contenteditable>这是一段测试文字用来挖空</div></body></html>')
const { window } = dom
const { document } = window
const { getSelection } = window

global.document = document
global.window = window
global.Node = window.Node
global.getSelection = getSelection.bind(window)

// ===== cloze 模块 =====
const cloze = require('./src/utils/cloze.js')

let passed = 0, failed = 0
function assert(cond, desc) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + desc) }
  else { failed++; console.error('  \x1b[31m✗\x1b[0m ' + desc) }
}

// ===== 1. 编解码 =====
console.log('1. 编解码')
const raw = '<p><code>hello</code></p>'
const enc = cloze.encodeClozeInHtml(raw)
assert(enc === '<p><span class="smm-cloze">hello</span></p>', 'encode')
assert(cloze.decodeClozeFromHtml(enc) === raw, 'decode')
assert(cloze.decodeClozeFromHtml(cloze.encodeClozeInHtml('<p>a<code>b</code>c<code>d</code>e</p>'))
  === '<p>a<code>b</code>c<code>d</code>e</p>', 'round-trip 多段')
console.log('  编解码: ' + (passed - 0) + ' passed')

// ===== 2. 模拟 toggleSelectionCloze 的 DOM 操作 =====
console.log('2. DOM 包裹/解包测试')

const root = document.getElementById('root')

// --- 测试包裹 ---
// 选中 "测试文字" (offset 4-8)
const textNode = root.firstChild
const r1 = document.createRange()
r1.setStart(textNode, 4)
r1.setEnd(textNode, 8)
getSelection().removeAllRanges()
getSelection().addRange(r1)

// 模拟 toggleSelectionCloze 的包裹逻辑
const code = document.createElement('code')
try {
  r1.surroundContents(code)
} catch (e) {
  const t = r1.toString()
  r1.deleteContents()
  code.textContent = t
  r1.insertNode(code)
}
// 调用 quill.update 模拟（实际 quill 中会做）
// 这里只验证 DOM
const codeInDom = root.querySelectorAll('code')
assert(codeInDom.length === 1, 'DOM 中 1 个 <code>')
assert(codeInDom[0].textContent === '测试文字', '<code> 内容正确')
assert(root.textContent.includes('测试文字'), '全文包含测试文字')

// --- 测试解包 ---
// 选中 code 内的 "文字" (offset 5-7, 在 code 范围内)
const st = window.getSelection()
st.removeAllRanges()
const r2 = document.createRange()
r2.setStart(codeInDom[0].firstChild, 2) // 第3个字"文"的后面 → 注意是"测试文字"，选"文字"从 index 2 开始
r2.setEnd(codeInDom[0].firstChild, 4)
st.addRange(r2)

// 模拟在 cloze 内按 Ctrl+Enter：unpack
const parent = codeInDom[0].parentNode
while (codeInDom[0].firstChild) {
  parent.insertBefore(codeInDom[0].firstChild, codeInDom[0])
}
parent.removeChild(codeInDom[0])
assert(root.querySelectorAll('code').length === 0, '解包后无 <code>')
assert(root.textContent === '这是一段测试文字用来挖空', '解包后全文恢复')

// ===== 3. RichText save 编码流程 =====
console.log('3. save/load 编解码')
// 手动插入一个 <code> 模拟挖空后的编辑器状态
root.innerHTML = '这是<code>挖空测试</code>内容'
const saved = cloze.encodeClozeInHtml(root.innerHTML)
assert(saved.includes('<span class="smm-cloze">挖空测试</span>'), 'save: code→smm-cloze')
assert(!saved.includes('<code>'), 'save: 无残留 code')

// decode back for re-editing
const restored = cloze.decodeClozeFromHtml(saved)
assert(restored.includes('<code>用来挖空</code>'), 're-edit: smm-cloze→code')

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`)
process.exit(failed > 0 ? 1 : 0)
