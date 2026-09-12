export function isLightWorkspace(element) {
  return Boolean(element?.closest('.ct-workspace'))
}

export function workspaceTextColor(color) {
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) return color
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
  let role
  if (g > r * 1.15 && g > b * 1.05 && g > 160) role = 'positive'
  else if (r > 200 && g > 140 && b < 100) role = 'warning'
  else if (r > g * 1.15 && r > b * 1.1 && r > 180 && g < 190) role = 'negative'
  else if (Math.max(r, g, b) - Math.min(r, g, b) < 45) role = r > 200 ? 'ink' : 'muted'
  return role ? `var(--ct-${role}, ${color})` : color
}

// Canvas and embedded charts cannot inherit the CSS palette.
export function workspaceChartOptions(element) {
  if (!isLightWorkspace(element)) return {}
  return {
    layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#58665e' },
    grid: { vertLines: { color: '#edf0ee' }, horzLines: { color: '#edf0ee' } },
    rightPriceScale: { borderColor: '#d4dcd6' },
    timeScale: { borderColor: '#d4dcd6' },
  }
}
