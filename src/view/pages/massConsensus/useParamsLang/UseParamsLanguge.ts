import { useSearchParams } from "react-router";

interface ReturnProps {
	dir: "ltr" | "rtl",
	lang: string
}

export function useParamsLanguage(): ReturnProps {
	const [searchParams] = useSearchParams();
	const lang = searchParams.get('lang') ?? 'en';

	const dir = (lang === 'he' || lang === "ar") ? 'rtl' : 'ltr';

	return { dir, lang }
}