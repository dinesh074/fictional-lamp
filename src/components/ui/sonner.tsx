"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // ── UX defaults ────────────────────────────────────────────────
      // • Show an explicit × on every toast (Sonner global flag)
      // • Auto-dismiss faster (3s) instead of the 4s default
      // • Allow clicking the toast body itself to dismiss it
      closeButton
      duration={3000}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        // Tap-anywhere-to-close for impatient phone users
        onClick: (t) => toast.dismiss(t.id),
        classNames: {
          toast: "cn-toast cursor-pointer",
          closeButton:
            "!bg-background !border !border-border !text-foreground hover:!bg-muted",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
