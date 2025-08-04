/**
 * Titlebar Component
 * 
 * This component creates a custom titlebar for the application window.
 */

const Titlebar = () => {
    return (

        <div className="h-8 flex items-center justify-between px-3 select-none drag bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 backdrop-blur-sm">
            <div className="w-3 h-3 no-drag"></div>
        </div>
    );
};

export default Titlebar;
