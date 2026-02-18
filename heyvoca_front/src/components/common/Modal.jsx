import React from 'react';

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed inset-0 
        flex flex-col justify-end
        z-50
        bg-[#00000000]
        transition-all duration-300
        ${isOpen ? 'bg-[#00000080]' : ''}
      `}
      onClick={onClose}
    >
      <div
        className={`
          relative
          flex flex-col gap-[30px]
          min-h-[160px] max-h-[calc(100vh-50px)]
          h-auto p-5
          bg-layout-white dark:bg-layout-black
          rounded-t-[12px]
          transform
          ${isOpen ? 'animate-modal-show' : 'translate-y-full'}
        `}
        onClick={e => e.stopPropagation()}
      >
        <div className="max-h-[calc(100vh-20px-27px-30px-45px-20px)] overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal; 