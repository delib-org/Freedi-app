import { hideSnackbar } from "@/redux/snackbarSlice/snackbarSlice";
import { RootState } from "@/redux/store";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./InAppSnackbar.scss";
import { useUserConfig } from './../../../controllers/hooks/useUserConfig';

const InAppSnackbar = () => {
    const dispatch = useDispatch();
    const { open, title, content, type, buttons } = useSelector(
        (state: RootState) => state.snackbar
    );

    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (open) {
            setVisible(true);

            if (type !== "alert") {
                const timer = setTimeout(() => {
                    setVisible(false); // 👈 triggers fadeOut
                    setTimeout(() => dispatch(hideSnackbar()), 300); // 👈 give time to fade out
                }, 4000);

                return () => clearTimeout(timer);
            }
        } else {
            setVisible(false);
            const timeout = setTimeout(() => dispatch(hideSnackbar()), 300);

            return () => clearTimeout(timeout);
        }
    }, [open, type, dispatch]);

    if (!open && !visible) return null;

    const bgClass =
        type === "alert"
            ? "snackbar--alert"
            : type === "info"
                ? "snackbar--info"
                : "snackbar--confirmation";

    const { dir } = useUserConfig();

    return (
        <div
            className={`snackbar ${bgClass} ${visible ? "snackbar--visible" : "snackbar--hidden"
                }`}
            dir={dir}>
            <div className="snackbar__title">{title}</div>
            <div className="snackbar__content">{content}</div>
            <div className="snackbar__buttons">
                {buttons?.map((btn, idx) => (
                    <button key={idx} onClick={btn.action}>
                        {btn.label}
                    </button>
                ))}
                {!buttons?.length && (
                    <button onClick={() => {
                        setVisible(false);
                        setTimeout(() => dispatch(hideSnackbar()), 300);
                    }}>
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
};

export default InAppSnackbar;
