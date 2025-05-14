import React from 'react';
import ReactDOM from 'react-dom/client';
import HomePage from '@Pages/HomePage';
import {FileExplorer} from "@Components/FileExplorer";
import "./global.css";
import Titlebar from "@Components/Titlebar";

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
    <div className="w-screen h-screen overflow-hidden">
        <Titlebar />
        <HomePage />
    </div>
);