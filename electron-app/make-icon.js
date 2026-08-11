// 生成多尺寸 ICO：裁剪掉水印和灰边 -> 缩放 -> 打包 PNG-in-ICO
const Jimp = require('jimp')
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, 'build', 'icon-src.png')
const OUT_PNG = path.join(__dirname, 'build', 'icon2-512.png')
const OUT_ICO = path.join(__dirname, 'build', 'icon2.ico')

async function main() {
  const img = await Jimp.read(SRC)
  const w = img.bitmap.width
  const h = img.bitmap.height
  // 裁剪到图标主体（去除外围灰边和右下角水印）：按图像比例取中间区域
  // 原图 1024x1024，圆角方块约占 x:78~948, y:108~930
  const cropX = Math.round(w * 0.12)
  const cropY = Math.round(h * 0.156)
  const side = Math.round(w * 0.716)
  img.crop(cropX, cropY, side, side)

  // 输出 512 png（electron-builder 备用）
  const png512 = img.clone().resize(512, 512)
  await png512.writeAsync(OUT_PNG)

  // 生成 16/24/32/48/64/128/256 多尺寸 PNG 数据
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = []
  for (const size of sizes) {
    const cloned = img.clone().resize(size, size)
    const buf = await cloned.getBufferAsync(Jimp.MIME_PNG)
    pngBuffers.push({ size, buf })
  }

  // 手工打包 ICO（PNG 压缩格式，Vista+ 支持）
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngBuffers.length, 4)

  const entries = []
  let offset = 6 + pngBuffers.length * 16
  const parts = [header]
  for (const { size, buf } of pngBuffers) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0=256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // color palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(buf.length, 8) // data size
    entry.writeUInt32LE(offset, 10) // data offset
    entries.push(entry)
    parts.push(entry)
    offset += buf.length
  }
  for (const { buf } of pngBuffers) parts.push(buf)

  fs.writeFileSync(OUT_ICO, Buffer.concat(parts))
  console.log('ICO written:', OUT_ICO, fs.statSync(OUT_ICO).size, 'bytes')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
