import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
        <Card className="h-full flex flex-col min-w-0 flex-1">
            <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="text-sm text-muted-foreground">Active windows</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0 min-w-0 min-h-0">
                <div className="overflow-x-auto">
                    <Table className="w-full">
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow className="border-border">
                                <TableHead
                                    className="text-foreground cursor-pointer font-medium w-[35%] sm:w-[30%] md:w-[35%] lg:w-[40%]"
                                    onClick={() => cycleSort('title')}
                                    title="Sort by title"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        Title <span className="text-xs opacity-70">{headerArrow('title')}</span>
                                    </span>
                                </TableHead>
                                <TableHead
                                    className="text-foreground cursor-pointer font-medium hidden sm:table-cell w-[35%] md:w-[30%] lg:w-[25%]"
                                    onClick={() => cycleSort('start')}
                                    title="Sort by start time"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        Start <span className="text-xs opacity-70">{headerArrow('start')}</span>
                                    </span>
                                </TableHead>
                                <TableHead
                                    className="text-foreground cursor-pointer font-medium hidden md:table-cell w-[25%] lg:w-[25%]"
                                    onClick={() => cycleSort('end')}
                                    title="Sort by end time"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        End <span className="text-xs opacity-70">{headerArrow('end')}</span>
                                    </span>
                                </TableHead>
                                <TableHead
                                    className="text-foreground cursor-pointer font-medium text-right w-[65%] sm:w-[35%] md:w-[10%]"
                                    onClick={() => cycleSort('duration')}
                                    title="Sort by duration"
                                >
                                    <span className="inline-flex items-center gap-1 justify-end w-full">
                                        Duration <span className="text-xs opacity-70">{headerArrow('duration')}</span>
                                    </span>
                                </TableHead>
                            </TableRow>
                            <TableRow className="border-border bg-muted/50">
                                <TableCell className="text-foreground font-semibold">Total</TableCell>
                                <TableCell className="text-muted-foreground hidden sm:table-cell"></TableCell>
                                <TableCell className="text-muted-foreground hidden md:table-cell"></TableCell>
                                <TableCell className="text-right font-mono font-semibold text-primary">
                                    {fmtDuration(totalDuration)}
                                </TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedRows.map((r) => {
                                const key = r.id;
                                const hasSel = !!selectedKeys && selectedKeys.size > 0;
                                const isSelected = !hasSel || selectedKeys!.has(key);
                                return (
                                    <TableRow
                                        key={r.id}
                                        className="border-border hover:bg-accent cursor-pointer transition-colors"
                                        style={{ opacity: isSelected ? 1 : 0.4 }}
                                        onClick={() => onSelectRow?.(hasSel && selectedKeys!.has(key) && selectedKeys!.size === 1 ? null : key)}
                                    >
                                        <TableCell className="text-foreground max-w-0" title={r.title}>
                                            <div className="truncate pr-2">{r.title}</div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                                            {fmtTime(r.startMs)}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell">
                                            {fmtTime(r.endMs)}
                                        </TableCell>
                                        <TableCell className="text-foreground text-right font-mono">
                                            {fmtDuration(r.durationMs)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {rows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                                        No window activity in the current range.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default WindowUsageTable;
