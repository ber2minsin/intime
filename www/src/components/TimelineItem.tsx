import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

// Props shape for declarative child API (marker). Timeline uses this type to read child props.
export type TimelineItemProps = {
    id?: string;
    start: Date | string | number;
    end: Date | string | number;
    name: string;
    color?: string;
};

// Render props for the actual item DOM
type TimelineItemRenderProps = {
    left: number;
    width: number;
    name: string;
    colorBg: string;
    colorBorder: string;
    title?: string;
};

// Single public component: presentational with overflow-aware label selection.
// Also exported as Timeline.Item for the child API; those children are not directly rendered.
const TimelineItem: React.FC<TimelineItemRenderProps> = ({ left, width, name, colorBg, colorBorder, title }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [mode, setMode] = useState<"both" | "appOnly" | "none">("both");

    // Split name into app and window title if colon-space is present
    const { appText, titleText } = useMemo(() => {
        const idx = name.indexOf(": ");
        if (idx > -1) {
            return { appText: name.slice(0, idx), titleText: name.slice(idx + 2) };
        }
        return { appText: name, titleText: "" };
    }, [name]);

    // Reset mode whenever width or text changes so we re-evaluate from the most verbose
    useLayoutEffect(() => {
        setMode("both");
    }, [width, appText, titleText]);

    // After render, check overflow and reduce content if needed
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const over = el.scrollWidth > el.clientWidth + 1; // small tolerance
        if (over) {
            if (mode === "both") {
                setMode("appOnly");
            } else if (mode === "appOnly") {
                setMode("none");
            }
        }
    }, [mode, width, appText, titleText]);

    let content: React.ReactNode;
    if (mode === "none") content = null;
    else if (mode === "appOnly") content = <span className="truncate">{appText}</span>;
    else content = (
        <span className="truncate">
            <span className="font-medium">{appText}</span>
            {titleText ? <span className="opacity-90">: {titleText}</span> : null}
        </span>
    );

    return (
        <div
            ref={ref}
            className="absolute top-1 h-8 px-2 text-xs overflow-hidden whitespace-nowrap box-border flex items-center"
            style={{ left, width, background: colorBg, border: `1px solid ${colorBorder}` }}
            title={title}
        >
            {content}
        </div>
    );
};

export default TimelineItem;
