import { QuadDock } from "./Dock";
import {
  Menubar,
  MenubarTrigger,
  MenubarMenu,
  MenubarContent,
  MenubarItem,
  MenubarShortcut,
  MenubarSeparator,
} from "./Menubar";

export function DesktopUiDemo() {
  return (
    <div className="w-full h-screen flex flex-col">
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              New Tab <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>New Window</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Share</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Print</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
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
