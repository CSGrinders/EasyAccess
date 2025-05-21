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
import { CloudType } from "@Types/cloudType"

type PopupAccountsProps = {
    open: boolean
    setOpen: (open: boolean) => void
    setSelectedAccount: (account: string) => void
    connectAddNewAccount: (cloudType: CloudType) => void
    availableAccounts: string[]
}

export function PopupAccounts({open, setOpen, setSelectedAccount, availableAccounts, connectAddNewAccount}: PopupAccountsProps) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Choose Account</DialogTitle>
            <div className="flex flex-col gap-2 mt-4">
                {availableAccounts.map((account) => (
                    <Button
                        key={account}
                        variant="outline"
                        onClick={() => {
                            setSelectedAccount(account)
                            setOpen(false)
                        }}
                    >
                        {account}
                    </Button>
                ))}
                <Button
                    variant="outline"
                    onClick={() => {
                        connectAddNewAccount(CloudType.GoogleDrive) // TODO: add cloudType
                        setOpen(false)
                    }}
                >
                    Add New Account
                </Button>
            </div>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
