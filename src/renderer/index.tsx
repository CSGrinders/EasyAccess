import React from 'react';
import ReactDOM from 'react-dom/client';
import Test from '@Pages/Test';
import TestLoginPage from '@Pages/TestLoginPage';
import Titlebar from '@Components/Titlebar'
import "./global.css";

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
    <div>
        <Titlebar/>
        <div className="p-6"/>
        {/* <Test/> */}
        <TestLoginPage/>
    </div>
);
