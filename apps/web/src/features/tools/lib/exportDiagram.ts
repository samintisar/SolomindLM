import { downloadBlob } from "@/shared/utils/downloadFile";

const SVG_TYPE = "image/svg+xml;charset=utf-8";

/** A standalone SVG file: XML prolog, namespace, and no page-only class names. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export function downloadSvg(svg: SVGSVGElement, fileName: string): void {
  downloadBlob(new Blob([serializeSvg(svg)], { type: SVG_TYPE }), fileName);
}

/** Rasterizes the SVG on a white canvas at `scale`× its size. */
async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  const url = URL.createObjectURL(new Blob([serializeSvg(svg)], { type: SVG_TYPE }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Couldn't render the diagram"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
        "image/png"
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(svg: SVGSVGElement, fileName: string, scale = 2): Promise<void> {
  downloadBlob(await svgToPngBlob(svg, scale), fileName);
}
