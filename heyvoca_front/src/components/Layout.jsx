import { GemAnimationProvider } from '../context/GemAnimationContext';

const Layout = ({ children }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

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