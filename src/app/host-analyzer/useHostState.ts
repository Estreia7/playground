"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "./helpers";
import type {
  AdrJobInfo,
  FunnelHost,
  HostJobState,
  HostListing,
  HostMeta,
  JobStatus,
  License,
  MonthResult,
} from "./types";

type JobsMap = Record<string, HostJobState>;

type HostJobDetail = {
  job: { id: string; status: JobStatus; createdAt: number; urls: string[]; name: string };
  host: (HostMeta & { jobId: string }) | null;
  listings: Array<
    HostListing & { status: HostListing["status"]; finishedAt: number }
  >;
  licenses: Record<string, License>;
  adrJobs: Array<{
    job: { id: string; status: JobStatus; name: string; urls: string[] };
    listings: Array<{ url: string; status: string; result: MonthResult[] }>;
  }>;
};

function emptyHostJob(j: {
  id: string;
  status: JobStatus;
  createdAt: number;
  urls: string[];
  name: string;
}): HostJobState {
  return {
    id: j.id,
    status: j.status,
    createdAt: j.createdAt,
    name: j.name,
    profileUrl: j.urls[0] || "",
    phase: null,
    host: null,
    listings: {},
    listingOrder: [],
    licenses: {},
    adrJobs: {},
  };
}

function hydrateDetail(d: HostJobDetail): HostJobState {
  const base = emptyHostJob(d.job);
  if (d.host) {
    base.host = {
      hostId: d.host.hostId ?? null,
      hostUrl: d.host.hostUrl,
      hostName: d.host.hostName ?? null,
      listingsCount: d.host.listingsCount ?? null,
      adrJobIds: d.host.adrJobIds ?? [],
    };
  }
  for (const l of d.listings) {
    base.listings[l.url] = {
      url: l.url,
      status: l.status || "done",
      title: l.title ?? null,
      locationText: l.locationText ?? null,
      reviewsCount: l.reviewsCount ?? null,
      reviewsScore: l.reviewsScore ?? null,
      alNumber: l.alNumber ?? null,
      photos: l.photos ?? [],
      error: l.error,
    };
    base.listingOrder.push(l.url);
  }
  base.licenses = d.licenses || {};
  for (const a of d.adrJobs || []) {
    const info: AdrJobInfo = {
      id: a.job.id,
      status: a.job.status,
      name: a.job.name,
      urls: a.job.urls,
      listings: {},
    };
    for (const l of a.listings) {
      info.listings[l.url] = {
        url: l.url,
        status: l.status,
        monthsDone: l.result.length,
        result: l.result,
      };
    }
    base.adrJobs[a.job.id] = info;
  }
  return base;
}

