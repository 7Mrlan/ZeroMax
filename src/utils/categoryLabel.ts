/** Returns the user-facing category path without changing the stored key. */
export const formatCategoryLabel = (name: string, parentName?: string | null): string =>
  parentName ? `${parentName} · ${name}` : name;
