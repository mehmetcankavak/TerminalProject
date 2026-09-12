import test from 'node:test'
import assert from 'node:assert/strict'
import { isLightWorkspace, workspaceChartOptions, workspaceTextColor } from './workspaceTheme.js'

test('chart styling is restricted to the web workspace', () => {
  assert.equal(isLightWorkspace(null), false)
  assert.deepEqual(workspaceChartOptions({ closest: () => null }), {})
  const options = workspaceChartOptions({ closest: () => ({}) })
  assert.equal(options.layout.background.color, '#ffffff')
  assert.equal(options.layout.textColor, '#58665e')
  assert.equal(options.timeScale.borderColor, '#d4dcd6')
})

test('financial text gets accessible colors with original-color fallbacks', () => {
  assert.equal(workspaceTextColor('#00e87a'), 'var(--ct-positive, #00e87a)')
  assert.equal(workspaceTextColor('#f43f5e'), 'var(--ct-negative, #f43f5e)')
  assert.equal(workspaceTextColor('#fbbf24'), 'var(--ct-warning, #fbbf24)')
  assert.equal(workspaceTextColor('#f5a623'), 'var(--ct-warning, #f5a623)')
  assert.equal(workspaceTextColor('#ffffff'), 'var(--ct-ink, #ffffff)')
})

test('existing variables, transparent values and missing colors remain unchanged', () => {
  for (const color of [undefined, null, 'transparent', 'var(--accent)', '#627eea', 'rgba(1,2,3,.4)']) {
    assert.equal(workspaceTextColor(color), color)
  }
})
