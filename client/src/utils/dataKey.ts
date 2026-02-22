const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function resolveDataKey(appData: Record<string, unknown>, dataKey: string): unknown {
  if (BLOCKED_KEYS.has(dataKey)) return undefined
  if (appData[dataKey] !== undefined) return appData[dataKey]
  const dotIdx = dataKey.indexOf('.')
  if (dotIdx === -1) return undefined
  const topKey = dataKey.slice(0, dotIdx)
  if (BLOCKED_KEYS.has(topKey)) return undefined
  let value: unknown = appData[topKey]
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return undefined }
  }
  for (const part of dataKey.slice(dotIdx + 1).split('.')) {
    if (BLOCKED_KEYS.has(part)) return undefined
    if (value === null || value === undefined || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}
