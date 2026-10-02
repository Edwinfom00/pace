"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { inboxOverviewHref, type InboxOverview } from "../inbox-overview";

type InboxPage = Pick<InboxOverview, "items" | "pagination">;
type PageCache = { readonly source: InboxOverview; readonly pages: ReadonlyMap<number, InboxPage> };

function seedCache(overview: InboxOverview): PageCache {
  return {
    source: overview,
    pages: new Map([[overview.pagination.page, { items: overview.items, pagination: overview.pagination }]]),
  };
}

export function useInboxPages({
  overview,
  pathname,
  workspaceId,
}: {
  readonly overview: InboxOverview;
  readonly pathname: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [storedCache, setCache] = useState<PageCache>(() => seedCache(overview));
  const [fallbackPage, setFallbackPage] = useState(overview.pagination.page);
  const inFlight = useRef(new Map<string, Promise<boolean>>());
  const cache = storedCache.source === overview ? storedCache : seedCache(overview);

  const totalPages = Math.max(1, Math.ceil(overview.pagination.totalCount / overview.pagination.pageSize));
  const requestedPage = Math.min(Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1)) || 1), totalPages);

  const hrefFor = useCallback(
    (page: number) => inboxOverviewHref(pathname, { reason: overview.activeFilter, sort: overview.sort, page }),
    [overview.activeFilter, overview.sort, pathname],
  );

  const loadPage = useCallback((page: number): Promise<boolean> => {
    if (page < 1 || page > totalPages || cache.pages.has(page)) return Promise.resolve(true);
    const query = new URLSearchParams({ page: String(page), sort: overview.sort });
    if (overview.activeFilter) query.set("reason", overview.activeFilter);
    const key = query.toString();
    const pending = inFlight.current.get(key);
    if (pending) return pending;

    const request = fetch(`/api/workspaces/${workspaceId}/inbox?${key}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return false;
        const next = (await response.json()) as InboxOverview;
        setCache((previous) => {
          const base = previous.source === overview ? previous : seedCache(overview);
          return {
            source: overview,
            pages: new Map(base.pages).set(page, { items: next.items, pagination: next.pagination }),
          };
        });
        return true;
      })
      .catch(() => false)
      .finally(() => inFlight.current.delete(key));
    inFlight.current.set(key, request);
    return request;
  }, [cache.pages, overview, totalPages, workspaceId]);

  useEffect(() => {
    void loadPage(requestedPage).then((loaded) => {
      if (!loaded) router.replace(hrefFor(requestedPage));
    });
    void loadPage(requestedPage + 1);
    void loadPage(requestedPage - 1);
  }, [hrefFor, loadPage, requestedPage, router]);

  const goToPage = useCallback((page: number) => {
    if (page === requestedPage) return;
    setFallbackPage(requestedPage);
    window.history.pushState(null, "", hrefFor(page));
  }, [hrefFor, requestedPage]);

  const current = cache.pages.get(requestedPage);
  const shown = current
    ?? cache.pages.get(fallbackPage)
    ?? { items: overview.items, pagination: overview.pagination };

  return {
    page: shown,
    currentPage: requestedPage,
    isLoadingPage: !current,
    goToPage,
    prefetchPage: loadPage,
  };
}
