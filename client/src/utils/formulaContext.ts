/**
 * Build a flat Record<string, unknown> context from appData for formula evaluation.
 * Auto-parses JSON string values so member access works (e.g., rates.USD > 80).
 */
export function buildFormulaContext(
  appData: Record<string, unknown>
): Record<string, unknown> {
  const context: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(appData)) {
    if (typeof value === 'string') {
      // Try to parse JSON strings into objects/arrays for member access
      const trimmed = value.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          context[key] = JSON.parse(value)
          continue
        } catch {
          // Not valid JSON, keep as string
        }
      }
    }
    context[key] = value
  }

  return context
}
