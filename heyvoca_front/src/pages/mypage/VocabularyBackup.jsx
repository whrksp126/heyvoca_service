import React from "react";
import { useNavigate } from "react-router-dom";
import { CaretLeft, Upload, Download } from "@phosphor-icons/react";
import { useTheme } from '../../context/ThemeContext';

const VocabularyBackup = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const handleUpload = (e) => {
    e.preventDefault();
    // TODO: 업로드 로직 구현
  };

  const handleDownload = (e) => {
    e.preventDefault();
    // TODO: 다운로드 로직 구현
  };

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark">
      <header className="border-b border-border dark:border-border-dark">
        <div className="relative w-full max-w-md flex items-center justify-center">
          <button
            onClick={() => navigate("/mypage")}
            className="absolute left-0 flex items-center bg-transparent p-0 border-0"
          >
            <CaretLeft size={24} className="text-primary dark:text-primary-dark" />
          </button>
          <h2 className="text-primary dark:text-primary-dark">단어장 백업</h2>
        </div>
      </header>

      <main className="p-5">
        <ul className="flex flex-col gap-2.5">
          <li 
            onClick={handleUpload}
            className="flex items-center justify-center gap-2.5 h-[45px] 
                     border border-heyvocaPink rounded-lg 
                     text-heyvocaPink cursor-pointer"
          >
            <div className="flex items-center justify-center">
              <Upload size={20} />
            </div>
            <span className="text-base font-bold">단어장 업로드</span>
          </li>
          <li 
            onClick={handleDownload}
            className="flex items-center justify-center gap-2.5 h-[45px] 
                     border border-heyvocaPink rounded-lg 
                     text-heyvocaPink cursor-pointer"
          >
            <div className="flex items-center justify-center">
              <Download size={20} />
            </div>
            <span className="text-base font-bold">단어장 다운로드</span>
          </li>
        </ul>
      </main>
    </div>
  );
};

export default VocabularyBackup; 