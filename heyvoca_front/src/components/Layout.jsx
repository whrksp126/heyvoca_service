import { useTheme } from '../context/ThemeContext';

const Layout = ({ children }) => {
  const { isDark } = useTheme();

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark
                    text-primary dark:text-primary-dark
                    transition-colors duration-200">
      {children}
    </div>
  );
};

export default Layout; 