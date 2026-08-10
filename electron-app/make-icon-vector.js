// 程序化矢量渲染应用图标（替代 AI 图裁剪方案，保证各尺寸清晰）
// 设计：深青圆角方块 + 白色思维导图符号（左大节点 -> 右侧上下两小节点）
// 渲染：SDF + 4x4 超采样抗锯齿，输出 1024 PNG，再缩放打包多尺寸 ICO
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const Jimp = require('jimp')

const SIZE = 1024
const SS = 4 // 超采样倍数
const OUT_PNG = path.join(__dirname, 'build', 'icon2-512.png')
const OUT_ICO = path.join(__dirname, 'build', 'icon2.ico')

// 品牌色
const TEAL = [23, 110, 98] // #176E62
const WHITE = [255, 255, 255]

// 圆角矩形 SDF（中心对称），p 为相对中心坐标
function sdRoundBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r
  const qy = Math.abs(py) - by + r
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.min(Math.max(qx, qy), 0) + Math.sqrt(ax * ax + ay * ay) - r
}

// 点到线段距离
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.min(
    Math.max((pax * bax + pay * bay) / (bax * bax + bay * bay), 0),
    1
  )
  const dx = pax - bax * h
  const dy = pay - bay * h
  return Math.sqrt(dx * dx + dy * dy)
}

// 三次贝塞尔采样为折线后求最小距离
function sdBezier(px, py, p0, p1, p2, p3) {
  let min = Infinity
  let lx = p0[0]
  let ly = p0[1]
  const N = 80
  for (let i = 1; i <= N; i++) {
    const t = i / N
    const mt = 1 - t
    const x =
      mt * mt * mt * p0[0] +
      3 * mt * mt * t * p1[0] +
      3 * mt * t * t * p2[0] +
      t * t * t * p3[0]
    const y =
      mt * mt * mt * p0[1] +
      3 * mt * mt * t * p1[1] +
      3 * mt * t * t * p2[1] +
      t * t * t * p3[1]
    const d = sdSegment(px, py, lx, ly, x, y)
    if (d < min) min = d
    lx = x
    ly = y
  }
  return min
}

// 图标几何定义（1024 坐标系）
const BOARD = { cx: 512, cy: 512, hx: 512, hy: 512, r: 190 } // 圆角底板
const NODE_LEFT = { cx: 310, cy: 512, hx: 128, hy: 128, r: 42, stroke: 46 }
const NODE_RT = { cx: 738, cy: 332, hx: 92, hy: 92, r: 32, stroke: 42 }
const NODE_RB = { cx: 738, cy: 692, hx: 92, hy: 92, r: 32, stroke: 42 }
const LINK_W = 42

// 连接线：从左节点右缘 -> 右侧节点左缘（S 形曲线）
// 端点深入节点描边内部 24px，保证并集过渡平滑无凹口
const LINK_TOP = [
  [NODE_LEFT.cx + NODE_LEFT.hx - 24, 512],
  [560, 512],
  [560, 332],
  [NODE_RT.cx - NODE_RT.hx + 24, 332]
]
const LINK_BOTTOM = [
  [NODE_LEFT.cx + NODE_LEFT.hx - 24, 512],
  [560, 512],
  [560, 692],
  [NODE_RB.cx - NODE_RB.hx + 24, 692]
]

// 节点轮廓 SDF：|圆角矩形 SDF| - stroke/2 <= 0 即在线条上
function sdNodeOutline(px, py, n) {
  return (
    Math.abs(sdRoundBox(px - n.cx, py - n.cy, n.hx, n.hy, n.r)) - n.stroke / 2
  )
}

