import { imgToDataUrl } from 'simple-mind-map/src/utils/index'
import { transformMarkdownToList } from 'simple-mind-map/src/parse/markdownTo'
import { MessageBox } from 'element-ui'

// 检测文本是否是 Markdown 格式（标题或列表语法）
const checkIsMarkdown = text => {
  if (!text || typeof text !== 'string') return false
  const lines = text.split(/\n/).filter(line => line.trim())
  if (lines.length < 2) return false
  // 包含 Markdown 标题
  if (/^#{1,6}\s+\S/m.test(text)) return true
  // 至少两行是无序/有序列表
  const listLines = lines.filter(line => /^\s*([-*+]|\d+\.)\s+\S/.test(line))
  return listLines.length >= 2
}

// 处理 Markdown 文本：询问用户是否解析为思维导图节点
const handleMarkdown = text => {
  return new Promise(resolve => {
    MessageBox.confirm(
      '检测到剪贴板中是 Markdown 格式文本，是否解析为思维导图节点？',
      'Markdown 解析',
      {
        confirmButtonText: '解析为节点',
        cancelButtonText: '作为纯文本粘贴',
        distinguishCancelAndClose: true,
        type: 'info'
      }
    )
      .then(() => {
        try {
          const list = transformMarkdownToList(text)
          if (list && list.length > 0) {
            resolve({
              simpleMindMap: true,
              data: list
            })
          } else {
            resolve('')
          }
        } catch (error) {
          console.log(error)
          resolve('')
        }
      })
      .catch(() => {
        // 取消或关闭：返回 undefined，走默认的纯文本粘贴流程
        resolve(undefined)
      })
  })
}

// 处理知犀
const handleZHIXI = async data => {
  try {
    try {
      if (!Array.isArray(data)) {
        data = String(data).replace('￿﻿', '')
        data = JSON.parse(data)
      }
    } catch (error) {
      console.log(error)
    }
    if (!Array.isArray(data)) {
      data = []
    }
    const newNodeList = []
    const waitLoadImageList = []
    const walk = (list, newList) => {
      list.forEach(async item => {
        let newRoot = {}
        newList.push(newRoot)
        newRoot.data = {
          text: item.data.text,
          hyperlink: item.data.hyperlink,
          hyperlinkTitle: item.data.hyperlinkTitle,
          note: item.data.note
        }
        // 图片
        if (item.data.image) {
          let resolve = null
          let promise = new Promise(_resolve => {
            resolve = _resolve
          })
          waitLoadImageList.push(promise)
          try {
            newRoot.data.image = await imgToDataUrl(item.data.image)
            newRoot.data.imageSize = item.data.imageSize
            resolve()
          } catch (error) {
            resolve()
          }
        }
        // 子节点
        newRoot.children = []
        if (item.children && item.children.length > 0) {
          const children = []
          item.children.forEach(item2 => {
            // 概要
            if (item2.data.type === 'generalize') {
              newRoot.data.generalization = [
                {
                  text: item2.data.text
                }
              ]
            } else {
              children.push(item2)
            }
          })
          walk(children, newRoot.children)
        }
      })
    }
    walk(data, newNodeList)
    await Promise.all(waitLoadImageList)
    return {
      simpleMindMap: true,
      data: newNodeList
    }
  } catch (error) {
    return ''
  }
}

const handleClipboardText = async text => {
  // 知犀数据格式1
  try {
    let parsedData = JSON.parse(text)
    if (parsedData.__c_zx_v !== undefined) {
      const res = await handleZHIXI(parsedData.children)
      return res
    }
  } catch (error) {}
  // 知犀数据格式2
  if (text.includes('￿﻿')) {
    const res = await handleZHIXI(text)
    return res
  }
  // Markdown 文本解析
  if (checkIsMarkdown(text)) {
    const res = await handleMarkdown(text)
    return res
  }
  // 返回 undefined，让库走默认的纯文本粘贴流程
  return undefined
}

export default handleClipboardText
