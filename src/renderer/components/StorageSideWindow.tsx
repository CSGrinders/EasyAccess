import { useEffect, useState } from "react";
import { CloudItem } from "./ui/cloudItem";
import { FaDropbox, FaGoogleDrive } from "react-icons/fa";
import { SiIcloud } from "react-icons/si";
import {StorageWideWindowProps} from "@Types/box";
import { CloudType } from "../../types/cloudType";
import { PopupAccounts } from "./PopupAccounts";


const StorageWideWindow = ({show, addStorage}: StorageWideWindowProps) => {
    const [showAccountPopup, setShowAccountPopup] = useState<boolean>(false);
    const [toAddCloudType, setToAddCloudType] = useState<CloudType>(CloudType.Dropbox); // default to Dropbox
    const [toAddAccount, setToAddAccount] = useState<string | null>(null);
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            if (toAddAccount) {
                console.log("Selected account changed to:", toAddAccount);

                switch (toAddCloudType) {
                    case CloudType.GoogleDrive:
                        console.log("Google Drive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Google Drive: ${toAddAccount}`,
                            <FaGoogleDrive className="h-6 w-6" />);
                        break;
                    case CloudType.Dropbox:
                        console.log("Dropbox account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Dropbox: ${toAddAccount}`,
                            <FaDropbox className="h-6 w-6" />);
                        break;
                    case CloudType.OneDrive:
                        console.log("OneDrive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `OneDrive: ${toAddAccount}`,
                            <FaGoogleDrive className="h-6 w-6" />); // TODO: replace with OneDrive icon
                        break;
                    case CloudType.ICloud:
                        console.log("ICloud account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `ICloud: ${toAddAccount}`,
                            <SiIcloud className="h-6 w-6" />);
                        break;
                    default:
                        console.log("No account connected");
                }

                // Fetch files/folders from the root of the selected account
                const files = await (window as any).electronAPI.readDirectory(toAddCloudType, toAddAccount, "root");
                console.log("Files in the root directory:", files);
                setToAddAccount(null);
            } else {
                console.log("No account selected");
            }
        };

        fetchData();
    }, [toAddAccount]);

    const handleGoogleClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('google drive clicked')

        // change selected cloud type to google drive
        setToAddCloudType(CloudType.GoogleDrive);
        try {
            // if not exist in store, load token from google
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).electronAPI.getConnectedCloudAccounts(CloudType.GoogleDrive);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('Google Drive account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('Google Drive account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectAddCloudAccount(CloudType.GoogleDrive);
            }
        } catch (error) {
            console.error('Login error:', error)
        }
    }

    const handleDropBoxClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('dropbox clicked')
        // change selected cloud type to dropbox  
        setToAddCloudType(CloudType.Dropbox);
        // TODO: implement getConnectedCloudAccounts for dropbox
        try {
            // if not exist in store, load token from google
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).electronAPI.getConnectedCloudAccounts(CloudType.Dropbox);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('DropBox account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('DropBox account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectAddCloudAccount(CloudType.Dropbox);
            }
        } catch (error) {
            console.error('Login error:', error)
        }
        setToAddAccount("testDropBoxAccount"); // temporary
    }

    const handleICloudClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('icloud clicked')
        // change selected cloud type to icloud
        setToAddCloudType(CloudType.ICloud);
        // TODO implement getConnectedCloudAccounts for icloud
        try {
            // if not exist in store, load token from google
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).electronAPI.getConnectedCloudAccounts(CloudType.ICloud);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('ICloud account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('ICloud account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectAddCloudAccount(CloudType.ICloud);
            }
        } catch (error) {
            console.error('Login error:', error)
        }
        setToAddAccount("testICloudAccount"); // temporary
    }

    const connectAddCloudAccount = async (cloudType: CloudType) => {
        const accountId = await (window as any).electronAPI.connectNewCloudAccount(cloudType);
        setToAddAccount(accountId);
    }

    return (
        <div
            className={`${
                show ? "w-22" : "w-0"
            } absolute left-0 top-0 h-full z-30 bg-white ease-in-out dark:bg-slate-900 border-r rounded-xl border-slate-200 dark:border-slate-700 shadow-xl flex flex-col items-center py-8 space-y-4 transition-all duration-300 overflow-hidden`}
        >
            <CloudItem
                icon={<FaGoogleDrive className="h-5 w-5" />}
                label="Google Drive"
                onClick={() => handleGoogleClick()}
            />
            <CloudItem
                icon={<FaDropbox className="h-5 w-5" />}
                label="Dropbox"
                onClick={() => handleDropBoxClick()}
            />
            <CloudItem
                icon={<SiIcloud className="h-5 w-5" />}
                label="iCloud"
                onClick={() => handleICloudClick()}
            />
            {/* Add your sidebar content here */}
            <PopupAccounts open={showAccountPopup} setOpen={setShowAccountPopup} setSelectedAccount={setToAddAccount} availableAccounts={availableAccounts} connectAddNewAccount={connectAddCloudAccount}/>
        </div>
    );
};

export default StorageWideWindow;
