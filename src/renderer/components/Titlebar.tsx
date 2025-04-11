import React from "react";


const Titlebar = () => {
    return (
        <div className="h-8 flex items-center justify-between px-3 select-none drag">
            <div className="w-6 h-6 no-drag"></div>
        </div>
    );
};

export default Titlebar;
