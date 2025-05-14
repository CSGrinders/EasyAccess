import { useState } from "react";
import { CloudItem } from "./ui/cloudItem";
import { FaDropbox, FaGoogleDrive } from "react-icons/fa";
import { SiIcloud } from "react-icons/si";

interface StorageWideWindowProps {
    show: boolean
}

const StorageWideWindow = ({show}: StorageWideWindowProps) => {
    const [token, setToken] = useState<string | null>(null);

    const handleGoogleAuth = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('google drive clicked')
        try {
            var token = await (window as any).electronAPI.getAuthTokens();
            if (!token) {
                token = await (window as any).electronAPI.googleAuth();
                await (window as any).electronAPI.saveAuthTokens(token);
            }
            setToken(token.access_token);
            console.log("Token: ", token);
        } catch (error) {
            console.error('Login error:', error)
        }
    }
    return (
        <div
                className={`${
                    show ? "w-30" : "w-0"
                } bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center py-6 transition-all duration-300 overflow-hidden`}
            >
                <CloudItem
                    icon={<FaGoogleDrive className="h-5 w-5" />}
                    label="Google Drive"
                    onClick={() => handleGoogleAuth()}
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
