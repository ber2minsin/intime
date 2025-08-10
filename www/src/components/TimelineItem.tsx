import React from "react";

export type TimelineItemProps = {
    id?: string;
    start: Date | string | number;
    end: Date | string | number;
    name: string;
    color?: string;
};

// Marker component used only for declarative API; Timeline reads its props.
export const TimelineItem: React.FC<TimelineItemProps> = () => null;

export default TimelineItem;
