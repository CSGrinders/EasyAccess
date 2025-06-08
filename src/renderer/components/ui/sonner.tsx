import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      expand={true}
      richColors={true}
      closeButton={false}
      toastOptions={{
        style: {
          background: "var(--background)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          backdropFilter: "blur(10px)",
          padding: "16px",
          fontSize: "14px",
          lineHeight: "1.4",
        },
        className: "custom-toast",
      }}
      style={
        {
          "--normal-bg": "var(--background)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "rgb(34, 197, 94)",
          "--success-text": "rgb(255, 255, 255)",
          "--error-bg": "rgb(239, 68, 68)",
          "--error-text": "rgb(255, 255, 255)",
          "--warning-bg": "rgb(245, 158, 11)",
          "--warning-text": "rgb(255, 255, 255)",
          "--info-bg": "rgb(59, 130, 246)", 
          "--info-text": "rgb(255, 255, 255)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
