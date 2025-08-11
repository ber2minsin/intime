import React from "react";

export type WindowUsage = {
    id: string; // unique event id
    title: string;
    startMs: number; // earliest seen within viewport
    endMs: number;   // latest seen within viewport
    durationMs: number; // total active time within viewport for this title
    appId?: number;
};

type Props = {
    rows: WindowUsage[];
    selectedKeys?: Set<string>; // selected event ids
    onSelectRow?: (id: string | null) => void;
};

function fmtTime(ms: number) {
    if (!isFinite(ms)) return "";
    return new Date(ms).toLocaleString();
}

function fmtDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600).toString().padStart(2, "0");
    const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

const WindowUsageTable: React.FC<Props> = ({ rows, selectedKeys, onSelectRow }) => {
    const TITLE_W = 260;
    const START_W = 160;
    const END_W = 160;
    const DUR_W = 96;

    // total should reflect only the active selection when present; otherwise sum all rows
    const totalDuration = React.useMemo(() => {
        if (selectedKeys && selectedKeys.size > 0) {
            return rows.reduce((acc, r) => acc + (selectedKeys.has(r.id) ? (r.durationMs || 0) : 0), 0);
        }
        return rows.reduce((acc, r) => acc + (r.durationMs || 0), 0);
    }, [rows, selectedKeys]);

    // sorting
    const [sort, setSort] = React.useState<{ key: 'title' | 'start' | 'end' | 'duration' | null; dir: 'asc' | 'desc'; }>({ key: null, dir: 'asc' });

    const cycleSort = (key: 'title' | 'start' | 'end' | 'duration') => {
        setSort((prev) => {
            if (prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return { key: null, dir: 'asc' }; // third click resets to default order
        });
    };

    const sortedByKey = React.useMemo(() => {
        if (!sort.key) return rows;
        const dir = sort.dir === 'asc' ? 1 : -1;
        const withIdx = rows.map((r, i) => ({ r, i }));
        withIdx.sort((a, b) => {
            let cmp = 0;
            switch (sort.key) {
                case 'title': {
                    const aa = (a.r.title || '').toLowerCase();
                    const bb = (b.r.title || '').toLowerCase();
                    cmp = aa < bb ? -1 : aa > bb ? 1 : 0;
                    break;
                }
                case 'start': {
                    cmp = (a.r.startMs || 0) - (b.r.startMs || 0);
                    break;
                }
                case 'end': {
                    cmp = (a.r.endMs || 0) - (b.r.endMs || 0);
                    break;
                }
                case 'duration': {
                    cmp = (a.r.durationMs || 0) - (b.r.durationMs || 0);
                    break;
                }
            }
            if (cmp === 0) cmp = a.i - b.i; // stable
            return cmp * dir;
        });
        return withIdx.map((x) => x.r);
    }, [rows, sort]);

    // move selected rows to the top; within groups, respect sort
    const sortedRows = React.useMemo(() => {
        const base = sortedByKey;
        if (!selectedKeys || selectedKeys.size === 0) return base;
        const sel: WindowUsage[] = [];
        const rest: WindowUsage[] = [];
        for (const r of base) {
            if (selectedKeys.has(r.id)) sel.push(r); else rest.push(r);
        }
        return [...sel, ...rest];
    }, [sortedByKey, selectedKeys]);

    const headerArrow = (key: 'title' | 'start' | 'end' | 'duration') => sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '';

    return (
        <div className="bg-gray-900 border border-gray-800 rounded h-full overflow-auto">
            <div className="px-3 py-2 text-sm text-gray-400">Active windows</div>
            <div className="overflow-auto">
                <table className="w-full table-fixed text-sm">
                    <colgroup>
                        <col style={{ width: `${TITLE_W}px` }} />
                        <col style={{ width: `${START_W}px` }} />
                        <col style={{ width: `${END_W}px` }} />
                        <col style={{ width: `${DUR_W}px` }} />
                    </colgroup>
                    <thead className="sticky top-0 bg-gray-900 z-10">
                        <tr className="text-gray-300 border-b border-gray-800 select-none">
                            <th
                                className="text-left font-medium px-3 py-2 cursor-pointer"
                                onClick={() => cycleSort('title')}
                                aria-sort={sort.key === 'title' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                title="Sort by title"
                            >
                                <span className="inline-flex items-center gap-1">Title <span className="text-xs opacity-70">{headerArrow('title')}</span></span>
                            </th>
                            <th
                                className="text-left font-medium px-3 py-2 cursor-pointer"
                                onClick={() => cycleSort('start')}
                                aria-sort={sort.key === 'start' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                title="Sort by start time"
                            >
                                <span className="inline-flex items-center gap-1">Start <span className="text-xs opacity-70">{headerArrow('start')}</span></span>
                            </th>
                            <th
                                className="text-left font-medium px-3 py-2 cursor-pointer"
                                onClick={() => cycleSort('end')}
                                aria-sort={sort.key === 'end' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                title="Sort by end time"
                            >
                                <span className="inline-flex items-center gap-1">End <span className="text-xs opacity-70">{headerArrow('end')}</span></span>
                            </th>
                            <th
                                className="text-right font-medium px-3 py-2 cursor-pointer"
                                onClick={() => cycleSort('duration')}
                                aria-sort={sort.key === 'duration' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                title="Sort by duration"
                            >
                                <span className="inline-flex items-center gap-1 justify-end w-full">Duration <span className="text-xs opacity-70">{headerArrow('duration')}</span></span>
                            </th>
                        </tr>
                        <tr className="border-b border-gray-700 bg-gray-800/40">
                            <th className="text-left font-semibold px-3 py-2 text-gray-100">Total</th>
                            <th className="px-3 py-2 text-gray-400"></th>
                            <th className="px-3 py-2 text-gray-400"></th>
                            <th className="px-3 py-2 text-right font-mono font-semibold text-amber-300">{fmtDuration(totalDuration)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((r) => {
                            const key = r.id;
                            const hasSel = !!selectedKeys && selectedKeys.size > 0;
                            const isSelected = !hasSel || selectedKeys!.has(key);
                            return (
                                <tr
                                    key={r.id}
                                    className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer"
                                    style={{ opacity: isSelected ? 1 : 0.4 }}
                                    onClick={() => onSelectRow?.(hasSel && selectedKeys!.has(key) && selectedKeys!.size === 1 ? null : key)}
                                >
                                    <td className="px-3 py-2 text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis" title={r.title}>{r.title}</td>
                                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmtTime(r.startMs)}</td>
                                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmtTime(r.endMs)}</td>
                                    <td className="px-3 py-2 text-gray-200 text-right font-mono">{fmtDuration(r.durationMs)}</td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-500">No window activity in the current range.</td>
                            </tr>
                        )}
                    </tbody>
                    {/* total row moved to the top (header) */}
                </table>
            </div>
        </div>
    );
};

export default WindowUsageTable;
