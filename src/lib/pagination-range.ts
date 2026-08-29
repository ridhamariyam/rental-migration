/**
 * Classic "1 2 [3] 4 … 10" page-number range with ellipsis, shared by every
 * paginated table so they render consistently instead of each screen
 * reinventing its own truncation rule.
 */
export type PaginationRangeItem = number | "ellipsis";

export function paginationRange(
  current: number,
  total: number,
  siblingCount = 1,
): PaginationRangeItem[] {
  const totalPageNumbers = siblingCount * 2 + 5;

  if (totalPageNumbers >= total) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const leftSiblingIndex = Math.max(current - siblingCount, 1);
  const rightSiblingIndex = Math.min(current + siblingCount, total);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < total - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = 3 + siblingCount * 2;
    const leftRange = Array.from(
      { length: leftItemCount },
      (_, index) => index + 1,
    );
    return [...leftRange, "ellipsis", total];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = 3 + siblingCount * 2;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, index) => total - rightItemCount + index + 1,
    );
    return [1, "ellipsis", ...rightRange];
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, index) => leftSiblingIndex + index,
  );
  return [1, "ellipsis", ...middleRange, "ellipsis", total];
}
