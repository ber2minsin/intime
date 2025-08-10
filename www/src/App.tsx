import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Timeline from "./components/Timeline";
import AppUsageList from "./components/AppUsageList";
import WindowUsageTable from "./components/WindowUsageTable";

type Row = { app_id: number; app_name: string; window_title: string; event_type: string; created_at_sec: number };

export default function App() {
  const [items, setItems] = useState<Array<{ id: string; start: Date; end: Date; name: string; color?: string }>>([]);
  const [usages, setUsages] = useState<Array<{ appId: number; appName: string; durationMs: number; percent: number; color?: string }>>([]);
  const [windowRows, setWindowRows] = useState<Array<{ title: string; startMs: number; endMs: number; durationMs: number }>>([]);

  // In-memory cache for immutable past events
  const rowsRef = useRef<Row[]>([]);
  const idSetRef = useRef<Set<string>>(new Set());
  const lastCachedSecRef = useRef<number | null>(null);
  const minCachedSecRef = useRef<number | null>(null);

  const makeId = (r: Row) => `${r.app_id}-${r.created_at_sec}-${r.window_title}`;

  const mergeRows = (incoming: Row[]) => {
    if (!incoming || incoming.length === 0) return;
    const ids = idSetRef.current;
    const buf: Row[] = [];
    for (const r of incoming) {
      const id = makeId(r);
      if (ids.has(id)) continue;
      ids.add(id);
      buf.push(r);
    }
    if (buf.length === 0) return;
    const merged = rowsRef.current.concat(buf);
    merged.sort((a, b) => a.created_at_sec - b.created_at_sec);
    rowsRef.current = merged;
    const first = merged[0]?.created_at_sec ?? null;
    const last = merged[merged.length - 1]?.created_at_sec ?? null;
    if (first !== null) minCachedSecRef.current = minCachedSecRef.current === null ? first : Math.min(minCachedSecRef.current, first);
    if (last !== null) lastCachedSecRef.current = lastCachedSecRef.current === null ? last : Math.max(lastCachedSecRef.current, last);
  };

  // Deterministic color per app (pseudo-random but stable)
  const colorForApp = (appId: number) => {
    const hue = Math.floor((appId * 137.508) % 360);
    return `hsl(${hue} 70% 45%)`;
  };

  const onViewportChange = useCallback(async (startMs: number, endMs: number) => {
    try {
      const startMsInt = Math.floor(startMs);
      const endMsInt = Math.ceil(endMs);
      // Prefetch a buffer range to ensure we have the "next event" for end calculations
      const span = endMsInt - startMsInt;
      const fetchStartMs = Math.max(0, startMsInt - span);
      const fetchEndMs = endMsInt + span;

      // Decide incremental fetch window
      const lastCachedSec = lastCachedSecRef.current;
      let fetchedCount = 0;
      if (rowsRef.current.length === 0) {
        // Initial fill: fetch the requested buffered range
        const initialRows = await invoke<Row[]>("fetch_window_events", { startMs: fetchStartMs, endMs: fetchEndMs, limit: 5000 });
        initialRows.sort((a, b) => a.created_at_sec - b.created_at_sec);
        mergeRows(initialRows);
        fetchedCount += initialRows.length;
      } else {
        // Backfill older gap if viewport asked earlier than cached minimum
        const minCachedSec = minCachedSecRef.current;
        if (minCachedSec !== null) {
          const gapEndMs = Math.min(fetchEndMs, minCachedSec * 1000 - 1);
          if (fetchStartMs < minCachedSec * 1000) {
            const backRows = await invoke<Row[]>("fetch_window_events", { startMs: fetchStartMs, endMs: gapEndMs, limit: 5000 });
            backRows.sort((a, b) => a.created_at_sec - b.created_at_sec);
            mergeRows(backRows);
            fetchedCount += backRows.length;
          }
        }

        // Incremental forward-only: fetch only events strictly after last cached second
        if (lastCachedSec !== null) {
          const nextStartMs = (lastCachedSec + 1) * 1000;
          if (nextStartMs <= fetchEndMs) {
            const incRows = await invoke<Row[]>("fetch_window_events", { startMs: nextStartMs, endMs: fetchEndMs, limit: 5000 });
            incRows.sort((a, b) => a.created_at_sec - b.created_at_sec);
            mergeRows(incRows);
            fetchedCount += incRows.length;
          }
        }
        // Note: We intentionally do not fetch backwards. Past is immutable; rely on initial cache coverage.
      }

      // Build items from entire cached rows (ensures "next event" linkage works across fetches)
      const rows = rowsRef.current;
      const nowSec = Math.floor(Date.now() / 1000);
      const mapped = rows.map((r: Row, idx: number) => {
        const start = new Date(r.created_at_sec * 1000);
        const nextCreatedAtSec = rows[idx + 1]?.created_at_sec;
        const endCandidateSec = nextCreatedAtSec ?? nowSec;
        const endSec = Math.min(endCandidateSec, nowSec);
        const end = new Date(endSec * 1000);
        const id = `${r.app_id}-${r.created_at_sec}-${r.window_title}`;
        const name = `${r.app_name}: ${r.window_title}`;
        const color = colorForApp(r.app_id);
        return { id, start, end, name, color };
      });
      setItems(mapped);

      // Compute per-app usage within the current viewport, excluding empty time.
      const startSec = Math.floor(startMsInt / 1000);
      const endSec = Math.ceil(endMsInt / 1000);
      const acc = new Map<number, { appName: string; durationMs: number }>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nextSec = rows[i + 1]?.created_at_sec ?? nowSec;
        const segStartSec = Math.max(r.created_at_sec, startSec);
        const segEndSec = Math.min(nextSec, endSec, nowSec);
        if (segEndSec > segStartSec) {
          const durMs = (segEndSec - segStartSec) * 1000;
          const prev = acc.get(r.app_id) || { appName: r.app_name, durationMs: 0 };
          prev.durationMs += durMs;
          acc.set(r.app_id, prev);
        }
      }
      const totalMs = Array.from(acc.values()).reduce((s, v) => s + v.durationMs, 0);
      const usageArr = Array.from(acc.entries()).map(([appId, v]) => ({
        appId,
        appName: v.appName,
        durationMs: v.durationMs,
        percent: totalMs > 0 ? (v.durationMs / totalMs) * 100 : 0,
        color: colorForApp(appId),
      }));
      usageArr.sort((a, b) => b.percent - a.percent);
      setUsages(usageArr);

      // Compute per-window-title usage (start, end, duration) within viewport
      type WinAgg = { startMs: number; endMs: number; durationMs: number };
      const wmap = new Map<string, WinAgg>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nextSec = rows[i + 1]?.created_at_sec ?? nowSec;
        const segStartSec = Math.max(r.created_at_sec, startSec);
        const segEndSec = Math.min(nextSec, endSec, nowSec);
        if (segEndSec > segStartSec) {
          const key = `${r.app_id}::${r.window_title}`; // keep titles distinct per app
          const segStartMs = segStartSec * 1000;
          const segEndMs = segEndSec * 1000;
          const prev = wmap.get(key) || { startMs: segStartMs, endMs: segEndMs, durationMs: 0 };
          prev.startMs = Math.min(prev.startMs, segStartMs);
          prev.endMs = Math.max(prev.endMs, segEndMs);
          prev.durationMs += segEndMs - segStartMs;
          wmap.set(key, prev);
        }
      }
      const wrows = Array.from(wmap.entries()).map(([key, v]) => ({
        title: key.split("::", 2)[1] || key,
        startMs: v.startMs,
        endMs: v.endMs,
        durationMs: v.durationMs,
      }));
      wrows.sort((a, b) => b.durationMs - a.durationMs);
      setWindowRows(wrows);
    } catch (e) {
      console.error("fetch_window_events failed", e);
    }
  }, []);

  return (
    <div className="bg-gray-950 text-gray-100 h-screen space-y-4 mx-auto px-4 py-4 overflow-hidden flex flex-col">
      <Timeline items={items} onViewportChange={onViewportChange} />
      <div className="flex flex-1 overflow-auto gap-4 h-full">
        <AppUsageList usages={usages} />
        <WindowUsageTable rows={windowRows} />
      </div>
    </div>
  );
}
