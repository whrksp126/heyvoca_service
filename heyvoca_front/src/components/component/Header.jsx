// src/components/home/header
import { useNavigate, useLocation } from 'react-router-dom';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  const handleLogoClick = () => {
    if (isAuthPage) {
      navigate('/');
    }
  };

  return (
    <header 
      className={`
        absolute top-0
        flex justify-center items-center 
        w-full h-16 
        text-4xl font-extrabold text-cyan-500
        ${isAuthPage ? 'cursor-pointer hover:text-cyan-600' : ''}
        select-none
      `}
      onClick={isAuthPage ? handleLogoClick : undefined}
    >
      HeyVoca
    </header>
  )
}
export default Header;