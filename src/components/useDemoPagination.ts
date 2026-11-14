import { useState } from "react";

export const DEMO_PAGE_SIZE = 6;

export function useDemoPagination<T>(items: readonly T[]) {
  const [requestedPage, onPageChange] = useState(0);
  const pageCount = Math.ceil(items.length / DEMO_PAGE_SIZE);
  const page = Math.min(requestedPage, Math.max(0, pageCount - 1));
  return {
    page,
    pageCount,
    items: items.slice(page * DEMO_PAGE_SIZE, (page + 1) * DEMO_PAGE_SIZE),
    onPageChange,
  };
}
