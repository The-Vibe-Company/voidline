type AnyArgs = unknown[];

export function createNoopGradient(): CanvasGradient {
  return {
    addColorStop: () => {},
  } as unknown as CanvasGradient;
}

export function createNoopContext(): CanvasRenderingContext2D {
  const noop = (..._args: AnyArgs): unknown => undefined;
  const ctx: Record<string, unknown> = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "rgba(0,0,0,0)",
    shadowBlur: 0,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setLineDash: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 0 }) as TextMetrics,
    createLinearGradient: () => createNoopGradient(),
    createRadialGradient: () => createNoopGradient(),
    createPattern: () => null,
    drawImage: noop,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) as DOMMatrix,
    setTransform: noop,
    resetTransform: noop,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

export function createNoopCanvas(width = 1280, height = 720): HTMLCanvasElement {
  const ctx = createNoopContext();
  const canvas: Record<string, unknown> = {
    width,
    height,
    style: {},
    getContext: () => ctx,
  };
  return canvas as unknown as HTMLCanvasElement;
}
