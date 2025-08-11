import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Timeline from "./components/Timeline";
import AppUsageList from "./components/AppUsageList";
import WindowUsageTable from "./components/WindowUsageTable";
import { SelectionProvider, useSelection } from "./state/selection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sun, Moon, Monitor, Palette } from "lucide-react";

type Row = { app_id: number; app_name: string; window_title: string; event_type: string; created_at_sec: number };

function AppInner() {
  const [items, setItems] = useState<Array<{ id: string; start: Date; end: Date; name: string; color?: string }>>([]);
  const [usages, setUsages] = useState<Array<{ appId: number; appName: string; durationMs: number; percent: number; color?: string }>>([]);
  const [windowRows, setWindowRows] = useState<Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId?: number }>>([]);
  // UI state: tabs and settings
  const [activeTab, setActiveTab] = useState<'timeline' | 'settings'>(() => (localStorage.getItem('activeTab') as any) || 'timeline');
  const [hoverMagnifySetting, setHoverMagnifySetting] = useState<boolean>(() => localStorage.getItem('hoverMagnify') === '1');
  const [theme, setTheme] = useState<'light' | 'dark' | 'dark-blue' | 'system'>(() => (localStorage.getItem('theme') as any) || 'dark');

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem('hoverMagnify', hoverMagnifySetting ? '1' : '0'); }, [hoverMagnifySetting]);
  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes first
    root.classList.remove('dark', 'dark-blue');

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      }
    } else if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'dark-blue') {
      root.classList.add('dark-blue');
    }
    // light theme doesn't need any classes
  }, [theme]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = document.documentElement;
      root.classList.remove('dark', 'dark-blue');
      if (mediaQuery.matches) {
        root.classList.add('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
  // no local selection state; selection is represented by global selectedIds
  const [fullImage, setFullImage] = useState<{ url: string; createdAtSec?: number } | null>(null);
  const { selectedIds, setSelectedIds, clearSelected } = useSelection();
  // mirror selection in a ref to read inside async handlers
  const selectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { selectedIdsRef.current = new Set(selectedIds); }, [selectedIds]);

  // In-memory cache for immutable past events
  const rowsRef = useRef<Row[]>([]);
  const idSetRef = useRef<Set<string>>(new Set());
  const lastCachedSecRef = useRef<number | null>(null);
  const minCachedSecRef = useRef<number | null>(null);
  // Indexes for fast selection mapping
  const appToItemIdsRef = useRef<Map<number, string[]>>(new Map());
  const idToAppIdRef = useRef<Map<string, number>>(new Map());
  const idToIndexRef = useRef<Map<string, number>>(new Map());

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
        // map id to its index in rowsRef for quick lookup when building selection-based table rows
        idToIndexRef.current.set(id, idx);
        const arrA = appToItemIdsRef.current.get(r.app_id) || [];
        arrA.push(id);
        appToItemIdsRef.current.set(r.app_id, arrA);
        return { id, start, end, name, color };
      });
      setItems(mapped);

      // Aggregation window: previously used viewport; now selection drives tables. When nothing is selected, we show full history.
      // Build AppUsage/Window table: if no selection, show everything; else compute just for selection
      if (selectedIdsRef.current.size === 0) {
        // AppUsage over all rows
        const accAll = new Map<number, { appName: string; durationMs: number }>();
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const nextSec = rows[i + 1]?.created_at_sec ?? nowSec;
          const segStartSec = r.created_at_sec;
          const segEndSec = Math.min(nextSec, nowSec);
          if (segEndSec > segStartSec) {
            const durMs = (segEndSec - segStartSec) * 1000;
            const prev = accAll.get(r.app_id) || { appName: r.app_name, durationMs: 0 };
            prev.durationMs += durMs;
            accAll.set(r.app_id, prev);
          }
        }
        const totalMsAll = Array.from(accAll.values()).reduce((s, v) => s + v.durationMs, 0);
        const usageAll = Array.from(accAll.entries()).map(([appId, v]) => ({
          appId,
          appName: v.appName,
          durationMs: v.durationMs,
          percent: totalMsAll > 0 ? (v.durationMs / totalMsAll) * 100 : 0,
          color: colorForApp(appId),
        })).sort((a, b) => b.percent - a.percent);
        setUsages(usageAll);

        // WindowUsageTable over all rows
        const evRowsAll: Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId: number }> = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const nextSec = rows[i + 1]?.created_at_sec ?? nowSec;
          const segStartMs = r.created_at_sec * 1000;
          const segEndMs = Math.min(nextSec, nowSec) * 1000;
          if (segEndMs > segStartMs) {
            const id = `${r.app_id}-${r.created_at_sec}-${r.window_title}`;
            evRowsAll.push({ id, title: r.window_title, startMs: segStartMs, endMs: segEndMs, durationMs: segEndMs - segStartMs, appId: r.app_id });
          }
        }
        evRowsAll.sort((a, b) => b.startMs - a.startMs);
        setWindowRows(evRowsAll);
      } else {
        // Selection present: compute from selected ids
        const ids = Array.from(selectedIdsRef.current);
        const evRowsSel: Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId: number }> = [];
        const accSel = new Map<number, { appName: string; durationMs: number }>();
        for (const id of ids) {
          const idx = idToIndexRef.current.get(id);
          if (idx == null) continue;
          const r = rows[idx];
          const nextSec = rows[idx + 1]?.created_at_sec ?? nowSec;
          const segStartMs = r.created_at_sec * 1000;
          const segEndMs = Math.min(nextSec, nowSec) * 1000;
          if (segEndMs > segStartMs) {
            evRowsSel.push({ id, title: r.window_title, startMs: segStartMs, endMs: segEndMs, durationMs: segEndMs - segStartMs, appId: r.app_id });
            const durMs = segEndMs - segStartMs;
            const prev = accSel.get(r.app_id) || { appName: r.app_name, durationMs: 0 };
            prev.durationMs += durMs;
            accSel.set(r.app_id, prev);
          }
        }
        evRowsSel.sort((a, b) => b.startMs - a.startMs);
        setWindowRows(evRowsSel);
        const totalMsSel = Array.from(accSel.values()).reduce((s, v) => s + v.durationMs, 0);
        const usageSel = Array.from(accSel.entries()).map(([appId, v]) => ({
          appId,
          appName: v.appName,
          durationMs: v.durationMs,
          percent: totalMsSel > 0 ? (v.durationMs / totalMsSel) * 100 : 0,
          color: colorForApp(appId),
        })).sort((a, b) => b.percent - a.percent);
        setUsages(usageSel);
      }

      // Note: do not update WindowUsageTable rows here; table is driven only by selection
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

  // Global Escape: close full image and clear selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullImage((cur) => {
          if (cur?.url) URL.revokeObjectURL(cur.url);
          return null;
        });
        clearSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelected]);

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

  // Rebuild AppUsage and WindowUsageTable when selection changes
  useEffect(() => {
    const ids = Array.from(selectedIds);
    const rows = rowsRef.current;
    if (!rows || rows.length === 0) { setWindowRows([]); setUsages([]); return; }
    const nowSec = Math.floor(Date.now() / 1000);
    if (ids.length === 0) {
      // Show everything when nothing is selected
      const evRowsAll: Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId: number }> = [];
      const accAll = new Map<number, { appName: string; durationMs: number }>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nextSec = rows[i + 1]?.created_at_sec ?? nowSec;
        const segStartMs = r.created_at_sec * 1000;
        const segEndMs = Math.min(nextSec, nowSec) * 1000;
        if (segEndMs > segStartMs) {
          const id = `${r.app_id}-${r.created_at_sec}-${r.window_title}`;
          evRowsAll.push({ id, title: r.window_title, startMs: segStartMs, endMs: segEndMs, durationMs: segEndMs - segStartMs, appId: r.app_id });
          const durMs = segEndMs - segStartMs;
          const prev = accAll.get(r.app_id) || { appName: r.app_name, durationMs: 0 };
          prev.durationMs += durMs;
          accAll.set(r.app_id, prev);
        }
      }
      evRowsAll.sort((a, b) => b.startMs - a.startMs);
      setWindowRows(evRowsAll);
      const totalMsAll = Array.from(accAll.values()).reduce((s, v) => s + v.durationMs, 0);
      const usageAll = Array.from(accAll.entries()).map(([appId, v]) => ({
        appId,
        appName: v.appName,
        durationMs: v.durationMs,
        percent: totalMsAll > 0 ? (v.durationMs / totalMsAll) * 100 : 0,
        color: colorForApp(appId),
      })).sort((a, b) => b.percent - a.percent);
      setUsages(usageAll);
      return;
    }
    // Selection present: build rows and app usage only for selected ids
    const evRowsSel: Array<{ id: string; title: string; startMs: number; endMs: number; durationMs: number; appId: number }> = [];
    const accSel = new Map<number, { appName: string; durationMs: number }>();
    for (const id of ids) {
      const idx = idToIndexRef.current.get(id);
      if (idx == null) continue;
      const r = rows[idx];
      const nextSec = rows[idx + 1]?.created_at_sec ?? nowSec;
      const segStartMs = r.created_at_sec * 1000;
      const segEndMs = Math.min(nextSec, nowSec) * 1000;
      if (segEndMs > segStartMs) {
        evRowsSel.push({ id, title: r.window_title, startMs: segStartMs, endMs: segEndMs, durationMs: segEndMs - segStartMs, appId: r.app_id });
        const durMs = segEndMs - segStartMs;
        const prev = accSel.get(r.app_id) || { appName: r.app_name, durationMs: 0 };
        prev.durationMs += durMs;
        accSel.set(r.app_id, prev);
      }
    }
    evRowsSel.sort((a, b) => b.startMs - a.startMs);
    setWindowRows(evRowsSel);
    const totalMsSel = Array.from(accSel.values()).reduce((s, v) => s + v.durationMs, 0);
    const usageSel = Array.from(accSel.entries()).map(([appId, v]) => ({
      appId,
      appName: v.appName,
      durationMs: v.durationMs,
      percent: totalMsSel > 0 ? (v.durationMs / totalMsSel) * 100 : 0,
      color: colorForApp(appId),
    })).sort((a, b) => b.percent - a.percent);
    setUsages(usageSel);
  }, [selectedIds]);

  return (
    <div className="bg-background text-foreground h-screen space-y-4 mx-auto px-4 py-4 overflow-hidden flex flex-col">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'timeline' | 'settings')} className="flex-1 flex flex-col">
        <TabsList className="grid w-[200px] grid-cols-2">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          <Timeline
            items={items}
            onViewportChange={onViewportChange}
            onSelectionChange={(range) => {
              if (!range) { clearSelected(); return; }
              const start = Math.min(range.startMs, range.endMs);
              const end = Math.max(range.startMs, range.endMs);
              if (start === end) {
                // simple click on timeline: select the event under that time, if any
                const t = start;
                const found = items.find(it => t >= it.start.getTime() && t <= it.end.getTime());
                if (found) setSelectedIds([found.id]); else clearSelected();
                return;
              }
              // selecting by dragging: choose events that overlap the selection (clamp selection to now)
              const nowMs = Date.now();
              const selStart = Math.min(start, nowMs);
              const selEnd = Math.min(end, nowMs);
              if (selEnd <= selStart) {
                // selection entirely in future -> treat as click at now
                const t = nowMs;
                const found = items.find(it => t >= it.start.getTime() && t <= it.end.getTime());
                if (found) setSelectedIds([found.id]); else clearSelected();
                return;
              }
              const ids = items.filter(it => {
                const a = it.start.getTime();
                const b = it.end.getTime();
                // overlap if max(start) < min(end)
                return Math.max(a, selStart) < Math.min(b, selEnd);
              }).map(it => it.id);
              setSelectedIds(ids);
            }}
            onOpenFullImage={handleOpenFullImage}
            selectedIds={selectedIds}
            hoverMagnify={hoverMagnifySetting}
          />

          {fullImage ? (
            <Card className="flex-1 overflow-auto bg-black/70 relative min-h-0">
              <CardContent className="p-0 relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => setFullImage((cur) => { if (cur?.url) URL.revokeObjectURL(cur.url); return null; })}
                  aria-label="Close full image"
                  title="Close (Esc)"
                >
                  Close
                </Button>
                <div className="p-4">
                  <img src={fullImage.url} alt="screenshot" className="block" />
                  {fullImage.createdAtSec && (
                    <div className="mt-2 text-xs text-muted-foreground">Captured: {new Date(fullImage.createdAtSec * 1000).toLocaleString()}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-1 gap-4 min-h-0 overflow-hidden" style={{ maxHeight: 'calc(100vh - 300px)' }}>
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
        </TabsContent>

        <TabsContent value="settings" className="flex-1 overflow-auto">
          <div className="space-y-4">
            <Card className="max-w-xl">
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize the look and feel of the application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="theme-select">Theme</Label>
                  <Select value={theme} onValueChange={(value: 'light' | 'dark' | 'dark-blue' | 'system') => setTheme(value)}>
                    <SelectTrigger id="theme-select" className="w-full">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="h-4 w-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="h-4 w-4" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="dark-blue">
                        <div className="flex items-center gap-2">
                          <Palette className="h-4 w-4" />
                          Dark Blue
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose your preferred theme or use system preference
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="max-w-xl">
              <CardHeader>
                <CardTitle>Display Settings</CardTitle>
                <CardDescription>Customize how the timeline is displayed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="hover-magnify"
                    checked={hoverMagnifySetting}
                    onCheckedChange={setHoverMagnifySetting}
                  />
                  <Label htmlFor="hover-magnify" className="text-sm text-foreground">
                    Hover magnify on timeline
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Magnify hovered item to make tiny items easier to see (visual only)
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
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
