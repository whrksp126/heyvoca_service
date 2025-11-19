import React from 'react';

const Header = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  return (
    <div className='
      flex items-center justify-between
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-[#fff] 
      dark:bg-[#111]
    '>
      <div className="left">
        
      </div>
      <div className="center">
        <h2 className='text-[16px] font-[700]'>
          단어 학습
        </h2>
      </div>
      <div className="right">

      </div>
    </div>
  );
};

export default Header; 