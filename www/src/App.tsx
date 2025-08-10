import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Timeline from "./components/Timeline";

type Row = { app_id: number; app_name: string; window_title: string; event_type: string; created_at_sec: number };

export default function App() {
  const [items, setItems] = useState<Array<{ id: string; start: Date; end: Date; name: string }>>([]);

  const onViewportChange = useCallback(async (startMs: number, endMs: number) => {
    try {
      const startMsInt = Math.floor(startMs);
      const endMsInt = Math.ceil(endMs);
      const rows = await invoke<Row[]>("fetch_window_events", { startMs: startMsInt, endMs: endMsInt, limit: 2000 });
      const mapped = rows.map((r: Row) => {
        const start = new Date(r.created_at_sec * 1000);
        const end = new Date(start.getTime() + 5 * 60 * 1000); // temp duration of 5 minutes
        const id = `${r.app_id}-${r.created_at_sec}-${r.window_title}`;
        const name = `${r.app_name}: ${r.window_title}`;
        return { id, start, end, name };
      });
      console.info("Fetched window events:", rows.length, { startMs: startMsInt, endMs: endMsInt });
      setItems(mapped);
    } catch (e) {
      console.error("fetch_window_events failed", e);
    }
  }, []);

  return <Timeline items={items} onViewportChange={onViewportChange} />;
}
