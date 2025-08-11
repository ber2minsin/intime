import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

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

// Memoized row component for better performance
const TableRowMemoized = React.memo<{
    row: WindowUsage;
    isSelected: boolean;
    onSelect: () => void;
}>(({ row, isSelected, onSelect }) => (
    <TableRow
        className="border-border hover:bg-accent cursor-pointer transition-colors"
        style={{ opacity: isSelected ? 1 : 0.4 }}
        onClick={onSelect}
    >
        <TableCell className="text-foreground max-w-0 w-[35%] sm:w-[30%] md:w-[35%] lg:w-[40%]" title={row.title}>
            <div className="truncate pr-2">{row.title}</div>
        </TableCell>
        <TableCell className="text-muted-foreground whitespace-nowrap hidden sm:table-cell w-[35%] md:w-[30%] lg:w-[25%]">
            {fmtTime(row.startMs)}
        </TableCell>
        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell w-[25%] lg:w-[25%]">
            {fmtTime(row.endMs)}
        </TableCell>
        <TableCell className="text-foreground text-right font-mono w-[65%] sm:w-[35%] md:w-[10%]">
            {fmtDuration(row.durationMs)}
        </TableCell>
    </TableRow>
));

const WindowUsageTable: React.FC<Props> = React.memo(({ rows, selectedKeys, onSelectRow }) => {
    // search state
    const [searchQuery, setSearchQuery] = React.useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState("");

    // Debounce search query for better performance
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // pagination state
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(50);

    // Reset to page 1 when search query changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery, rows.length]);

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

    // filter rows based on search query
    const filteredRows = React.useMemo(() => {
        if (!debouncedSearchQuery.trim()) return sortedByKey;
        const query = debouncedSearchQuery.toLowerCase().trim();
        return sortedByKey.filter(row =>
            row.title.toLowerCase().includes(query)
        );
    }, [sortedByKey, debouncedSearchQuery]);

    // move selected rows to the top; within groups, respect sort
    const sortedRows = React.useMemo(() => {
        const base = filteredRows;
        if (!selectedKeys || selectedKeys.size === 0) return base;
        const sel: WindowUsage[] = [];
        const rest: WindowUsage[] = [];
        for (const r of base) {
            if (selectedKeys.has(r.id)) sel.push(r); else rest.push(r);
        }
        return [...sel, ...rest];
    }, [filteredRows, selectedKeys]);

    // pagination logic
    const totalRows = sortedRows.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);
    const paginatedRows = React.useMemo(() => {
        return sortedRows.slice(startIndex, endIndex);
    }, [sortedRows, startIndex, endIndex]);

    // pagination controls
    const canGoPrevious = currentPage > 1;
    const canGoNext = currentPage < totalPages;

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const headerArrow = (key: 'title' | 'start' | 'end' | 'duration') => sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '';

    return (
        <Card className="h-full flex flex-col min-w-0 flex-1">
            <CardHeader className="pb-1 flex-shrink-0">
                <CardTitle className="text-xs text-muted-foreground mb-2">Active windows</CardTitle>
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search windows..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8"
                    />
                </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 min-w-0 min-h-0">
                <div className="flex-shrink-0 border-b border-border">
                    <Table className="w-full">
                        <TableHeader>
                            <TableRow className="border-border bg-background">
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
                    </Table>
                </div>
                <div className="flex-1 overflow-auto">
                    <Table className="w-full">
                        <TableHeader className="sr-only">
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead className="hidden sm:table-cell">Start</TableHead>
                                <TableHead className="hidden md:table-cell">End</TableHead>
                                <TableHead>Duration</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedRows.map((r) => {
                                const key = r.id;
                                const hasSel = !!selectedKeys && selectedKeys.size > 0;
                                const isSelected = !hasSel || selectedKeys!.has(key);
                                return (
                                    <TableRowMemoized
                                        key={r.id}
                                        row={r}
                                        isSelected={isSelected}
                                        onSelect={() => onSelectRow?.(hasSel && selectedKeys!.has(key) && selectedKeys!.size === 1 ? null : key)}
                                    />
                                );
                            })}
                            {rows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                                        No window activity in the current range.
                                    </TableCell>
                                </TableRow>
                            )}
                            {rows.length > 0 && filteredRows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                                        No windows match your search.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>
                                Showing {startIndex + 1} to {endIndex} of {totalRows} {totalRows === 1 ? 'window' : 'windows'}
                            </span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    const newSize = parseInt(e.target.value);
                                    setPageSize(newSize);
                                    setCurrentPage(1);
                                }}
                                className="ml-2 px-2 py-1 text-xs border border-border rounded bg-background"
                            >
                                <option value={25}>25 per page</option>
                                <option value={50}>50 per page</option>
                                <option value={100}>100 per page</option>
                                <option value={200}>200 per page</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => goToPage(1)}
                                disabled={!canGoPrevious}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={!canGoPrevious}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>

                            <div className="flex items-center gap-1 mx-2">
                                <span className="text-sm text-muted-foreground">Page</span>
                                <input
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={currentPage}
                                    onChange={(e) => {
                                        const page = parseInt(e.target.value);
                                        if (!isNaN(page)) {
                                            goToPage(page);
                                        }
                                    }}
                                    className="w-16 px-2 py-1 text-sm text-center border border-border rounded bg-background"
                                />
                                <span className="text-sm text-muted-foreground">of {totalPages}</span>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={!canGoNext}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => goToPage(totalPages)}
                                disabled={!canGoNext}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

export default WindowUsageTable;
