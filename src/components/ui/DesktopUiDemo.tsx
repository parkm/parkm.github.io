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
import { Select, SelectOption } from "./Select";

export function DesktopUiDemo() {
  return (
    <div className="w-full h-screen flex flex-col">
      <div>
        <Menubar className="flex-1 flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
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
            <MenubarMenu>
              <MenubarTrigger>Edit</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  Cut <MenubarShortcut>⌘X</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Copy <MenubarShortcut>⌘C</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Paste <MenubarShortcut>⌘V</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </div>
          <Select className="min-w-60 justify-self-end">
            <SelectOption value="1">Option 1</SelectOption>
            <SelectOption value="2">Option 2</SelectOption>
            <SelectOption value="3">Option 3</SelectOption>
          </Select>
        </Menubar>
      </div>
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
