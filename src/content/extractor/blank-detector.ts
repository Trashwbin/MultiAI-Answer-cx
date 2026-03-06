export function detectBlankCount(questionDiv: Element): number {
  return questionDiv.querySelectorAll('.stem_answer .tiankong').length;
}
