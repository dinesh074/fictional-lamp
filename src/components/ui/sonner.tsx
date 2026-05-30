"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  // Tap-anywhere-to-close: sonner's global `toastOptions` doesn't expose an
  // onClick handler, so we delegate click events at the document level and
  // dismiss the nearest toast (unless the click was the × close button itself).
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest("[data-close-button]")) return // let × handle itself
      const toastEl = target.closest("[data-sonner-toast]") as HTMLElement | null
      if (!toastEl) return
      const id = toastEl.getAttribute("data-id")
      if (id) toast.dismiss(id)
    }
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // ── UX defaults ────────────────────────────────────────────────
      // • Show an explicit × on every toast (Sonner global flag)
      // • Auto-dismiss faster (3s) instead of the 4s default
      // • Clicking the toast body anywhere dismisses it (see useEffect above)
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
