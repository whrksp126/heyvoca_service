import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Check, Plus, CaretDown, Pencil, Trash } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import './WordBottomSheet.css';

export const useWordSetBottomSheet = () => {
  const { showBottomSheet, hideBottomSheet } = useBottomSheet();
  const { addWord, updateWord } = useVocabulary();

  // 모든 상태를 추적하기 위한 ref
  const currentStateRef = useRef({
    mode: 'add',
    vocabularyId: null,
    dictionary_id: null,
    origin: "",
    meanings: [],
    examples: [],
  });

  const handleClose = useCallback(() => {
    hideBottomSheet();
    currentStateRef.current = {
      mode: 'add',
      vocabularyId: null,
      dictionary_id: null,
      origin: "",
      meanings: [],
      examples: [],
    };
  }, [hideBottomSheet]);

  const handleAdd = useCallback(async (data) => {
    try {
      const newWord = {
        dictionaryId: data.dictionaryId,
        origin: data.origin,
        meanings: data.meanings,
        examples: data.examples
      };
      await addWord(data.vocabularyId, newWord);
      handleClose();
    } catch (error) {
      console.error('단어 추가 실패:', error);
    }
  }, [handleClose, addWord]);

  const handleEdit = useCallback(async (data) => {
    try {
      const vocabularyId = currentStateRef.current.vocabularyId;
      const vocabularyTitle = data.name;
      const vocabularyColor = data.color;

      await updateWord(vocabularyId, {
        title: vocabularyTitle,
        color: getColorSet(vocabularyColor),
      });
      handleClose();
    } catch (error) {
      console.error('단어장 수정 실패:', error);
    }
  }, [handleClose, updateWord]);

  const showWordSetBottomSheet = useCallback(({vocabularyId=null, dictionaryId=null, id=null}) => {
    let newMode = 'add';
    let newOrigin = "";
    let newMeanings = [];
    let newExamples = [];

    if (id) {
      const word = getWord(vocabularyId, id);
      if (word) {
        newMode = 'edit';

        newOrigin = word.origin;
        newMeanings = word.meanings;
        newExamples = word.examples;
      }
    }
    
    // ref 업데이트
    currentStateRef.current = {
      mode: newMode,
      id: id,
      vocabularyId: vocabularyId,
      dictionaryId: dictionaryId,
      origin: newOrigin,
      meanings: newMeanings,
      examples: newExamples,
    };

    showBottomSheet(
      <AddWordSheet 
        id={id}
        vocabularyId={vocabularyId}
        dictionaryId={dictionaryId}
        origin={newOrigin}
        meanings={newMeanings}
        examples={newExamples}
        onCancel={handleClose}
        onSet={newMode === 'add' ? handleAdd : handleEdit}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleClose, handleAdd, handleEdit]);

  return {
    showWordSetBottomSheet,
  };
};

const AddWordSheet = ({id, vocabularyId, dictionaryId, origin, meanings, examples, onCancel, onSet }) => {
  const wordInputRef = useRef(origin || '');
  const [wordSearchResults, setWordSearchResults] = useState(null);
  const [isWordSearching, setIsWordSearching] = useState(false);
  const meaningsInputRef = useRef(meanings.join(', ') || '');
  const [examplesState, setExamplesState] = useState(examples || []);
  const { vocabularySheets } = useVocabulary();
  

  // 단어 검색 함수
  const searchWord = async (word) => {
    if (!word.trim() || word.trim().length < 2) {
      setWordSearchResults(null);
      return;
    }

    setIsWordSearching(true);
    try {
      const response = await fetchDataAsync(
        `${backendUrl}/search/partial/en`,
        'GET',
        { word: word }
      );
      if(response.code != 200) return alert('단어 검색 실패');
      setWordSearchResults(response.data);
    } catch (error) {
      console.error('단어 검색 실패:', error);
      setWordSearchResults(null);
    } finally {
      setIsWordSearching(false);
    }
  };

  const handleWordSelect = ({word, meanings, examples}) => {
    setWordSearchResults(null);
    wordInputRef.current = word;
    meaningsInputRef.current = meanings.join(', ');
    document.querySelector('input[placeholder="단어를 입력하세요"]').value = word;
    document.querySelector('input[placeholder="의미를 입력하세요"]').value = meanings.join(', ');
    setExamplesState(examples);
  };

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어 {id ? "수정" : "추가"}</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[15px]
        p-[20px]
      ">
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] 
            dark:text-[#fff]
            "
          >
            단어장
          </h3>
          <div>
            <div className="relative">
              <select 
                disabled={id ? false : true}
                value={vocabularyId || ''}
                className={`
                  w-full h-[45px]
                  px-[15px]
                  border-[1px] rounded-[8px]
                  font-[400] text-[14px]
                  outline-none
                  transition-colors
                  appearance-none
                  ${id ? false : true ? 
                    'border-[#CCCCCC] bg-[#F5F5F5] text-[#999999]' : 
                    'border-[#ccc] text-[#111] focus:border-[#FF8DD4]'
                  }
                `}
              >
                {vocabularySheets.map((vocabulary) => (
                  <option 
                    value={vocabulary.id} 
                    key={vocabulary.id}
                  >
                    {vocabulary.title}
                  </option>
                ))}
              </select>
              <div className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-none text-[#ccc] text-[18px]">
                <CaretDown />
              </div>
            </div>
          </div>
        </div>
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] 
            dark:text-[#fff]
            "
          >
            단어<strong className="text-[#FF8DD4]">*</strong>
          </h3>
          <div className="relative">
            <input 
              ref={wordInputRef}
              defaultValue={origin || ''}
              onChange={(e) => {
                wordInputRef.current = e.target.value;
                searchWord(e.target.value);
              }}
              type="text" 
              placeholder="단어를 입력하세요"
              className="
                w-full h-[45px]
                px-[15px]
                border-[1px] border-[#ccc] rounded-[8px]
                font-[400] text-[14px] text-[#111]
                outline-none
                focus:border-[#FF8DD4]
                transition-colors
              "
            />
            {isWordSearching && (
              <div className="absolute right-[15px] top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#FF8DD4]"></div>
              </div>
            )}
          </div>
          {wordSearchResults && wordSearchResults.length > 0 && (
            <ul className="scrollbar-pink flex flex-col gap-[10px] max-h-[200px] p-[20px] rounded-[10px] bg-[#FFEFFA] overflow-y-auto">
              {wordSearchResults.map(({word, meanings, examples}, index) => (
                <li
                  key={index}
                  className="flex gap-[10px] pb-[10px] last:pb-0 last:border-b-0 border-b-[1px] border-[#DDDDDD] cursor-pointer"
                  onClick={() => handleWordSelect({ word, meanings, examples })}
                >
                  <span className="text-[14px] font-[700] text-[#111] dark:text-[#fff]">
                    {word.split('').map((char, i) => {
                      const searchWord = wordInputRef.current.toLowerCase();
                      const currentWord = word.toLowerCase();
                      const startIndex = currentWord.indexOf(searchWord);
                      const isHighlighted = startIndex !== -1 && 
                        i >= startIndex && 
                        i < startIndex + searchWord.length;
                      return (
                        <span key={i} style={{ color: isHighlighted ? '#FF8DD4' : '#111' }}>{char}</span>
                      );
                    })}
                  </span>
                  <p className="text-[11px] font-[400] text-[#111] dark:text-[#fff]">{meanings.join(', ')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] 
            dark:text-[#fff]
            "
          >
            의미<strong className="text-[#FF8DD4]">*</strong>
          </h3>
          <div>
            <input 
              ref={meaningsInputRef}
              defaultValue={meanings.join(', ') || ''}
              onChange={e => meaningsInputRef.current = e.target.value}
              type="text" 
              placeholder="의미를 입력하세요"
              className="
                w-full h-[45px]
                px-[15px]
                border-[1px] border-[#ccc] rounded-[8px]
                font-[400] text-[14px] text-[#111]
                outline-none
                focus:border-[#FF8DD4]
                transition-colors
              "
            />
          </div>
        </div>
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <div className="flex justify-between items-center">
            <h3 
              className="
                text-[14px] font-[700] text-[#111] 
              dark:text-[#fff]
              "
            >
              예문
            </h3>
            <button className="text-[18px] text-[#FF8DD4]">
              <Plus />
            </button>
          </div>
          <ul className="flex flex-col gap-[8px]">
            {examplesState.map(({id, exam_en, exam_ko}, index) => (
            <li key={index} 
              className="
                flex flex-col gap-[5px] 
                p-[15px] 
                rounded-[8px]
                bg-[#FFEFFA]
              "
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-[600] text-[#000] dark:text-[#fff]">
                  {index + 1}
                </h2>
                <div className="
                  flex items-center gap-[8px]
                  text-[18px]
                ">
                  <button className="text-[#FF8DD4]">
                    <Pencil />
                  </button>
                  <button className="text-[red]">
                    <Trash />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[14px] font-[400] text-[#111] dark:text-[#fff]">
                  <span>
                  {exam_en.split(wordInputRef.current).map((part, i, arr) => (
                    i < arr.length - 1 ? (
                      <React.Fragment key={i}>
                        {part}<strong>{wordInputRef.current}</strong>
                      </React.Fragment>
                    ) : part
                  ))}
                  </span>
                  <br />
                  <span>
                  {exam_ko}
                  </span>
                </p>
              </div>
            </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onCancel}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={() => onSet({

            id, vocabularyId, dictionaryId,
            origin: wordInputRef.current,
            meanings: meaningsInputRef.current.split(',').map(meaning => meaning.trim()),
            examples: examplesState.map(example => ({
              origin: example.exam_en,
              meaning: example.exam_ko
            }))
          })}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >추가</motion.button>
      </div>
    </div>
  );
}; 
