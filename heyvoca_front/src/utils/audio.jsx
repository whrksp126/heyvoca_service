import successSound from '../assets/sounds/success.mp3';
import errorSound from '../assets/sounds/error.mp3';

/**
 * 정답 시 효과음 재생
 */
export const playSuccessSound = () => {
    const audio = new Audio(successSound);
    audio.volume = 0.5;
    audio.play().catch(e => console.error("Error playing success sound:", e));
};

/**
 * 오답 시 효과음 재생
 */
export const playErrorSound = () => {
    const audio = new Audio(errorSound);
    audio.volume = 0.5;
    audio.play().catch(e => console.error("Error playing error sound:", e));
};
