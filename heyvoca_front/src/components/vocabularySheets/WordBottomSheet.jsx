import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Check, Plus, CaretDown, Pencil, Trash } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import postMessageManager from '../../utils/postMessageManager';
import './WordBottomSheet.css';
import { IconCamera } from '../../assets/svg/icon';
import { vibrate } from '../../utils/osFunction';

export const useWordSetBottomSheet = () => {
  const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheet();
  const { addWord, updateWord, getWord, deleteWord } = useVocabulary();

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
    popNewBottomSheet();
    currentStateRef.current = {
      mode: 'add',
      vocabularyId: null,
      dictionary_id: null,
      origin: "",
      meanings: [],
      examples: [],
    };
  }, [popNewBottomSheet]);

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

      if (currentStateRef.current.vocabularyId !== data.vocabularyId) {
        const word = getWord(currentStateRef.current.vocabularyId, data.id);
        await addWord(data.vocabularyId, word);
        await deleteWord(currentStateRef.current.vocabularyId, data.id);
      } else {
        const updates = {
          origin: data.origin,
          meanings: data.meanings,
          examples: data.examples
        }
        await updateWord(data.vocabularyId, data.id, updates);
      }
      handleClose();
    } catch (error) {
      console.error('단어장 수정 실패:', error);
    }
  }, [handleClose, updateWord]);

  // const handleDelete = useCallback(async (data) => {
  //   await deleteWord(data.vocabularyId, data.id);
  //   handleClose();
  // }, [handleClose, deleteWord]);

  const showWordSetBottomSheet = useCallback(({ vocabularyId = null, dictionaryId = null, id = null }) => {
    let newMode = 'add';
    let newOrigin = currentStateRef.current.origin || "";
    let newMeanings = currentStateRef.current.meanings || [];
    let newExamples = currentStateRef.current.examples || [];

    if (id) {
      const word = getWord(vocabularyId, id);
      console.log("word: ", word);
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
      vocabularyId: vocabularyId || currentStateRef.current.vocabularyId,
      dictionaryId: dictionaryId || currentStateRef.current.dictionaryId,
      origin: newOrigin,
      meanings: newMeanings,
      examples: newExamples,
    };

    pushNewBottomSheet(
      AddWordSheet,
      {
        id: id,
        vocabularyId: vocabularyId || currentStateRef.current.vocabularyId,
        dictionaryId: dictionaryId || currentStateRef.current.dictionaryId,
        origin: newOrigin,
        meanings: newMeanings,
        examples: newExamples,
        onCancel: handleClose,
        onSet: newMode === 'add' ? handleAdd : handleEdit
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  }, [handleClose, handleAdd, handleEdit]);

  // const showWordDeleteBottomSheet = useCallback(({vocabularyId=null, id=null}) => {
  //   pushNewBottomSheet(
  //     DeleteWordSheet,
  //     {
  //       vocabularyId: vocabularyId,
  //       id: id,
  //       onCancel: handleClose,
  //       onDelete: handleDelete
  //     }
  //   );
  // }, [handleClose, pushNewBottomSheet]);
  // return {
  //   showWordSetBottomSheet,
  //   showWordDeleteBottomSheet,
  //   currentStateRef
  // };
};

export const AddWordSheet = ({ id, vocabularyId, dictionaryId, origin, meanings, examples, onCancel, onSet }) => {
  console.log("examples: ", examples);
  const [wordData, setWordData] = useState({
    id: id,
    vocabularyId: vocabularyId,
    dictionaryId: dictionaryId,
    origin: origin || '',
    meanings: meanings || '',
    examples: examples || [],
  });
  const [exampleSetType, setExampleSetType] = useState({
    isExampleSet: false,
    setType: "add",
    exampleIndex: 1,
  });
  const wordInputRef = useRef(wordData.origin || '');
  const [wordSearchResults, setWordSearchResults] = useState(null);
  const [isWordSearching, setIsWordSearching] = useState(false);
  const meaningsInputRef = useRef(wordData.meanings.join(', ') || '');
  const [examplesState, setExamplesState] = useState(wordData.examples || []);
  const exampleOriginInputRef = useRef(wordData.examples[exampleSetType.exampleIndex - 1]?.origin || '');
  const exampleMeaningInputRef = useRef(wordData.examples[exampleSetType.exampleIndex - 1]?.meaning || '');
  const { vocabularySheets } = useVocabulary();

  // OCR 결과 처리 핸들러
  const handleOCRResult = useCallback(async (message) => {
    // console.log('OCR 결과 받음:', message);
    // console.log(message.data.words);

    if (message.data.words && message.data.words.length > 0) {
      try {
        // 백엔드로 OCR 데이터 전송 (전처리 및 DB 확인)
        const response = await fetchDataAsync(
          `${backendUrl}/ocr/words`,
          'POST',
          {
            words: message.data.words
          },
          false
        );

        if (response.code === 200) {
          console.log('백엔드 OCR 처리 완료:')
          console.log(response.data);

          // 백엔드에서 전처리된 결과 리스트를 앱에 전달 (word, meaning만)
          const matched_words = response.data.matched_words;

          // 처리된 데이터를 앱으로 전달
          postMessageManager.sendMessageToReactNative('filteredWords', matched_words);
          // console.log('앱으로 OCR 처리 결과 전송 완료');

        } else {
          console.error('백엔드 OCR 처리 실패:', response);
          alert('OCR 처리에 실패했습니다.');
        }
      } catch (error) {
        console.error('OCR 데이터 전송 오류:', error);
        alert('OCR 데이터 전송 중 오류가 발생했습니다.');
      }
    }
  }, []);

  // OCR 결과 리스너 등록
  useEffect(() => {
    // console.log('OCR 리스너 등록');
    postMessageManager.setupOCRResult(handleOCRResult);

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      // console.log('OCR 리스너 제거');
      postMessageManager.removeOCRResult();
    };
  }, [handleOCRResult]);

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
        { word: word },
        false,
        null
      );
      if (response.code != 200) return alert('단어 검색 실패');
      setWordSearchResults(response.data);
    } catch (error) {
      console.error('단어 검색 실패:', error);
      setWordSearchResults(null);
    } finally {
      setIsWordSearching(false);
    }
  };

  const handleWordSelect = ({ word, meanings, examples }) => {
    setWordSearchResults(null);
    wordInputRef.current.value = word;
    meaningsInputRef.current.value = meanings.join(', ');

    // document.querySelector('input[placeholder="단어를 입력하세요"]').value = word;
    // document.querySelector('input[placeholder="의미를 입력하세요"]').value = meanings.join(', ');
    setExamplesState(examples);
  };

  return (
    !exampleSetType.isExampleSet ? (
      <div className="relative h-full">
        <div>
          <div className="left"></div>
          <div className="
          relative flex items-center justify-center
          p-[20px] pb-[0px]
          ">
            <h1 className="text-[18px] font-[700]">단어 {id ? "수정" : "추가"}</h1>
            <button
              type="button"
              className="
              absolute right-[20px]
              inline-flex items-center justify-center
              w-[29px] h-[26px]
            "
              onClick={() => {
                vibrate({ duration: 5 });
                // React Native로 메시지 전송
                postMessageManager.sendMessageToReactNative('openCamera', vocabularyId);
              }}
            >
              <IconCamera width={29} height={26} className="text-primary-main-600" />
            </button>
          </div>
          <div className="right"></div>
        </div>
        <div className="
        flex flex-col gap-[15px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
          <div
            className="
            flex justify-between flex-col gap-[8px]
          "
          >
            <h3
              className="
              text-[14px] font-[700] text-layout-black 
            dark:text-layout-white
            "
            >
              단어장
            </h3>
            <div>
              <div className="relative">
                <select
                  disabled={id ? false : true}
                  value={wordData.vocabularyId || ''}
                  onChange={(e) => {
                    console.log("e.target.value: ", e.target.value);
                    setWordData({
                      ...wordData,
                      vocabularyId: e.target.value
                    });
                  }}
                  className={`
                  w-full h-[45px]
                  px-[15px]
                  border-[1px] rounded-[8px]
                  font-[400] text-[14px]
                  outline-none
                  transition-colors
                  appearance-none
                  ${id ? false : true ?
                      'border-layout-gray-200 bg-layout-gray-50 text-layout-gray-400' :
                      'border-layout-gray-200 text-layout-black focus:border-primary-main-600'
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
                <div className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-none text-layout-gray-200 text-[18px]">
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
              text-[14px] font-[700] text-layout-black 
            dark:text-layout-white
            "
            >
              단어<strong className="text-primary-main-600">*</strong>
            </h3>
            <div className="relative">
              <input
                ref={wordInputRef}
                defaultValue={wordData.origin || ''}
                onChange={(e) => {
                  wordInputRef.current.value = e.target.value;
                  searchWord(e.target.value);
                }}
                type="text"
                placeholder="단어를 입력하세요"
                className="
                w-full h-[45px]
                px-[15px]
                border-[1px] border-layout-gray-200 rounded-[8px]
                font-[400] text-[14px] text-layout-black
                outline-none
                focus:border--primary-main-600
                transition-colors
              "
              />
              {isWordSearching && (
                <div className="absolute right-[15px] top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-main-600"></div>
                </div>
              )}
            </div>
            {wordSearchResults && wordSearchResults.length > 0 && (
              <ul className="scrollbar-pink flex flex-col gap-[10px] max-h-[200px] p-[20px] rounded-[10px] bg-primary-main-100 overflow-y-auto">
                {wordSearchResults.map(({ word, meanings, examples }, index) => (
                  <li
                    key={index}
                    className="flex gap-[10px] pb-[10px] last:pb-0 last:border-b-0 border-b-[1px] border-[#DDDDDD] cursor-pointer"
                    onClick={() => {
                      vibrate({ duration: 5 });
                      handleWordSelect({ word, meanings, examples });
                    }}
                  >
                    <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                      {word.split('').map((char, i) => {
                        const searchWord = wordInputRef.current.value.toLowerCase();
                        const currentWord = word.toLowerCase();
                        const startIndex = currentWord.indexOf(searchWord);
                        const isHighlighted = startIndex !== -1 &&
                          i >= startIndex &&
                          i < startIndex + searchWord.length;
                        return (
                          <span key={i} style={{ color: isHighlighted ? 'var(--primary-main-600)' : 'var(--layout-black)' }}>{char}</span>
                        );
                      })}
                    </span>
                    <p className="text-[11px] font-[400] text-layout-black dark:text-layout-white">{meanings.join(', ')}</p>
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
              text-[14px] font-[700] text-layout-black 
            dark:text-layout-white
            "
            >
              의미<strong className="text-primary-main-600">*</strong>
            </h3>
            <div>
              <input
                ref={meaningsInputRef}
                defaultValue={wordData.meanings.join(', ') || ''}
                onChange={e => {
                  meaningsInputRef.current.value = e.target.value;
                  setWordData({
                    ...wordData,
                    meanings: e.target.value.split(',').map(meaning => meaning.trim())
                  });
                }}
                type="text"
                placeholder="의미를 입력하세요"
                className="
                w-full h-[45px]
                px-[15px]
                border-[1px] border-layout-gray-200 rounded-[8px]
                font-[400] text-[14px] text-layout-black
                outline-none
                focus:border--primary-main-600
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
                text-[14px] font-[700] text-layout-black 
              dark:text-layout-white
              "
              >
                예문
              </h3>
              <button
                className="text-[18px] text-primary-main-600"
                onClick={() => {
                  vibrate({ duration: 5 });
                  setWordData({
                    ...wordData,
                    origin: wordInputRef.current.value,
                    meanings: meaningsInputRef.current.value.split(',').map(meaning => meaning.trim()),
                    examples: examplesState
                  })
                  setExampleSetType({
                    isExampleSet: true,
                    setType: "add",
                    exampleIndex: examplesState.length + 1,
                  })
                }
                }
              >
                <Plus />
              </button>
            </div>
            <ul className="flex flex-col gap-[8px]">
              {examplesState.map(({ id, origin, meaning }, index) => (
                <li key={index}
                  className="
                flex flex-col gap-[5px] 
                p-[15px] 
                rounded-[8px]
                bg-primary-main-100
              "
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-[14px] font-[600] text-[#000] dark:text-layout-white">
                      {index + 1}
                    </h2>
                    <div className="
                  flex items-center gap-[8px]
                  text-[18px]
                ">
                      <button className="text-primary-main-600" onClick={() => {
                        vibrate({ duration: 5 });
                        setWordData({
                          ...wordData,
                          origin: wordInputRef.current.value,
                          meanings: meaningsInputRef.current.value.split(',').map(meaning => meaning.trim()),
                          examples: examplesState
                        })
                        setExampleSetType({
                          isExampleSet: true,
                          setType: "edit",
                          exampleIndex: index + 1,
                        })
                      }
                      }
                      >
                        <Pencil />
                      </button>
                      <button className="text-[red]" onClick={() => {
                        vibrate({ duration: 5 });
                        setExamplesState(examplesState.filter(example => example.id !== id));
                      }}>
                        <Trash />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[14px] font-[400] text-layout-black dark:text-layout-white">
                      <span>
                        {origin && wordInputRef.current ?
                          origin.split(wordInputRef.current).map((part, i, arr) => (
                            i < arr.length - 1 ? (
                              <React.Fragment key={i}>
                                {part}<strong>{wordInputRef.current}</strong>
                              </React.Fragment>
                            ) : part
                          )) : origin}
                      </span>
                      <br />
                      <span>
                        {meaning}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
        p-[20px]
      ">
          <motion.button
            className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
            onClick={() => {
              vibrate({ duration: 5 });
              onCancel();
            }}
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
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
            onClick={() => {
              vibrate({ duration: 5 });
              onSet({
                id,
                vocabularyId: wordData.vocabularyId,
                dictionaryId,
                origin: wordInputRef.current.value,
                meanings: meaningsInputRef.current.value.split(',').map(meaning => meaning.trim()),
                examples: examplesState.map(example => ({
                  origin: example.origin,
                  meaning: example.meaning
                }))
              });
            }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 15
            }}
          >{id ? "수정" : "추가"}</motion.button>
        </div>
      </div>
    ) : (
      <div className="relative h-full">
        <div>
          <div className="left"></div>
          <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
            <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">예문 {exampleSetType.setType === "add" ? "추가" : "수정"}</h1>
          </div>
          <div className="right"></div>
        </div>
        <div className="
        flex flex-col gap-[15px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
          <div
            className="
            flex justify-between flex-col gap-[8px]
          "
          >
            <h3
              className="
              text-[14px] font-[700] text-layout-black 
            dark:text-layout-white
            "
            >
              {exampleSetType.exampleIndex}.
            </h3>
            <div>
              <textarea
                ref={exampleOriginInputRef}
                defaultValue={exampleSetType.setType === "add" ? '' : examplesState[exampleSetType.exampleIndex - 1]?.origin}
                onChange={e => {
                  e.target.style.height = '45px';
                  e.target.style.height = `${Math.max(45, e.target.scrollHeight)}px`;
                  exampleOriginInputRef.current.value = e.target.value;
                }}
                placeholder="예문을 입력하세요"
                className="
                w-full h-[45px] min-h-[45px] max-h-[135px]
                px-[15px] py-[10px]
                border-[1px] border-layout-gray-200 rounded-[8px]
                font-[400] text-[16px] text-layout-black
                outline-none
                focus:border--primary-main-600
                transition-colors
                resize-none overflow-hidden
              "
              />
              <textarea
                ref={exampleMeaningInputRef}
                defaultValue={exampleSetType.setType === "add" ? '' : examplesState[exampleSetType.exampleIndex - 1]?.meaning}
                onChange={e => {
                  e.target.style.height = '45px';
                  e.target.style.height = `${Math.max(45, e.target.scrollHeight)}px`;
                  exampleMeaningInputRef.current.value = e.target.value;
                }}
                placeholder="의미를 입력하세요"
                className="
                w-full h-[45px] min-h-[45px] max-h-[135px]
                px-[15px] py-[10px]
                border-[1px] border-layout-gray-200 rounded-[8px]
                font-[400] text-[16px] text-layout-black
                outline-none
                focus:border--primary-main-600
                transition-colors
                resize-none overflow-hidden
              "
              />

            </div>
          </div>
        </div>
        <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
        p-[20px]
      ">
          <motion.button
            className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
            onClick={() => {
              vibrate({ duration: 5 });
              setExampleSetType({
                isExampleSet: false,
                setType: "add",
                exampleIndex: examplesState.length,
              });
            }}
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
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
            onClick={() => {
              vibrate({ duration: 5 });
              if (exampleSetType.setType === "add") {
                setExamplesState([...examplesState, {
                  origin: exampleOriginInputRef.current.value,
                  meaning: exampleMeaningInputRef.current.value
                }]);
              } else {
                setExamplesState(examplesState.map((example, index) =>
                  index === exampleSetType.exampleIndex - 1 ? {
                    ...example,
                    origin: exampleOriginInputRef.current.value,
                    meaning: exampleMeaningInputRef.current.value
                  } : example
                ));
              }
              setExampleSetType({
                isExampleSet: false,
                setType: "add",
                exampleIndex: examplesState.length,
              });
            }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 15
            }}
          >{exampleSetType.setType === "add" ? "추가" : "수정"}</motion.button>
        </div>
      </div>
    )

  );
};

// export const DeleteWordSheet = ({ vocabularyId, id, onCancel, onDelete }) => {
//   return (
//     <div className="">
//       <div className="
//         flex flex-col gap-[15px] items-center justify-center 
//         pt-[40px] px-[20px] pb-[10px]
//       ">
//         <h3 className="text-[18px] font-[700]">단어을 정말 삭제하시겠어요?</h3>
//         <p className="text-[14px] font-[400] text-layout-black">삭제 후에는 복구가 불가능해요 😢</p>
//       </div>
//       <div className="flex items-center justify-between gap-[15px] p-[20px]">
//         <motion.button 
//           className="
//             flex-1
//             h-[45px]
//             rounded-[8px]
//             bg-layout-gray-200
//             text-layout-white text-[16px] font-[700]
//           "
//           onClick={onCancel}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >취소</motion.button>
//         <motion.button 
//           className="
//             flex-1
//             h-[45px]
//             rounded-[8px]
//             bg-primary-main-600
//             text-layout-white text-[16px] font-[700]
//           "
//           onClick={() => onDelete({vocabularyId, id})}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >삭제</motion.button>
//       </div>
//     </div>
//   );
// };