import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Timeline from "./components/Timeline";
import AppUsageList from "./components/AppUsageList";
import WindowUsageTable from "./components/WindowUsageTable";
import { SelectionProvider, useSelection } from "./state/selection";

type Row = { app_id: number; app_name: string; window_title: string; event_type: string; created_at_sec: number };

function AppInner() {
  const [items, setItems] = useState<Array<{ id: string; start: Date; end: Date; name: string; color?: string }>>([]);
  const [usages, setUsages] = useState<Array<{ appId: number; appName: string; durationMs: number; percent: number; color?: string }>>([]);
  const [windowRows, setWindowRows] = useState<Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId?: number }>>([]);
  // no local selection state; selection is represented by global selectedIds
  const [fullImage, setFullImage] = useState<{ url: string; createdAtSec?: number } | null>(null);
  const { selectedIds, setSelectedIds, clearSelected } = useSelection();

  // In-memory cache for immutable past events
  const rowsRef = useRef<Row[]>([]);
  const idSetRef = useRef<Set<string>>(new Set());
  const lastCachedSecRef = useRef<number | null>(null);
  const minCachedSecRef = useRef<number | null>(null);
  // Indexes for fast selection mapping
  const appToItemIdsRef = useRef<Map<number, string[]>>(new Map());
  const idToAppIdRef = useRef<Map<string, number>>(new Map());

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
      // reset indexes before rebuilding
  appToItemIdsRef.current = new Map();
  idToAppIdRef.current = new Map();

      const mapped = rows.map((r: Row, idx: number) => {
        const start = new Date(r.created_at_sec * 1000);
        const nextCreatedAtSec = rows[idx + 1]?.created_at_sec;
        const endCandidateSec = nextCreatedAtSec ?? nowSec;
        const endSec = Math.min(endCandidateSec, nowSec);
        const end = new Date(endSec * 1000);
        const id = `${r.app_id}-${r.created_at_sec}-${r.window_title}`;
        const name = `${r.app_name}: ${r.window_title}`;
        const color = colorForApp(r.app_id);
        // index
        idToAppIdRef.current.set(id, r.app_id);
        const arrA = appToItemIdsRef.current.get(r.app_id) || [];
        arrA.push(id);
        appToItemIdsRef.current.set(r.app_id, arrA);
        return { id, start, end, name, color };
      });
      setItems(mapped);

  // Aggregation window: use current viewport (not drag-selection)
  const aggStartSec = Math.floor(startMsInt / 1000);
  const aggEndSec = Math.ceil(endMsInt / 1000);

      // Compute per-app usage within the aggregation window
      const startSec = aggStartSec;
      const endSec = aggEndSec;
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

      // Build per-event rows (id matches timeline item id), clipped to viewport
      const evRows: Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId: number }> = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nextSec = rows[i + 1]?.created_at_sec ?? nowSec;
        const segStartSec = Math.max(r.created_at_sec, startSec);
        const segEndSec = Math.min(nextSec, endSec, nowSec);
        if (segEndSec > segStartSec) {
          const id = `${r.app_id}-${r.created_at_sec}-${r.window_title}`;
          const segStartMs = segStartSec * 1000;
          const segEndMs = segEndSec * 1000;
          evRows.push({ id, title: r.window_title, startMs: segStartMs, endMs: segEndMs, durationMs: segEndMs - segStartMs, appId: r.app_id });
        }
      }
      // Default order: most recent first
      evRows.sort((a, b) => b.startMs - a.startMs);
      setWindowRows(evRows);
    } catch (e) {
      console.error("fetch_window_events failed", e);
    }
  }, []);

  // Initial load: if no selection, fetch a broad time range to build full cache
  useEffect(() => {
    (async () => {
      if (rowsRef.current.length > 0) return;
      // Fetch all known data in chunks. If backend supports unlimited, you can widen further.
      // Here we fetch last ~180 days as a reasonable default; adjust if needed.
      const now = Date.now();
      const days180 = 180 * 24 * 60 * 60 * 1000;
      const start = Math.max(0, now - days180);
      await onViewportChange(start, now);
    })();
  }, [onViewportChange]);

  // Open full-size image from Timeline (F12 while previewing)
  const handleOpenFullImage = useCallback((payload: { bytes: Uint8Array; createdAtSec?: number }) => {
    try {
      if (fullImage?.url) URL.revokeObjectURL(fullImage.url);
      // Copy into a fresh Uint8Array to ensure an ArrayBuffer-backed BlobPart
      const copy = new Uint8Array(payload.bytes.length);
      copy.set(payload.bytes);
      const blob = new Blob([copy], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      setFullImage({ url, createdAtSec: payload.createdAtSec });
    } catch { /* noop */ }
  }, [fullImage]);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullImage((cur) => {
          if (cur?.url) URL.revokeObjectURL(cur.url);
          return null;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Compute currently selected appIds and rowKeys from global selectedIds
  const selectedAppIds = useMemo(() => {
    const set = new Set<number>();
    for (const id of selectedIds) {
      const appId = idToAppIdRef.current.get(id);
      if (appId != null) set.add(appId);
    }
    return set;
  }, [selectedIds]);

  // selected rows in table are event ids; reuse selectedIds set directly

  return (
    <div className="bg-gray-950 text-gray-100 h-screen space-y-4 mx-auto px-4 py-4 overflow-hidden flex flex-col">
      <Timeline
        items={items}
        onViewportChange={onViewportChange}
  onSelectionChange={(range) => {
          if (!range) { clearSelected(); return; }
          // selecting by dragging: choose events whose midpoint falls inside
          const start = Math.min(range.startMs, range.endMs);
          const end = Math.max(range.startMs, range.endMs);
          const ids = items.filter(it => {
            const mid = (it.start.getTime() + it.end.getTime()) / 2;
            return mid >= start && mid <= end;
          }).map(it => it.id);
          setSelectedIds(ids);
        }}
        onOpenFullImage={handleOpenFullImage}
        selectedIds={selectedIds}
      />
      {fullImage ? (
        <div className="flex-1 overflow-auto bg-black/70 rounded border border-gray-800 relative">
          <button
            className="absolute top-2 right-2 z-10 px-2 py-1 text-xs rounded bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700"
            onClick={() => setFullImage((cur) => { if (cur?.url) URL.revokeObjectURL(cur.url); return null; })}
            aria-label="Close full image"
            title="Close (Esc)"
          >Close</button>
          <div className="p-4">
            <img src={fullImage.url} alt="screenshot" className="block" />
            {fullImage.createdAtSec && (
              <div className="mt-2 text-xs text-gray-300">Captured: {new Date(fullImage.createdAtSec * 1000).toLocaleString()}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-auto gap-4 h-full">
          <AppUsageList
            usages={usages}
            selectedAppIds={selectedAppIds}
            onSelectApp={(appId) => {
              if (appId == null) { clearSelected(); return; }
              const current = selectedAppIds;
              if (current.size === 1 && current.has(appId)) { clearSelected(); return; }
              const ids = appToItemIdsRef.current.get(appId) ?? [];
              setSelectedIds(ids);
            }}
          />
          <WindowUsageTable
            rows={windowRows}
            selectedKeys={selectedIds}
            onSelectRow={(id) => {
              if (!id) { clearSelected(); return; }
              const onlyThis = selectedIds.size === 1 && selectedIds.has(id);
              if (onlyThis) { clearSelected(); return; }
              setSelectedIds([id]);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <SelectionProvider>
      <AppInner />
    </SelectionProvider>
  );
}