export function useHostState() {
  const [jobs, setJobs] = useState<JobsMap>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelHost[] | null>(null);
  // adr job id -> parent host job id, so ADR SSE events route to the host.
  const adrParentRef = useRef<Record<string, string>>({});

  const refreshFunnel = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/host-funnel`);
      if (!res.ok) return;
      const { hosts } = (await res.json()) as { hosts: FunnelHost[] };
      setFunnel(hosts);
    } catch {
      // transient; next refresh will retry
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/host-jobs/${id}`);
      if (!res.ok) return;
      const detail = (await res.json()) as HostJobDetail;
      const state = hydrateDetail(detail);
      for (const adrId of state.host?.adrJobIds || []) {
        adrParentRef.current[adrId] = id;
      }
      setJobs((prev) => ({ ...prev, [id]: state }));
    } catch {
      // keep the list-level entry
    }
  }, []);

  // Initial load: job list + detail per job.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/host-jobs?limit=30`);
        if (!res.ok) return;
        const { jobs: list } = (await res.json()) as {
          jobs: Array<{
            id: string;
            status: JobStatus;
            createdAt: number;
            urls: string[];
            name: string;
          }>;
        };
        if (cancelled) return;
        setOrder(list.map((j) => j.id));
        setJobs(Object.fromEntries(list.map((j) => [j.id, emptyHostJob(j)])));
        await Promise.all(list.map((j) => loadDetail(j.id)));
        refreshFunnel();
      } catch (err) {
        console.warn("host jobs initial load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDetail, refreshFunnel]);

  const applyEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      const jobId = payload.jobId as string;
      if (!jobId) return;
      const parentId = adrParentRef.current[jobId];

      // --- Events on a linked ADR job route into the parent host job. -------
      if (parentId) {
        setJobs((prev) => {
          const host = prev[parentId];
          if (!host) return prev;
          const adr = host.adrJobs[jobId] || {
            id: jobId,
            status: "queued" as JobStatus,
            name: "",
            urls: [],
            listings: {},
          };
          let next = adr;
          if (type === "job-created") {
            next = {
              ...adr,
              name: (payload.name as string) || adr.name,
              urls: (payload.urls as string[]) || adr.urls,
            };
          } else if (type === "job-status") {
            next = { ...adr, status: payload.status as JobStatus };
          } else if (type === "listing-started") {
            const url = payload.url as string;
            next = {
              ...adr,
              listings: {
                ...adr.listings,
                [url]: adr.listings[url] || { url, status: "running", monthsDone: 0, result: [] },
              },
            };
          } else if (type === "progress") {
            const url = payload.url as string;
            const l = adr.listings[url] || { url, status: "running", monthsDone: 0, result: [] };
            const monthsDone =
              payload.status === "done" || payload.status === "error"
                ? l.monthsDone + 1
                : l.monthsDone;
            next = { ...adr, listings: { ...adr.listings, [url]: { ...l, monthsDone } } };
          } else if (type === "listing-done") {
            const url = payload.url as string;
            const result = (payload.months as MonthResult[]) || [];
            next = {
              ...adr,
              listings: {
                ...adr.listings,
                [url]: {
                  url,
                  status: (payload.status as string) || "done",
                  monthsDone: result.length,
                  result,
                },
              },
            };
          }
          return { ...prev, [parentId]: { ...host, adrJobs: { ...host.adrJobs, [jobId]: next } } };
        });
        return;
      }

      // --- Host-job events. --------------------------------------------------
      if (type === "job-created") {
        if ((payload.type as string) !== "host") return;
        setJobs((prev) =>
          prev[jobId]
            ? prev
            : {
                ...prev,
                [jobId]: emptyHostJob({
                  id: jobId,
                  status: "queued",
                  createdAt: (payload.createdAt as number) || Math.floor(Date.now() / 1000),
                  urls: (payload.urls as string[]) || [],
                  name: (payload.name as string) || "",
                }),
              }
        );
        setOrder((prev) => (prev.includes(jobId) ? prev : [jobId, ...prev]));
        return;
      }

      if (type === "deleted") {
        setJobs((prev) => {
          const { [jobId]: _gone, ...rest } = prev;
          return rest;
        });
        setOrder((prev) => prev.filter((id) => id !== jobId));
        setSelected((cur) => (cur === jobId ? null : cur));
        return;
      }

      setJobs((prev) => {
        const job = prev[jobId];
        if (!job) return prev;

        if (type === "job-status") {
          const status = payload.status as JobStatus;
          if (status === "done") setTimeout(() => refreshFunnel(), 400);
          return { ...prev, [jobId]: { ...job, status } };
        }

        if (type === "host-phase") {
          return {
            ...prev,
            [jobId]: {
              ...job,
              phase: payload.phase as HostJobState["phase"],
              profileFound: (payload.found as number) ?? job.profileFound,
            },
          };
        }

        if (type === "host-profile-done") {
          const hostPayload = payload.host as {
            hostId: string | null;
            hostUrl: string;
            hostName: string | null;
            listingsCount: number | null;
          };
          const cards = (payload.listings as Array<Partial<HostListing> & { url: string }>) || [];
          const listings = { ...job.listings };
          const orderArr = [...job.listingOrder];
          for (const c of cards) {
            if (!listings[c.url]) orderArr.push(c.url);
            listings[c.url] = {
              url: c.url,
              status: listings[c.url]?.status || "queued",
              title: c.title ?? null,
              locationText: c.locationText ?? null,
              reviewsCount: c.reviewsCount ?? null,
              reviewsScore: c.reviewsScore ?? null,
              alNumber: listings[c.url]?.alNumber ?? null,
              photos: listings[c.url]?.photos ?? [],
            };
          }
          return {
            ...prev,
            [jobId]: {
              ...job,
              host: {
                hostId: hostPayload.hostId,
                hostUrl: hostPayload.hostUrl,
                hostName: hostPayload.hostName,
                listingsCount: hostPayload.listingsCount,
                adrJobIds: job.host?.adrJobIds || [],
              },
              listings,
              listingOrder: orderArr,
              truncated: !!payload.truncated,
            },
          };
        }

        if (type === "host-listing-started") {
          const url = payload.url as string;
          const l = job.listings[url];
          if (!l) return prev;
          return {
            ...prev,
            [jobId]: { ...job, listings: { ...job.listings, [url]: { ...l, status: "running" } } },
          };
        }

        if (type === "host-listing-done") {
          const url = payload.url as string;
          const existed = job.listings[url];
          const orderArr = existed ? job.listingOrder : [...job.listingOrder, url];
          return {
            ...prev,
            [jobId]: {
              ...job,
              listingOrder: orderArr,
              listings: {
                ...job.listings,
                [url]: {
                  url,
                  status: (payload.status as HostListing["status"]) || "done",
                  title: (payload.title as string) ?? existed?.title ?? null,
                  locationText: (payload.locationText as string) ?? existed?.locationText ?? null,
                  reviewsCount: (payload.reviewsCount as number) ?? existed?.reviewsCount ?? null,
                  reviewsScore: (payload.reviewsScore as number) ?? existed?.reviewsScore ?? null,
                  alNumber: (payload.alNumber as string) ?? null,
                  photos: (payload.photos as string[]) ?? existed?.photos ?? [],
                  error: payload.error as string | undefined,
                },
              },
            },
          };
        }

        if (type === "host-license-done") {
          const alNumber = payload.alNumber as string;
          if (payload.error) {
            return {
              ...prev,
              [jobId]: {
                ...job,
                licenses: {
                  ...job.licenses,
                  [alNumber]: {
                    alNumber,
                    rnt: { status: "not-found", alNumber },
                    lat: null,
                    lng: null,
                    geocodeStatus: "failed",
                    error: payload.error as string,
                  },
                },
              },
            };
          }
          return {
            ...prev,
            [jobId]: {
              ...job,
              licenses: {
                ...job.licenses,
                [alNumber]: {
                  alNumber,
                  rnt: payload.rnt as License["rnt"],
                  lat: (payload.lat as number) ?? null,
                  lng: (payload.lng as number) ?? null,
                  geocodeStatus: (payload.geocodeStatus as string) || "unknown",
                },
              },
            },
          };
        }

        if (type === "host-adr-linked") {
          const ids = (payload.adrJobIds as string[]) || [];
          for (const adrId of ids) adrParentRef.current[adrId] = jobId;
          return {
            ...prev,
            [jobId]: {
              ...job,
              host: job.host ? { ...job.host, adrJobIds: ids } : job.host,
            },
          };
        }

        return prev;
      });
    },
    [refreshFunnel]
  );

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/jobs/stream`);
    const types = [
      "job-created",
      "job-status",
      "host-phase",
      "host-profile-done",
      "host-listing-started",
      "host-listing-done",
      "host-license-done",
      "host-adr-linked",
      "listing-started",
      "listing-meta",
      "progress",
      "listing-done",
      "deleted",
    ];
    const handler = (type: string) => (e: MessageEvent) => {
      try {
        applyEvent(type, JSON.parse(e.data));
      } catch (err) {
        console.warn("bad sse payload", err);
      }
    };
    for (const t of types) es.addEventListener(t, handler(t));
    return () => es.close();
  }, [applyEvent]);

  const visibleJobs = useMemo(
    () => order.map((id) => jobs[id]).filter(Boolean),
    [order, jobs]
  );

  const submitJob = useCallback(async (input: { profileUrl: string; name: string }) => {
    const res = await fetch(`${API_BASE}/host-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || `HTTP ${res.status}`);
    }
    const { jobId } = (await res.json()) as { jobId: string };
    return jobId;
  }, []);

  const cancelJob = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/host-jobs/${id}/cancel`, { method: "POST" });
  }, []);

  const deleteJob = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/host-jobs/${id}`, { method: "DELETE" });
  }, []);

  const retryJob = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/host-jobs/${id}/retry`, { method: "POST" });
  }, []);

  const runAdr = useCallback(
    async (id: string) => {
      const res = await fetch(`${API_BASE}/host-jobs/${id}/adr`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const { adrJobIds } = (await res.json()) as { adrJobIds: string[] };
      for (const adrId of adrJobIds) adrParentRef.current[adrId] = id;
      await loadDetail(id);
      return adrJobIds;
    },
    [loadDetail]
  );

  const currentJob = selected ? jobs[selected] ?? null : null;

  return {
    jobs,
    visibleJobs,
    selected,
    setSelected,
    currentJob,
    funnel,
    refreshFunnel,
    submitJob,
    cancelJob,
    deleteJob,
    retryJob,
    runAdr,
  };
}
