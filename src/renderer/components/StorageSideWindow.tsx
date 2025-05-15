import { useState } from "react";
import { CloudItem } from "./ui/cloudItem";
import { FaDropbox, FaGoogleDrive } from "react-icons/fa";
import { SiIcloud } from "react-icons/si";
import {StorageWideWindowProps} from "@Types/box";
import { CloudType } from "../../types/cloudType";


const StorageWideWindow = ({show, addStorage}: StorageWideWindowProps) => {
    const [token, setToken] = useState<string | null>(null);

    const handleGoogleClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('google drive clicked')
        try {
            // if not exist in store, load token from google
            // if exist in store, load token from store
            await (window as any).electronAPI.loadAuthTokens(CloudType.GoogleDrive);

            // open google storage box
            addStorage(
                "cloud",
                "Google Drive",
                <FaGoogleDrive className="h-6 w-6" />);
        } catch (error) {
            console.error('Login error:', error)
        }
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
                // onClick={() => handleNavClick("Dropbox")}
            />
            <CloudItem
                icon={<SiIcloud className="h-5 w-5" />}
                label="iCloud"
                // onClick={() => handleNavClick("iCloud")}
            />
            {/* Add your sidebar content here */}
        </div>
    );
};

export default StorageWideWindow;
