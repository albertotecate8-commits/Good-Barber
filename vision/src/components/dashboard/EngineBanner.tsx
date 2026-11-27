import { describeEngine, type EngineStatus } from "@/lib/domain/indicators";
import { IconCpu } from "../ui/icons";

export function EngineBanner({ engine, now }: { engine: EngineStatus; now: Date }) {
  const tone = engine.kind === "online" ? "success" : engine.kind === "offline" ? "warning" : "neutral";
  return (
    <div className={`engine engine-${tone}`}>
      <IconCpu size={18} />
      <span>{describeEngine(engine, now)}</span>
    </div>
  );
}
