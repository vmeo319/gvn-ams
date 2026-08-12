// Serializes a rendered Recharts SVG to a PNG and triggers a browser download. No external
// library — draws the SVG onto a canvas via a blob URL, filling the app's dark background
// first so the export isn't transparent when opened elsewhere.
export function downloadSvgAsPng(svg: SVGSVGElement, filename: string, backgroundColor = '#0f172a') {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const rect = svg.getBoundingClientRect()
  const width = rect.width || Number(svg.getAttribute('width')) || 600
  const height = rect.height || Number(svg.getAttribute('height')) || 400
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const svgString = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(url)
      return
    }
    ctx.scale(scale, scale)
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    URL.revokeObjectURL(url)

    canvas.toBlob((blob) => {
      if (!blob) return
      const link = document.createElement('a')
      const blobUrl = URL.createObjectURL(blob)
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    }, 'image/png')
  }
  img.src = url
}
