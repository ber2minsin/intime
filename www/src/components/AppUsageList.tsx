import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type AppUsage = {
    appId: number;
    appName: string;
    durationMs: number;
    percent: number; // 0..100
    color?: string;
};

type Props = {
    usages: AppUsage[];
    selectedAppIds?: Set<number>;
    onSelectApp?: (appId: number | null) => void;
};

const AppUsageList: React.FC<Props> = ({ usages, selectedAppIds, onSelectApp }) => {
    const total = usages.reduce((s, u) => s + u.durationMs, 0);
    // Selected apps to the top while preserving original order
    const ordered = (() => {
        if (!selectedAppIds || selectedAppIds.size === 0) return usages;
        const sel: typeof usages = [];
        const rest: typeof usages = [];
        for (const u of usages) {
            if (selectedAppIds.has(u.appId)) sel.push(u); else rest.push(u);
        }
        return [...sel, ...rest];
    })();

    return (
        <Card className="w-full max-w-xs min-w-0 shrink-0 h-full flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="text-sm text-muted-foreground">Active time by app</CardTitle>
                <CardDescription className="text-xs">Excludes empty time</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0 px-6 pb-6 min-h-0">
                <ul className="space-y-3">
                    {ordered.map((u) => {
                        const hasSel = !!selectedAppIds && selectedAppIds.size > 0;
                        const isSelected = !hasSel || selectedAppIds!.has(u.appId);
                        return (
                            <li
                                key={u.appId}
                                className="flex items-center gap-3 cursor-pointer rounded p-2 hover:bg-accent transition-colors"
                                style={{ opacity: isSelected ? 1 : 0.35 }}
                                onClick={() => onSelectApp?.(hasSel && selectedAppIds!.has(u.appId) && selectedAppIds!.size === 1 ? null : u.appId)}
                            >
                                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: u.color || "#888" }} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-foreground truncate">{u.appName}</div>
                                    <div className="mt-1">
                                        <div className="h-2 bg-muted rounded overflow-hidden">
                                            <div
                                                className="h-full transition-all duration-200"
                                                style={{
                                                    width: `${u.percent.toFixed(2)}%`,
                                                    background: u.color || "#ccc"
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground min-w-[60px] text-right flex-shrink-0">
                                    {u.percent.toFixed(1)}%
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {total === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">No active time in the current window.</div>
                )}
            </CardContent>
        </Card>
    );
};

export default AppUsageList;
