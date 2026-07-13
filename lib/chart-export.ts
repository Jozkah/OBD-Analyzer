// Rasterize a Recharts SVG panel to a PNG and download it. The SVG is cloned, sized to its
// on-screen box, given an opaque theme background (charts are transparent), and a <style>
// fallback so axis/label text keeps a visible fill once detached from the page's CSS. The
// clone is drawn via a same-origin blob: URL so the canvas is never tainted (CSP allows
// blob: in img-src), then exported at 2x for a crisp image.
export function exportChartPng(
  container: HTMLElement | null,
  filename: string,
  theme: "light" | "dark",
  onNotify?: (msg: string) => void,
): void {
  const svg = container?.querySelector("svg")
  if (!svg) {
    onNotify?.("No chart to export")
    return
  }
  const rect = svg.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const bg = theme === "light" ? "#ffffff" : "#0b0e16"
  const fg = theme === "light" ? "#0f172a" : "#e5e7eb"

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(width))
  clone.setAttribute("height", String(height))
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style")
  // Inline fills on recharts elements win over this; it only supplies a fallback for text
  // that relied on inherited CSS color (which is lost in a detached SVG).
  style.textContent = `text{font-family:ui-sans-serif,system-ui,sans-serif;} .recharts-text{fill:${fg};}`
  clone.insertBefore(style, clone.firstChild)

  const svgData = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(new Blob([svgData], { type: "image/svg+xml;charset=utf-8" }))
  const scale = 2
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(svgUrl)
    const canvas = document.createElement("canvas")
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      onNotify?.("Export failed")
      return
    }
    ctx.scale(scale, scale)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    canvas.toBlob((blob) => {
      if (!blob) {
        onNotify?.("Export failed")
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      onNotify?.("Chart exported as PNG")
    }, "image/png")
  }
  img.onerror = () => {
    URL.revokeObjectURL(svgUrl)
    onNotify?.("Export failed")
  }
  img.src = svgUrl
}
