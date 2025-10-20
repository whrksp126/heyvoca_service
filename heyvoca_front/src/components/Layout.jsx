import { GemAnimationProvider } from '../context/GemAnimationContext';

const Layout = ({ children }) => {

  return (
    <GemAnimationProvider>
      <div className="min-h-screen bg-background dark:bg-background-dark
                      text-primary dark:text-primary-dark
                      transition-colors duration-200">
        {children}
      </div>
    </GemAnimationProvider>
  );
};

export default Layout; 