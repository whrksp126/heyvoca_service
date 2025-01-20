import React from 'react';
import Main from '../components/store/Main';

const Store = () => {
  return (
    <div 
      className="
        flex flex-col items-center 
        min-h-screen 
        mx-auto
        bg-gray-50
        pb-20
      "
    >
      <Main />
    </div>
  );
};

export default Store; 