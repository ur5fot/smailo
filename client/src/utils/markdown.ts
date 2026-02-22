import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function renderMd(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string)
}
