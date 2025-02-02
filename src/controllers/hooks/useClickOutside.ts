import { useRef, useEffect } from "react";

type Handler = () => void;

export function useClickOutside(onClickOutside: Handler) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!onClickOutside) {
      console.warn('useClickOutside: onClickOutside handler is required');

      return;
    }

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      try {
        if (!ref.current) {
          console.warn('useClickOutside: ref is not attached to any element');

          return;
        }

        if (!(event.target instanceof Node)) {
          console.error('useClickOutside: event.target is not a Node');

          return;
        }

        if (!document.contains(event.target)) {
          console.warn('useClickOutside: clicked element is not in the document');

          return;
        }

        if (ref.current && !ref.current.contains(event.target)) {
          onClickOutside();
        }
      } catch (error) {
        console.error('useClickOutside: Error handling click event:', error);
      }
    };

    try {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    } catch (error) {
      console.error('useClickOutside: Error adding event listeners:', error);
    }

    return () => {
      try {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      } catch (error) {
        console.error('useClickOutside: Error removing event listeners:', error);
      }
    };
  }, [onClickOutside]);

  return ref;
}