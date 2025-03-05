import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

const ThemeToggle = () => {
  const { isDark, setIsDark } = useTheme();

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800
                 transition-colors duration-200"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <SunIcon className="w-5 h-5 text-primary-dark" />
      ) : (
        <MoonIcon className="w-5 h-5 text-primary" />
      )}
    </button>
  );
};

export default ThemeToggle; 