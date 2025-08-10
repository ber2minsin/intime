import Timeline from "./components/Timeline";
import TimelineItem from "./components/TimelineItem";

export default function App() {
  const now = Date.now();
  return (
    <Timeline>
      <TimelineItem
        start={new Date(now - 3 * 60 * 60 * 1000)}
        end={new Date(now - 90 * 60 * 1000)}
        name="Something"
      />
      <TimelineItem
        start={new Date(now - 2 * 60 * 60 * 1000)}
        end={new Date(now - 30 * 60 * 1000)}
        name="Something 2"
      />
      <TimelineItem
        start={new Date(now - 40 * 60 * 1000)}
        end={new Date(now + 60 * 60 * 1000)}
        name="Something 3"
      />
    </Timeline>
  );
}
