import { cn } from "@/lib/utils";
export function Link({ children, ...props }: React.ComponentProps<"a">) {
  return (
    <a
      {...props}
      className={cn(
        "text-primary hover:text-primary/80 underline",
        props.className,
      )}
    >
      {children}
    </a>
  );
}
