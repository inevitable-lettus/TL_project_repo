import type { ComponentPropsWithoutRef, ReactNode } from "react";

// Nostalgia design-system primitives (cards.md, buttons.md). Every content
// container is a "window": title bar + bordered body on a cream surface.

export function Window({
  title,
  titleBarExtra,
  floating = false,
  bodyClassName = "p-5 md:p-6",
  children,
}: {
  title: string;
  titleBarExtra?: ReactNode;
  floating?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-base border border-border-default bg-neutral-primary-soft ${
        floating ? "shadow-window" : ""
      }`}
    >
      <header className="flex h-8 items-center gap-2 rounded-t-base border-b border-border-default bg-menu-bar px-3">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full border border-border-default bg-brand" />
          <span className="size-2.5 rounded-full border border-border-default bg-neutral-secondary-strong" />
        </span>
        <span className="truncate text-[13px] font-semibold text-heading">
          {title}
        </span>
        {titleBarExtra && <span className="ml-auto">{titleBarExtra}</span>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// Title-less bordered panel for nested/secondary content.
export function Panel({
  inset = false,
  className = "",
  children,
}: {
  inset?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-base border border-border-default ${
        inset ? "bg-neutral-secondary-soft" : "bg-neutral-primary-soft"
      } ${className}`}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";
type ButtonSize = "base" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-base border font-medium " +
  "transition-colors duration-[120ms] active:translate-y-px active:shadow-press " +
  "disabled:cursor-not-allowed disabled:border-border-default-subtle disabled:bg-disabled " +
  "disabled:text-fg-disabled disabled:shadow-none disabled:active:translate-y-0";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-border-default-strong bg-button-primary text-button-primary-text hover:bg-button-primary-hover",
  secondary:
    "border-border-default-strong bg-button-secondary text-cream hover:bg-brand-strong",
  tertiary:
    "border-border-default bg-neutral-primary-soft text-heading hover:bg-neutral-secondary-medium",
  danger: "border-border-danger bg-danger text-cream hover:bg-danger-strong",
  ghost:
    "border-transparent bg-transparent text-heading hover:bg-neutral-secondary-medium active:bg-neutral-secondary-strong",
};

const buttonSizes: Record<ButtonSize, string> = {
  base: "px-3.5 py-[7px] text-[13px]",
  lg: "px-[18px] py-[9px] text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "base",
): string {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}`;
}

export function Button({
  variant = "primary",
  size = "base",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      {...props}
      className={`${buttonClass(variant, size)} ${className}`}
    />
  );
}

// Mono "system label" (typography.md): file names, timestamps, tags.
export function SysLabel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`font-mono text-[12px] tracking-[0.4px] tabular-nums text-body-subtle ${className}`}
    >
      {children}
    </span>
  );
}
