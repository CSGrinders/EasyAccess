import { useEffect, useState } from "react";
import { CloudItem } from "./ui/cloudItem";
import { FaDropbox, FaGoogleDrive} from "react-icons/fa";
import { TbBrandOnedrive } from "react-icons/tb";
import { SiIcloud } from "react-icons/si";
import {StorageWideWindowProps} from "@Types/box";
import { CloudType } from "../../types/cloudType";
import { PopupAccounts } from "./PopupAccounts";


const StorageWideWindow = ({show, addStorage}: StorageWideWindowProps) => {
    const [showAccountPopup, setShowAccountPopup] = useState<boolean>(false);
    const [toAddCloudType, setToAddCloudType] = useState<CloudType>(CloudType.Dropbox); // default to Dropbox
    const [toAddAccount, setToAddAccount] = useState<string | null>(null);
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);

    // when the user selects an account from the popup / or connects a new account, this effect will be triggered
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
                            <FaGoogleDrive className="h-6 w-6" />,
                            CloudType.GoogleDrive,
                            toAddAccount
                        );
                        break;
                    case CloudType.Dropbox:
                        console.log("Dropbox account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Dropbox: ${toAddAccount}`,
                            <FaDropbox className="h-6 w-6" />,
                            CloudType.Dropbox,
                            toAddAccount
                        );
                        break;
                    case CloudType.OneDrive:
                        console.log("OneDrive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `OneDrive: ${toAddAccount}`,
                            <TbBrandOnedrive className="h-6 w-6" />,
                            CloudType.OneDrive,
                            toAddAccount
                        ); 
                        break;
                    default:
                        console.log("No account connected");
                }

                try {
                    // Fetch files/folders from the root of the selected account
                    // const files = await (window as any).electronAPI.readDirectory(toAddCloudType, toAddAccount, "/easyAccess/temp1");
                    // const temp_fileContent = await (window as any).electronAPI.readFile(toAddCloudType, toAddAccount, "");
                    // console.log("Files in the root directory:", files);
                    // console.log("File content:", temp_fileContent);
                } catch (error) {
                    console.error("Error fetching files:", error);
                }
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
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.GoogleDrive);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('Google Drive account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('Google Drive account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectNewCloudAccount(CloudType.GoogleDrive);
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
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.Dropbox);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('DropBox account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('DropBox account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectNewCloudAccount(CloudType.Dropbox);
            }
        } catch (error) {
            console.error('Login error:', error)
        }
    }

    const handleOneDriveClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('onedrive clicked')

        // change selected cloud type to google drive
        setToAddCloudType(CloudType.OneDrive);
        try {
            // if not exist in store, load token from google
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.OneDrive);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('OneDrive account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('OneDrive account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectNewCloudAccount(CloudType.OneDrive);
            }
        } catch (error) {
            console.error('Login error:', error)
        }
    }

    const connectNewCloudAccount = async (cloudType: CloudType) => {
        const accountId = await (window as any).cloudFsApi.connectNewCloudAccount(cloudType);
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
                icon={<TbBrandOnedrive className="h-5 w-5" />}
                label="OneDrive"
                onClick={() => handleOneDriveClick()}
            />
            {/* Add your sidebar content here */}
            <PopupAccounts open={showAccountPopup} setOpen={setShowAccountPopup} setSelectedAccount={setToAddAccount} availableAccounts={availableAccounts} connectAddNewAccount={connectNewCloudAccount}/>
        </div>
    );
};

export default StorageWideWindow;
