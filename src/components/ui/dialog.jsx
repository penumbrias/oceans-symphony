"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import useKeyboardInset from "@/hooks/useKeyboardInset"

// When the tour is active, disable modal mode so Radix doesn't apply
// aria-hidden/inert to the tour card (which lives outside the dialog).
const Dialog = ({ modal, ...props }) => (
  <DialogPrimitive.Root
    modal={window.__tourActive ? false : modal}
    {...props}
  />
)

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ className, children, onInteractOutside, style, showCloseButton = true, ...props }, ref) => {
  const keyboardInset = useKeyboardInset();
  // Manual backdrop for tour mode: Radix's `modal={false}` (used while the
  // feature tour is active so tour buttons remain tappable) suppresses the
  // built-in Overlay. Without it, the page behind the dialog bleeds through
  // and the modal appears empty / transparent. Re-add a visible scrim at a
  // z-index just below the dialog content so the user can still see the
  // modal as a proper modal.
  const inTour = typeof window !== 'undefined' && window.__tourActive;
  return (
  <DialogPortal>
    <DialogOverlay />
    {inTour && (
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40 pointer-events-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
    )}
    <DialogPrimitive.Content
      ref={ref}
      // When the tour is active, block outside-click dismissal so tapping the
      // tour card's Next/Back/Skip buttons doesn't accidentally close the dialog.
      onInteractOutside={e => {
        if (window.__tourActive) { e.preventDefault(); return; }
        onInteractOutside?.(e);
      }}
      style={{
        // Center the dialog in the space above the tour card when active,
        // and above the on-screen keyboard when one is open. Also subtract
        // the device's top + bottom safe-area insets so a full-height
        // dialog can't bleed under the status bar / notification island
        // at the top or the gesture-area chin at the bottom on Android /
        // iOS notch devices.
        top: `calc(env(safe-area-inset-top, 0px) + (100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${keyboardInset}px - var(--tour-card-height, 0px)) / 2)`,
        maxHeight: `calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${keyboardInset}px - var(--tour-card-height, 0px) - 2rem)`,
        ...style,
      }}
      className={cn(
        "fixed left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          className="absolute right-2 top-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}