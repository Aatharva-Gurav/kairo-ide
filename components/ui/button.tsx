import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all duration-120 ease-out outline-none select-none cursor-pointer active:scale-[0.96] hover:scale-[1.01] hover:shadow-xs disabled:active:scale-100 disabled:hover:scale-100 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-150 group-hover/button:[&_svg]:scale-105 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs",
        outline:
          "border-border/80 bg-background/40 hover:bg-accent hover:text-accent-foreground shadow-2xs dark:bg-background/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-muted/70 hover:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/15 text-destructive hover:bg-destructive/25 focus-visible:border-destructive/40 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 rounded px-1.5 text-[0.6875rem] [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 gap-1.5 px-3 text-xs [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 rounded [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
