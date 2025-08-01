import { hideSnackbar } from "@/redux/snackbarSlice/snackbarSlice";
import { RootState } from "@/redux/store";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./InAppSnackbar.scss";
import { useUserConfig } from "../../../controllers/hooks/useUserConfig";

interface SnackbarState {
    open: boolean;
    title: string;
    content: string;
    type: "alert" | "info" | "confirmation";
    buttons?: { label: string; action?: () => void }[];
}

const InAppSnackbar = () => {
    const dispatch = useDispatch();
    const snackbarState = useSelector((state: RootState) => state.snackbar);
    const [visible, setVisible] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [localSnackbar, setLocalSnackbar] = useState<SnackbarState>(snackbarState);

    const dismissSnackbar = () => {
        setVisible(false);
        setTimeout(() => {
            setShouldRender(false);
            dispatch(hideSnackbar());
        }, 300);
    };

    useEffect(() => {
        if (snackbarState.open) {
            setLocalSnackbar(snackbarState);
            setShouldRender(true);
            setVisible(true);

            if (snackbarState.type !== "alert") {
                const timer = setTimeout(() => {
                    dismissSnackbar();
                }, 4000);

                return () => clearTimeout(timer);
            }
        } else {
            setVisible(false);
            const timeout = setTimeout(() => {
                setShouldRender(false);
                dispatch(hideSnackbar());
            }, 300);

            return () => clearTimeout(timeout);
        }
    }, [snackbarState, dispatch]);

    if (!shouldRender) return null;

    const bgClass =
        localSnackbar.type === "alert"
            ? "snackbar--alert"
            : localSnackbar.type === "info"
                ? "snackbar--info"
                : "snackbar--confirmation";

    const { dir } = useUserConfig();

    return (
        <div
            className={`snackbar ${bgClass} ${visible ? "snackbar--visible" : "snackbar--hidden"
                }`}
            dir={dir}
        >
            <div className="snackbar__title">{localSnackbar.title}</div>
            <div className="snackbar__content">{localSnackbar.content}</div>
            <div className="snackbar__buttons">
                {localSnackbar.buttons?.map((btn, idx) => (
                    <button
                        key={idx}
                        onClick={() => {
                            btn.action?.();
                            dismissSnackbar();
                        }}
                    >
                        {btn.label}
                    </button>
                ))}
                {!localSnackbar.buttons?.length && (
                    <button onClick={dismissSnackbar}>Dismiss</button>
                )}
            </div>
        </div>
    );
};

export default InAppSnackbar;
