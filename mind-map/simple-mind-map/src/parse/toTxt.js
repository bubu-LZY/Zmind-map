import { walk, nodeRichTextToTextWithWrap } from '../utils'

const getNodeText = data => {
  if (data.richText) {
    // 挖空 span 转为 [==文本==] 语法（二开功能）
    const html = String(data.text || '').replace(
      /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/g,
      '[==$1==]'
    )
    return nodeRichTextToTextWithWrap(html)
  }
  return data.text
}

const getIndent = level => {
  return new Array(level).fill('   ').join('')
}

// 转换成txt格式
export const transformToTxt = root => {
  let content = ''
  walk(
    root,
    null,
    (node, parent, isRoot, layerIndex) => {
      content += getIndent(layerIndex)
      content += ' ' + getNodeText(node.data)
      // 概要
      const generalization = node.data.generalization
      if (Array.isArray(generalization)) {
        content += generalization.map(item => {
          return ` [${getNodeText(item)}]`
        })
      } else if (generalization && generalization.text) {
        content += ` [${getNodeText(generalization)}]`
      }
      content += '\n\n'
    },
    () => {},
    true
  )
  return content
}
