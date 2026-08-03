import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { RevealSection } from "@/components/motion-primitives";

// Blueprint-industrial primitives. Every content container is a "window":
// mono title bar + ink-bordered body sitting on the blueprint page, lifted by
// a hard offset shadow rather than a blur.

export function Window({
  title,
  titleBarExtra,
  floating = false,
  reveal = true,
  bodyClassName = "p-5 md:p-6",
  children,
}: {
  title: string;
  titleBarExtra?: ReactNode;
  floating?: boolean;
  reveal?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const className = `rounded-base border-2 border-border-default-strong bg-neutral-primary-soft ${
    floating ? "shadow-window" : ""
  }`;

  const body = (
    <>
      <header className="flex h-9 items-center gap-2 rounded-t-base border-b-2 border-border-default-strong bg-menu-bar px-3">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 border border-border-default-strong bg-brand" />
          <span className="size-2.5 border border-border-default-strong bg-neutral-secondary-strong" />
        </span>
        <span className="truncate font-mono text-xs font-bold uppercase tracking-[0.08em] text-heading">
          {title}
        </span>
        {titleBarExtra && <span className="ml-auto">{titleBarExtra}</span>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </>
  );

  if (!reveal) return <section className={className}>{body}</section>;
  return <RevealSection className={className}>{body}</RevealSection>;
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

// Press-into-shadow: hover lifts the control off its hard shadow, active drops
// it flat. Kept in CSS so `buttonClass` stays a plain string for <Link>/<a>
// and the interaction survives without JavaScript.
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-base border-2 " +
  "font-display font-bold uppercase tracking-[0.06em] shadow-menu " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-120 ease-out-quart " +
  "hover:-translate-x-px hover:-translate-y-px hover:shadow-window " +
  "active:translate-x-0 active:translate-y-0 active:shadow-none " +
  "disabled:cursor-not-allowed disabled:border-border-default-subtle disabled:bg-disabled " +
  "disabled:text-fg-disabled disabled:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0 " +
  "motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-border-default-strong bg-button-primary text-button-primary-text hover:bg-button-primary-hover",
  secondary:
    "border-border-default-strong bg-button-secondary text-cream hover:bg-brand-strong",
  tertiary:
    "border-border-default-strong bg-neutral-primary-soft text-heading hover:bg-neutral-secondary-medium",
  danger: "border-border-danger bg-danger text-cream hover:bg-danger-strong",
  ghost:
    "border-transparent bg-transparent text-heading shadow-none hover:bg-neutral-secondary-medium " +
    "hover:shadow-none hover:translate-x-0 hover:translate-y-0 active:bg-neutral-secondary-strong",
};

const buttonSizes: Record<ButtonSize, string> = {
  base: "px-3.5 py-[7px] text-xs",
  lg: "px-6 py-3 text-sm",
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

// Menu-bar link, shared by the root nav and the user menu.
export const menuLink =
  "rounded-base px-2 py-1 font-display text-sm font-semibold text-heading sm:px-2.5 " +
  "transition-colors duration-120 hover:bg-neutral-secondary-medium";

type BadgeVariant =
  "brand" | "neutral" | "gray" | "danger" | "success" | "warning";

const badgeVariants: Record<BadgeVariant, string> = {
  brand: "border-border-brand-subtle bg-brand-softer text-fg-brand-strong",
  neutral: "border-border-default bg-neutral-primary-soft text-heading",
  gray: "border-border-default bg-neutral-secondary-medium text-heading",
  danger: "border-border-danger-subtle bg-danger-soft text-fg-danger-strong",
  success:
    "border-border-success-subtle bg-success-soft text-fg-success-strong",
  warning: "border-border-warning-subtle bg-warning-soft text-fg-warning",
};

// Badges carry system values only. Uppercase is CSS, never the source string —
// the lowercase text ("public", "staff", "approved") is asserted by the tests.
export function Badge({
  variant = "neutral",
  mono = false,
  children,
}: {
  variant?: BadgeVariant;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-base border px-1.5 py-0.5 text-2xs font-bold uppercase tracking-[0.08em] ${
        mono ? "font-mono" : "font-display"
      } ${badgeVariants[variant]}`}
    >
      {children}
    </span>
  );
}

export const inputClass =
  "block w-full rounded-base border border-border-default bg-neutral-secondary-soft " +
  "px-2.5 py-[7px] text-sm text-heading placeholder:text-body-subtle " +
  "transition-colors duration-120 hover:border-border-default-strong " +
  "focus:border-border-brand focus:outline-none focus-visible:outline-2 " +
  "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled";

export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-display text-sm font-semibold text-heading"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// Mono "system label": file names, timestamps, tags — the connective tissue
// of the lab-console voice.
export function SysLabel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`font-mono text-xs uppercase tracking-[0.1em] tabular-nums text-body-subtle ${className}`}
    >
      {children}
    </span>
  );
}
