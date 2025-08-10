// Timeline (single-lane)
import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import TimelineItem, { type TimelineItemProps } from "./TimelineItem";

/** Public API:
 * - Use props.items OR declarative children with <Timeline.Item start end name />
 */
type ZoomLabel = "minutes" | "hours" | "days" | "months";
const TICK_WIDTH = 100; // px per tick unit
const MIN_MS_PER_PX = 5; // clamp lower bound
const MAX_MS_PER_PX = 90 * 24 * 60 * 60_000; // clamp upper bound (~90 days per px)
// Allowed tick steps (in minutes). Includes minute, hour, day, week, half-month, ~month
const ALLOWED_STEPS_MIN = [
    1, 2, 5, 10, 15, 30,
    60, 120, 180, 240, 360, 720,
    1440, 2880, 4320, 10080, 20160, 43200
] as const;

type ItemInput = { id?: string; start: Date | string | number; end: Date | string | number; name?: string; label?: string; color?: string };
type TimelineProps = { items?: ItemInput[]; children?: React.ReactNode; onViewportChange?: (startMs: number, endMs: number) => void };

const Timeline: React.FC<TimelineProps> = ({ items = [], children, onViewportChange }) => {

    // Smooth zoom: ms per pixel, initialize around "hours" (1h per 100px)
    const [msPerPixel, setMsPerPixel] = useState<number>(() => (60 * 60_000) / TICK_WIDTH);
    // current time ticker (for moving now marker and glue)
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    // glue right edge of viewport to now
    const [glueNow, setGlueNow] = useState<boolean>(false);
    // Choose a tick step (in minutes) close to current msPerPixel
    const desiredMinutes = (msPerPixel * TICK_WIDTH) / 60_000;
    const stepMinutes: number = ALLOWED_STEPS_MIN.reduce((best, cur) => {
        return Math.abs(cur - desiredMinutes) < Math.abs(best - desiredMinutes) ? cur : best;
    }, ALLOWED_STEPS_MIN[0]);
    const zoomLabel: ZoomLabel = stepMinutes >= 43200 ? "months" : stepMinutes >= 1440 ? "days" : stepMinutes >= 60 ? "hours" : "minutes";

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [hoverX, setHoverX] = useState<number | null>(null);
    const [hoverY, setHoverY] = useState<number | null>(null);
    const [hoverMs, setHoverMs] = useState<number | null>(null);
    const [hoverImg, setHoverImg] = useState<string | null>(null);
    const hoverImgUrlRef = useRef<string | null>(null);
    const hoverFetchRef = useRef<number | null>(null);
    const [fetchDebug, setFetchDebug] = useState<{ status: 'idle' | 'pending' | 'success' | 'error'; size?: number; createdAtSec?: number }>({ status: 'idle' });
    const [width, setWidth] = useState(1200);

    // leftmost visible time in ms
    const [visibleStartMs, setVisibleStartMs] = useState(() => Date.now() - (600 * 60_000));

    // dragging state
    type DragState = { mode: "pan" | null; startX: number; startVisibleStartMs: number };
    const dragState = useRef<DragState>({ mode: null, startX: 0, startVisibleStartMs: 0 });

    // msPerPixel already in state

    // update container width
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        function update() {
            setWidth(Math.max(200, Math.floor(el!.getBoundingClientRect().width)));
        }
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // helper: convert ms -> x px relative to visibleStart
    const timeToX = (ms: number) => (ms - visibleStartMs) / msPerPixel;

    // convert x px -> ms
    const xToTime = (x: number) => visibleStartMs + x * msPerPixel;

    // zoom helper centered at a given x coordinate within the container
    const zoomAt = (x: number, factor: number) => {
        const timeAtX = xToTime(x);
        const next = Math.max(MIN_MS_PER_PX, Math.min(msPerPixel * factor, MAX_MS_PER_PX));
        const newVisibleStart = timeAtX - x * next;
        setMsPerPixel(next);
        setVisibleStartMs(newVisibleStart);
    };

    // pan helper: positive dx pans to earlier times (left), negative to later (right)
    const panByPx = (dx: number) => {
        if (glueNow) return; // disable pan when glued to now
        setVisibleStartMs((s) => s - dx * msPerPixel);
    };

    // helper: zoom by factor, respecting glue-to-now (anchor right edge)
    const zoomBy = (factor: number, aroundX: number = width / 2) => {
        const next = Math.max(MIN_MS_PER_PX, Math.min(msPerPixel * factor, MAX_MS_PER_PX));
        if (glueNow) {
            setMsPerPixel(next);
            setVisibleStartMs(nowMs - width * next);
        } else {
            zoomAt(aroundX, factor);
        }
    };

    // jump to "now" by centering current time in the viewport
    const goToNow = () => {
        if (glueNow) {
            setVisibleStartMs(nowMs - width * msPerPixel);
        } else {
            const newStart = nowMs - (width * msPerPixel) / 2;
            setVisibleStartMs(newStart);
        }
    };

    // when glued, continuously anchor right edge to now
    useEffect(() => {
        if (!glueNow) return;
        setVisibleStartMs(nowMs - width * msPerPixel);
    }, [glueNow, nowMs, msPerPixel, width]);

    // notify viewport changes (debounced)
    useEffect(() => {
        if (!onViewportChange) return;
        const start = visibleStartMs;
        const end = visibleStartMs + width * msPerPixel;
        const t = setTimeout(() => onViewportChange(start, end), 120);
        return () => clearTimeout(t);
    }, [onViewportChange, visibleStartMs, msPerPixel, width]);

    // wheel: ctrl+wheel => zoom; wheel => pan horizontally
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            // pointer position inside container
            const rect = el.getBoundingClientRect();
            const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));

            if (e.ctrlKey) {
                // smooth zoom around mouseX
                const factor = Math.exp(e.deltaY * 0.0012); // sensitivity
                zoomBy(factor, mouseX);
            } else {
                // horizontal pan: deltaY -> move timeline left/right
                // deltaY positive => move towards later times (shift visibleStart forward)
                if (glueNow) return; // ignore pan when glued
                const deltaMs = e.deltaY * msPerPixel * 1.5; // 1.5 speed factor
                setVisibleStartMs((s) => s + deltaMs);
            }
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [msPerPixel, xToTime]); // note: xToTime closes visibleStartMs but it's fine (recreated when visibleStartMs changes)

    // hover: track x and debounce screenshot fetch
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onMove = (e: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            setHoverX(x);
            const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
            setHoverY(y);
            setHoverMs(xToTime(x));
            console.debug('[Timeline] move', { x, y, ms: xToTime(x) });
        };
        const onLeave = () => {
            setHoverX(null);
            setHoverY(null);
            setHoverMs(null);
            if (hoverImgUrlRef.current) {
                URL.revokeObjectURL(hoverImgUrlRef.current);
                hoverImgUrlRef.current = null;
            }
            setHoverImg(null);
            setFetchDebug({ status: 'idle' });
            console.debug('[Timeline] leave');
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        return () => {
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerleave", onLeave);
        };
    }, [xToTime]);

    useEffect(() => {
        // debounce fetch to avoid spamming on every pixel movement
        if (hoverMs == null) return;
        if (hoverFetchRef.current) window.clearTimeout(hoverFetchRef.current);
        hoverFetchRef.current = window.setTimeout(async () => {
            try {
                setFetchDebug({ status: 'pending' });
                console.debug('[Timeline] invoke get_nearest_screenshot', { ts_ms: Math.floor(hoverMs) });
                // appId intentionally null for global nearest; can be enhanced to infer from hovered item
                const res: any = await invoke("get_nearest_screenshot", { tsMs: Math.floor(hoverMs), appId: null });
                if (res && res.png) {
                    // res.png is expected to be a Uint8Array or array of bytes
                    const bytes = res.png instanceof Uint8Array ? res.png : new Uint8Array(res.png);
                    const blob = new Blob([bytes], { type: "image/png" });
                    const url = URL.createObjectURL(blob);
                    if (hoverImgUrlRef.current) URL.revokeObjectURL(hoverImgUrlRef.current);
                    hoverImgUrlRef.current = url;
                    setHoverImg(url);
                    setFetchDebug({ status: 'success', size: bytes.length, createdAtSec: res.created_at_sec });
                    console.debug('[Timeline] screenshot ok', { size: bytes.length, created_at_sec: res.created_at_sec });
                } else {
                    setHoverImg(null);
                    setFetchDebug({ status: 'success', size: 0, createdAtSec: undefined });
                    console.debug('[Timeline] screenshot empty');
                }
            } catch (err) {
                setHoverImg(null);
                setFetchDebug({ status: 'error' });
                console.error('[Timeline] screenshot error', err);
            }
        }, 200);
        return () => {
            if (hoverFetchRef.current) window.clearTimeout(hoverFetchRef.current);
        };
    }, [hoverMs]);

    // cleanup object URL on unmount
    useEffect(() => {
        return () => {
            if (hoverImgUrlRef.current) URL.revokeObjectURL(hoverImgUrlRef.current);
        };
    }, []);

    // keyboard shortcut: Space => go to now
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" || e.key === " ") {
                e.preventDefault();
                if (glueNow) {
                    setVisibleStartMs(nowMs - width * msPerPixel);
                } else {
                    const newStart = nowMs - (width * msPerPixel) / 2;
                    setVisibleStartMs(newStart);
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [msPerPixel, width, glueNow, nowMs]);


    // pointer handlers for pan only
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onPointerDown = (e: PointerEvent) => {
            // only left button (primary)
            if (e.button !== 0) return;
            if (glueNow) return; // disable drag when glued
            el.setPointerCapture(e.pointerId);
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            dragState.current.mode = "pan";
            dragState.current.startX = x;
            dragState.current.startVisibleStartMs = visibleStartMs;
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!dragState.current.mode) return;
            if (glueNow) return; // do not pan while glued
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const dx = x - dragState.current.startX;
            // dx positive means we moved pointer right -> pan earlier times (visibleStart decreases)
            const newVisible = dragState.current.startVisibleStartMs - dx * msPerPixel;
            setVisibleStartMs(newVisible);
        };

        const onPointerUp = (e: PointerEvent) => {
            const mode = dragState.current.mode;
            if (!mode) return;
            dragState.current.mode = null;
            el.releasePointerCapture(e.pointerId);
        };

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointermove", onPointerMove);
        el.addEventListener("pointerup", onPointerUp);
        el.addEventListener("pointercancel", onPointerUp);

        return () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerUp);
        };
    }, [visibleStartMs, msPerPixel, glueNow]);

    // collect items from children <Timeline.Item />
    const childItems: ItemInput[] = React.Children.toArray(children).flatMap((child) => {
        if (React.isValidElement(child) && child.type === TimelineItem) {
            const { id, start, end, name, color } = child.props as TimelineItemProps;
            return [{ id, start, end, name, color }];
        }
        return [];
    });

    type NormalizedItem = { id: string; start: Date; end: Date; name: string; color?: string };
    const itemList: NormalizedItem[] = [...items, ...childItems]
        .map((it, idx) => {
            const toDate = (v: Date | string | number) => v instanceof Date ? v : new Date(v);
            const name = (it.name ?? it.label ?? "").toString();
            const id = it.id ?? `${name || "item"}-${idx}`;
            const color = it.color;
            return { id, start: toDate(it.start), end: toDate(it.end), name, color };
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    // assign distinct colors if missing (HSL around the wheel)
    const colorForIndex = (i: number) => {
        const hue = Math.floor((i * 137.508) % 360); // golden angle
        const base = `hsl(${hue} 70% 50%)`;
        const border = `hsl(${hue} 70% 40%)`;
        const bg = `linear-gradient(90deg, hsl(${hue} 85% 55% / 0.9), hsl(${hue} 85% 70% / 0.6))`;
        return { base, border, bg };
    };

    // compute ticks that cover visible area plus buffer
    const bufferPx = width; // one screen on each side
    const rangeStartMs = visibleStartMs - bufferPx * msPerPixel;
    const rangeEndMs = visibleStartMs + (width + bufferPx) * msPerPixel;

    type Tick = { ms: number; nextMs: number; date: Date };
    let ticks: Tick[] = [];

    if (zoomLabel === "months") {
        // calendar-aligned month ticks
        const start = new Date(rangeStartMs);
        const anchor = new Date(start.getFullYear(), start.getMonth(), 1, 0, 0, 0, 0);
        let cur = anchor;
        while (cur.getTime() < rangeEndMs + 1) {
            const thisMs = cur.getTime();
            const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 0, 0, 0, 0);
            const nextMs = next.getTime();
            if (nextMs >= rangeStartMs - 1) {
                ticks.push({ ms: thisMs, nextMs, date: new Date(thisMs) });
            }
            cur = next;
        }
    } else if (zoomLabel === "days") {
        // calendar-aligned day ticks (handles DST via date math)
        const start = new Date(rangeStartMs);
        const anchor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
        let cur = anchor;
        while (cur.getTime() < rangeEndMs + 1) {
            const thisMs = cur.getTime();
            const next = new Date(cur);
            next.setDate(cur.getDate() + 1);
            const nextMs = next.getTime();
            if (nextMs >= rangeStartMs - 1) {
                ticks.push({ ms: thisMs, nextMs, date: new Date(thisMs) });
            }
            cur = next;
        }
    } else {
        // uniform minute/hour ticks
        const timePerTickMs = stepMinutes * 60_000;
        const firstTickIdx = Math.floor(rangeStartMs / timePerTickMs);
        const lastTickIdx = Math.ceil(rangeEndMs / timePerTickMs);
        const totalTicks = Math.max(0, lastTickIdx - firstTickIdx + 1);
        ticks = new Array(totalTicks).fill(0).map((_, i) => {
            const ms = (firstTickIdx + i) * timePerTickMs;
            const nextMs = ms + timePerTickMs;
            return { ms, nextMs, date: new Date(ms) };
        });
    }

    // choose minor subdivision count based on pixel width per major tick
    const widthForTick = (t: Tick) => (t.nextMs - t.ms) / msPerPixel;
    const getMinorFractions = (w: number) => {
        if (w >= 160) return [0.25, 0.5, 0.75];
        if (w >= 100) return [0.5];
        if (w >= 60) return [0.5];
        return [] as number[];
    };

    return (
        <div>
            <div
                ref={containerRef}
                className="relative h-40 bg-gray-900 border border-gray-800 rounded overflow-hidden select-none"
                style={{ userSelect: "none" }}
            >
                {/* time labels + vertical lines */}
                <div className="absolute top-0 left-0 right-0 h-8 overflow-hidden">
                    {ticks.map((t) => (
                        <div
                            key={t.ms}
                            className="absolute top-0 h-8 border-r border-gray-700 px-2 flex items-center justify-center"
                            style={{ left: `${timeToX(t.ms)}px`, width: `${Math.max(1, widthForTick(t))}px` }}
                        >
                            <div className="text-xs text-gray-400">
                                {zoomLabel === "months"
                                    ? t.date.toLocaleString(undefined, { month: "short", year: "numeric" })
                                    : zoomLabel === "days"
                                        ? t.date.toLocaleDateString()
                                        : t.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* grid background (vertical lines) */}
                <div className="absolute top-8 left-0 right-0 bottom-0" style={{ overflow: "hidden" }}>
                    {/* vertical columns */}
                    <div className="absolute top-0 left-0 right-0 bottom-0">
                        {ticks.map((t) => (
                            <React.Fragment key={t.ms}>
                                {/* major line */}
                                <div
                                    className="absolute top-0 bottom-0 border-r border-gray-800"
                                    style={{ left: `${timeToX(t.ms)}px` }}
                                />
                                {/* minor lines */}
                                {getMinorFractions(widthForTick(t)).map((f, i) => (
                                    <div
                                        key={`${t.ms}-m-${i}`}
                                        className="absolute top-0 bottom-0 border-r border-gray-800/40"
                                        style={{ left: `${timeToX(t.ms + (t.nextMs - t.ms) * f)}px` }}
                                    />
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                    {/* single lane items */}
                    <div className="relative h-full" onPointerMove={(e) => {
                        const el = containerRef.current;
                        if (!el) return;
                        const rect = el.getBoundingClientRect();
                        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                        setHoverX(x);
                        setHoverY(y);
                        setHoverMs(xToTime(x));
                    }} onPointerLeave={() => {
                        setHoverX(null);
                        setHoverY(null);
                        setHoverMs(null);
                        if (hoverImgUrlRef.current) { URL.revokeObjectURL(hoverImgUrlRef.current); hoverImgUrlRef.current = null; }
                        setHoverImg(null);
                    }}>
                        {itemList.map((it, idx) => {
                            const left = timeToX(it.start.getTime());
                            const nowX = timeToX(nowMs);
                            const endMs = Math.min(it.end.getTime(), nowMs);
                            const endX = timeToX(endMs);
                            const right = Math.min(endX, nowX - 0.5); // clamp to now, subtract epsilon to avoid overlap
                            const widthPx = Math.max(0, right - left);
                            const col = it.color ? { bg: it.color, border: it.color } : colorForIndex(idx);
                            return (
                                <div
                                    key={it.id}
                                    className="absolute top-1 h-8 box-border overflow-hidden"
                                    style={{
                                        left: `${left}px`,
                                        width: `${widthPx}px`,
                                        background: col.bg,
                                        border: `1px solid ${col.border}`
                                    }}
                                    title={`${it.name} — ${it.start.toLocaleString()} → ${it.end.toLocaleString()}`}
                                >
                                    {it.name}
                                </div>
                            );
                        })}
                    </div>
                </div>
                {/* now marker over everything, spanning labels + grid */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden>
                    <div
                        className="absolute top-0 bottom-0 border-r-2 border-red-500/80 z-20"
                        style={{ left: `${timeToX(nowMs)}px` }}
                    />
                    {hoverX != null && (
                        <div
                            className="absolute top-0 bottom-0 border-r border-cyan-400/70 z-20"
                            style={{ left: `${hoverX}px` }}
                        />
                    )}
                    {hoverX != null && hoverY != null && hoverImg && (
                        <div
                            className="absolute z-30"
                            style={{
                                left: Math.max(8, Math.min(hoverX + 12, width - 160)),
                                top: Math.max(8, Math.min(hoverY + 12, 160)),
                            }}
                        >
                            <div className="rounded border border-gray-700 bg-gray-900/95 shadow-lg p-1">
                                <img src={hoverImg} alt="preview" className="max-w-[140px] max-h-[100px] object-contain" />
                            </div>
                        </div>
                    )}
                    {/* debug badge */}
                    <div className="absolute top-1 right-1 z-20 text-[10px] text-gray-300 bg-gray-900/80 border border-gray-700 rounded px-1 py-0.5">
                        {fetchDebug.status}
                        {fetchDebug.status === 'success' && (
                            <span className="ml-1 text-gray-400">{fetchDebug.size || 0}B{fetchDebug.createdAtSec ? ` @${fetchDebug.createdAtSec}` : ''}</span>
                        )}
                    </div>
                </div>
            </div>
            {/* end hover preview */}

            {/* controls below timeline: pan (left) and zoom (right) */}
            <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => panByPx(width * 0.5)}
                        className="h-8 w-8 rounded-md bg-gray-800/90 text-gray-100 border border-gray-700 hover:bg-gray-700 active:scale-[0.98]"
                        title="Scroll left"
                        aria-label="Scroll left"
                    >
                        {"<"}
                    </button>
                    <button
                        type="button"
                        onClick={() => panByPx(-width * 0.5)}
                        className="h-8 w-8 rounded-md bg-gray-800/90 text-gray-100 border border-gray-700 hover:bg-gray-700 active:scale-[0.98]"
                        title="Scroll right"
                        aria-label="Scroll right"
                    >
                        {">"}
                    </button>
                    <button
                        type="button"
                        onClick={goToNow}
                        className="h-8 px-2 rounded-md bg-gray-800/90 text-gray-100 border border-gray-700 hover:bg-gray-700 active:scale-[0.98]"
                        title="Go to now (Space)"
                        aria-label="Go to now"
                    >
                        Now
                    </button>
                    <label className="ml-2 inline-flex items-center gap-2 text-sm text-gray-300 select-none">
                        <input
                            type="checkbox"
                            className="accent-red-500"
                            checked={glueNow}
                            onChange={(e) => setGlueNow(e.target.checked)}
                        />
                        Right edge glued to now

                    </label>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => zoomBy(0.8, width / 2)}
                        className="h-8 w-8 rounded-md bg-gray-800/90 text-gray-100 border border-gray-700 hover:bg-gray-700 active:scale-[0.98]"
                        title="Zoom in"
                        aria-label="Zoom in"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        onClick={() => zoomBy(1.25, width / 2)}
                        className="h-8 w-8 rounded-md bg-gray-800/90 text-gray-100 border border-gray-700 hover:bg-gray-700 active:scale-[0.98]"
                        title="Zoom out"
                        aria-label="Zoom out"
                    >
                        −
                    </button>
                </div>
            </div>
        </div>
    );
};

(Timeline as any).Item = TimelineItem;

export default Timeline;
