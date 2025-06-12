import ReactDOM from 'react-dom/client';
import Dashboard from '@/pages/Dashboard';
import "./global.css";
import Titlebar from "@/components/app/Titlebar";
import { Toaster } from "@Components/ui/sonner";

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
    <div className="w-screen h-screen overflow-hidden">
        <Titlebar />
        <Dashboard />
        <Toaster />
    </div>
);