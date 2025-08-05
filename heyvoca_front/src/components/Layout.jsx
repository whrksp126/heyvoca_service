
const Layout = ({ children }) => {

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark
                    text-primary dark:text-primary-dark
                    transition-colors duration-200">
      {children}
    </div>
  );
};

export default Layout; 