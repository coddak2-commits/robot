import ko from './ko.json';
import en from './en.json';
export type LangCode = 'ko' | 'en';
export const translations: Record<LangCode, Record<string, string>> = { ko, en };
