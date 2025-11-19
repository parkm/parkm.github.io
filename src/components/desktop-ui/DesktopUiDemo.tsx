import { QuadDock } from "./Dock";

export function DesktopUiDemo() {
  return (
    <div className="w-full h-screen flex flex-col">
      <div>menu bar</div>
      <div className="flex-1">
        <QuadDock
          top={<div>top</div>}
          bottom={<div>bottom</div>}
          left={<div>left</div>}
          right={<div>right</div>}
          center={<div>main workspace</div>}
        />
      </div>
    </div>
  );
}
