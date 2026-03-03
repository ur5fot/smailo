import { evaluateStyleIf, type StyleIfCondition } from './styleIf'
import { buildFormulaContext } from './formulaContext'

export const STYLE_IF_PREFIX = 'si-'

/**
 * Evaluate styleIf conditions against appData and return prefixed CSS class names.
 * Returns empty array if no styleIf conditions are defined.
 */
export function getConditionalClasses(
  styleIf: StyleIfCondition[] | undefined,
  appData: Record<string, unknown>
): string[] {
  if (!styleIf || styleIf.length === 0) return []
  const context = buildFormulaContext(appData)
  const classes = evaluateStyleIf(styleIf, context)
  return classes.map(c => STYLE_IF_PREFIX + c)
}
