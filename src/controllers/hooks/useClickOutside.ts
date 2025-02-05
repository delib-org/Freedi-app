import { useEffect } from "react";

// note for code review: what about making the function a generic type: <T extends HTMLElement> (requires null checks and correct type writing)
export default function useClickOutside(ref: React.RefObject<HTMLElement>, onClickOutside: () => void) {
    useEffect(() => {
        function handleClickOutside(event: MouseEvent | TouchEvent) {
            if (!(event.target instanceof Node) || !ref.current) return
            if (!ref.current.contains(event.target)) onClickOutside();
        }

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };

    }, [ref, onClickOutside]);

}