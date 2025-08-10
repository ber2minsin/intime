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

    const totalDuration = rows.reduce((acc, r) => acc + (r.durationMs || 0), 0);

    // move selected row to the top while preserving others order
    const sortedRows = (() => {
        if (!selectedKeys || selectedKeys.size === 0) return rows;
        const sel: WindowUsage[] = [];
        const rest: WindowUsage[] = [];
        for (const r of rows) {
            const key = `${r.appId ?? 0}::${r.title}`;
            if (selectedKeys.has(key)) sel.push(r); else rest.push(r);
        }
        return [...sel, ...rest];
    })();

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
                        <tr className="text-gray-300 border-b border-gray-800">
                            <th className="text-left font-medium px-3 py-2">Title</th>
                            <th className="text-left font-medium px-3 py-2">Start</th>
                            <th className="text-left font-medium px-3 py-2">End</th>
                            <th className="text-right font-medium px-3 py-2">Duration</th>
                        </tr>
                        <tr className="border-b border-gray-700 bg-gray-800/40">
                            <th className="text-left font-semibold px-3 py-2 text-gray-100">Total</th>
                            <th className="px-3 py-2 text-gray-400"></th>
                            <th className="px-3 py-2 text-gray-400"></th>
                            <th className="px-3 py-2 text-right font-mono font-semibold text-amber-300">{fmtDuration(totalDuration)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((r, i) => {
                            const key = r.id;
                            const hasSel = !!selectedKeys && selectedKeys.size > 0;
                            const isSelected = !hasSel || selectedKeys!.has(key);
                            return (
                                <tr
                                    key={`${r.title}-${i}`}
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
