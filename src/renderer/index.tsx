import ReactDOM from 'react-dom/client';
import Dashboard from '@/pages/Dashboard';
import "./global.css";
import Titlebar from "@/components/app/Titlebar";
import { Toaster } from "@Components/ui/sonner";
import { TransferStateProvider } from '@/contexts/TransferStateContext';

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
    <TransferStateProvider>
        <div className="w-screen h-screen overflow-hidden flex flex-col">
            <Titlebar />
            <Dashboard />
            <Toaster />
        </div>
    </TransferStateProvider>
);