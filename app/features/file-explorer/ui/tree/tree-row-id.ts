/** DOM id of a row, for the tree's `aria-activedescendant`. */
export function treeRowId(key: string): string {
  return `tree-row-${key}`
}
