import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
type FileUploadMessageProps = {
  open: boolean
  setOpen: (open: boolean) => void
  message: string
  title?: string
  showCloseButton?: boolean
}

export function FileUploadMessage({
  open,
  setOpen,
  message,
  showCloseButton = true,
}: FileUploadMessageProps) {


  return (

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[420px] bg-white dark:bg-black p-6 rounded-2xl shadow-lg 
        animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200
        data-[state=closed]:animate-out data-[state=closed]:fade-out-0 
        data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-2">
        
        <DialogHeader className="animate-in slide-in-from-top-1 duration-300 delay-100">
            <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {}
            </DialogTitle>
          <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-2
            animate-in slide-in-from-top-1 duration-300 delay-200">
            {message}
          </DialogDescription>
        </DialogHeader>

        {showCloseButton && (
          <DialogFooter className="mt-4 animate-in slide-in-from-bottom-1 duration-300 delay-300">
            <Button 
              variant="default" 
              onClick={() => setOpen(false)}
              className="transition-all duration-200 hover:scale-105 hover:shadow-md"
            >
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
