// Shared "array of numbers -> SVG path" math for any widget drawing a
// compact trend line (LineGraphWidget, StockWidget, ...).

export function buildSparklinePath(points: number[], width: number, height: number): string {
  if (points.length < 2) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  return points
    .map((value, i) => {
      const x = i * stepX;
      const y = height - ((value - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
