import { CloudType } from "@Types/cloudType";
import { Folder, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FaDropbox, FaGoogleDrive } from "react-icons/fa";
import { TbBrandOnedrive } from "react-icons/tb";

const ToolResult = ({ content }: { content: string }) => {
    const [provider, setProvider] = useState<string | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [contentWithoutHeader, setContentWithoutHeader] = useState<string>("");
    const parseContent = useCallback((content: string) => {
        // parse tool header
        // `<tool_header><provider>${toolArgs.provider.toUpperCase()}</provider>\t<accountId>${toolArgs.accountId}</accountId></tool_header>`;

        const toolHeaderRegex = /<tool_header>(.+?)<\/tool_header>/;
        const match = content.match(toolHeaderRegex);
        if (match) {
            // Extract the provider and accountId from the header
            const headerContent = match[1];
            const providerMatch = headerContent.match(/<provider>(.+?)<\/provider>/);
            const accountIdMatch = headerContent.match(/<accountId>(.+?)<\/accountId>/);
            if (providerMatch && accountIdMatch) {
                const provider = providerMatch[1];
                const accountId = accountIdMatch[1];
                setProvider(provider);
                setAccountId(accountId);
            }
            // Remove the header from the content
            const contentWithoutHeader = content.replace(toolHeaderRegex, "").trim();
            setContentWithoutHeader(contentWithoutHeader);
        } else {
            setContentWithoutHeader(content.trim());
            setProvider(null);
            setAccountId(null);
        }
    }, [content]);

    useEffect(() => {
        parseContent(content);
    }, [content]);

    const handleAccountClick = useCallback(() => {
        if (provider && accountId) {
            console.log(`Navigating to account: ${accountId} on provider: ${provider}`);
            // move screen to the opened box?
            // open a box if not opened?
        }
    }, [provider, accountId]);

    return (
    <div className="tool-part relative p-2 text-sm">
        {(provider && accountId) && (
            <div className="absolute top-2 right-2 flex gap-2 flex-wrap z-10 opacity-30 hover:opacity-100 hover:cursor-pointer transition-opacity group"
                onClick={handleAccountClick}>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-white text-white rounded-md text-xs shadow-md group-hover:scale-101 transition-transform">
                    {(() => {
                        if (provider.toLowerCase().includes('google')) {
                            return <span className="text-blue-400"><FaGoogleDrive /></span>;
                        } else if (provider.toLowerCase().includes('onedrive')) {
                            return <span className="text-blue-400"><TbBrandOnedrive /></span>;
                        } else if (provider.toLowerCase().includes('dropbox')) {
                            return <span className="text-blue-400"><FaDropbox /></span>;
                        } else {
                            return <span className="text-blue-400">{provider}: </span>;
                        }
                    })()}
                    {accountId}
                </span>
            </div>
        )}

        <pre className="whitespace-pre-wrap text-white break-words overflow-wrap-anywhere">{contentWithoutHeader}</pre>
    </div>

    );
};

export default ToolResult;