function render() {
  const png = new PNG({ width: SIZE, height: SIZE })
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let tealCov = 0
      let whiteCov = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          // 底板
          const dBoard = sdRoundBox(
            px - BOARD.cx,
            py - BOARD.cy,
            BOARD.hx,
            BOARD.hy,
            BOARD.r
          )
          if (dBoard <= 0) {
            tealCov++
            // 白色符号
            const dGlyph = Math.min(
              sdNodeOutline(px, py, NODE_LEFT),
              sdNodeOutline(px, py, NODE_RT),
              sdNodeOutline(px, py, NODE_RB),
              sdBezier(px, py, ...LINK_TOP) - LINK_W / 2,
              sdBezier(px, py, ...LINK_BOTTOM) - LINK_W / 2
            )
            if (dGlyph <= 0) whiteCov++
          }
        }
      }
      const total = SS * SS
      const teal = tealCov / total
      const white = whiteCov / total
      const idx = (y * SIZE + x) << 2
      // 白覆盖青，青覆盖透明
      const r = TEAL[0] * (teal - white) + WHITE[0] * white
      const g = TEAL[1] * (teal - white) + WHITE[1] * white
      const b = TEAL[2] * (teal - white) + WHITE[2] * white
      png.data[idx] = Math.round(r)
      png.data[idx + 1] = Math.round(g)
      png.data[idx + 2] = Math.round(b)
      png.data[idx + 3] = Math.round(teal * 255)
    }
  }
  return PNG.sync.write(png)
}

async function main() {
  console.log('rendering 1024x1024 ...')
  const buf1024 = render()
  const tmp = path.join(__dirname, 'build', 'icon-vector-1024.png')
  fs.writeFileSync(tmp, buf1024)

  const img = await Jimp.read(buf1024)
  // 输出 512 png（electron-builder 备用 / 窗口图标）
  await img
    .clone()
    .resize(512, 512, Jimp.RESIZE_LANCZOS)
    .writeAsync(OUT_PNG)

  // 多尺寸 ICO。注意：NSIS 对 PNG 压缩的 ICO 条目兼容性差（报 invalid icon file size），
  // 因此使用经典 BMP/DIB 格式（32bpp 带 alpha + AND 掩码），兼容性最好。
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const dibBuffers = []
  for (const size of sizes) {
    const cloned = img.clone().resize(size, size, Jimp.RESIZE_LANCZOS)
    dibBuffers.push({ size, buf: rgbaToDib(cloned) })
  }

  // RGBA 位图转 DIB（BITMAPINFOHEADER + 自下而上 BGRA 像素 + 1bpp AND 掩码）
  function rgbaToDib(jimpImg) {
    const w = jimpImg.bitmap.width
    const h = jimpImg.bitmap.height
    const headerSize = 40
    const xorSize = w * h * 4
    const andStride = Math.ceil(w / 32) * 4 // 每行字节数按 4 字节对齐
    const andSize = andStride * h
    const buf = Buffer.alloc(headerSize + xorSize + andSize)
    // BITMAPINFOHEADER
    buf.writeUInt32LE(headerSize, 0) // biSize
    buf.writeInt32LE(w, 4) // biWidth
    buf.writeInt32LE(h * 2, 8) // biHeight = 2倍（XOR + AND）
    buf.writeUInt16LE(1, 12) // biPlanes
    buf.writeUInt16LE(32, 14) // biBitCount
    buf.writeUInt32LE(0, 16) // biCompression = BI_RGB
    buf.writeUInt32LE(xorSize + andSize, 20) // biSizeImage
    // 像素：BGRA，自下而上
    const src = jimpImg.bitmap.data
    for (let y = 0; y < h; y++) {
      const dstRow = headerSize + (h - 1 - y) * w * 4
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4
        const di = dstRow + x * 4
        buf[di] = src[si + 2] // B
        buf[di + 1] = src[si + 1] // G
        buf[di + 2] = src[si] // R
        buf[di + 3] = src[si + 3] // A
      }
    }
    // AND 掩码保持全 0（透明信息由 alpha 通道提供）
    return buf
  }

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(dibBuffers.length, 4)

  let offset = 6 + dibBuffers.length * 16
  const parts = [header]
  for (const { size, buf } of dibBuffers) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(buf.length, 8)
    entry.writeUInt32LE(offset, 10)
    parts.push(entry)
    offset += buf.length
  }
  for (const { buf } of dibBuffers) parts.push(buf)

  fs.writeFileSync(OUT_ICO, Buffer.concat(parts))
  console.log('ICO written:', OUT_ICO, fs.statSync(OUT_ICO).size, 'bytes')
  console.log('PNG written:', OUT_PNG)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
