import { QuadDock } from "./Dock";
import { Link } from "./Link";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";
import { Checkbox } from "./Checkbox";
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
import { Input } from "./Input";
import { Label } from "./Label";
import { Slider } from "./Slider";
import { Button } from "./Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
  CardFooter,
} from "./Card";
import { ArrowBigDown, ArrowBigUp, MinusIcon, PlusIcon } from "lucide-react";
import { ButtonGroup } from "./ButtonGroup";
import { Textarea } from "./Textarea";

export function DesktopUiDemo() {
  return (
    <div className="fixed inset-0 flex flex-col">
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
      <div className="flex-1 min-h-0 overflow-hidden">
        <QuadDock
          top={
            <div className="p-4">
              <ButtonGroup>
                <Button variant="outline">Button 1</Button>
                <Button variant="outline">Button 2</Button>
                <Button variant="outline">Button 3</Button>
              </ButtonGroup>
              <ButtonGroup
                orientation="vertical"
                aria-label="Media controls"
                className="h-fit"
              >
                <Button variant="outline" size="icon">
                  <PlusIcon />
                </Button>
                <Button variant="outline" size="icon">
                  <MinusIcon />
                </Button>
              </ButtonGroup>
              <Checkbox />
              <RadioGroup defaultValue="option-one">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-one" id="option-one" />
                  <Label htmlFor="option-one">Option One</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-two" id="option-two" />
                  <Label htmlFor="option-two">Option Two</Label>
                </div>
              </RadioGroup>
            </div>
          }
          bottom={
            <div className="p-4">
              <div className="flex flex-col gap-2">
                <input type="checkbox" />
                <input type="radio" />
                <input type="range" />
                <input type="color" />
                <input type="date" />
                <input type="time" />
                <input type="email" />
                <input type="tel" />
              </div>
              <div className="flex flex-col gap-2">
                <Input type="checkbox" />
                <Input type="radio" />
                <Input type="range" />
                <Input type="color" />
                <Input type="date" />
                <Input type="time" />
                <Input type="email" />
                <Input type="tel" />
              </div>
              <Textarea placeholder="Type your message here." />
            </div>
          }
          left={
            <div className="p-4">
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>Card Description</CardDescription>
                  <CardAction>Card Action</CardAction>
                </CardHeader>
                <CardContent>
                  <p>Card Content</p>
                </CardContent>
                <CardFooter>
                  <p>Card Footer</p>
                </CardFooter>
              </Card>
            </div>
          }
          right={
            <div className="p-4 flex flex-col gap-2">
              <Label htmlFor="search">Search</Label>
              <Input id="search" />
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" />
              <Label htmlFor="number">Number</Label>
              <Input id="number" type="number" />
              <Label htmlFor="slider">Slider</Label>
              <Slider id="slider" min={0} max={100} />
              <Button variant="outline">Submit</Button>
              <Button variant="outline">
                <ArrowBigDown />
              </Button>
              <div className="flex gap-2">
                <Button variant="destructive">
                  <ArrowBigUp />
                </Button>
                <Button variant="ghost">
                  <ArrowBigDown />
                </Button>
                <Button variant="secondary">
                  <ArrowBigUp />
                </Button>
              </div>
              <Link
                href="https://www.google.com"
                target="_blank"
                className="text-sm"
              >
                Google
              </Link>
            </div>
          }
          center={<div>main workspace</div>}
        />
      </div>
    </div>
  );
}
