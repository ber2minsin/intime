import React from "react";

export type AppUsage = {
    appId: number;
    appName: string;
    durationMs: number;
    percent: number; // 0..100
    color?: string;
};

type Props = {
    usages: AppUsage[];
};

const AppUsageList: React.FC<Props> = ({ usages }) => {
    const total = usages.reduce((s, u) => s + u.durationMs, 0);
    return (
        <div className="bg-gray-900 border border-gray-800 rounded p-3 w-full max-w-xs min-w-0 shrink-0 h-full overflow-auto">
            <div className="mb-2 text-sm text-gray-400">Active time by app (excludes empty time)</div>
            <ul className="divide-y divide-gray-800 overflow-auto pr-1">
                {usages.map((u) => (
                    <li key={u.appId} className="py-2 flex items-center gap-3">
                        <div className="w-3 h-3 rounded-sm" style={{ background: u.color || "#888" }} />
                        <div className="flex-1">
                            <div className="text-sm text-gray-200">{u.appName}</div>
                            <div className="h-2 bg-gray-800 rounded overflow-hidden mt-1">
                                <div
                                    className="h-full bg-gray-200"
                                    style={{ width: `${u.percent.toFixed(2)}%`, background: u.color || "#ccc" }}
                                />
                            </div>
                        </div>
                        <div className="text-xs text-gray-400 min-w-[90px] text-right">
                            {u.percent.toFixed(1)}%
                        </div>
                    </li>
                ))}
            </ul>
            {total === 0 && (
                <div className="text-xs text-gray-500">No active time in the current window.</div>
            )}
        </div>
    );
};

export default AppUsageList;
