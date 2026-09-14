"use client";

import { HiOutlineChevronDown, HiOutlineGlobeAlt } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthFormLanguage, AuthFormMessageKey } from "@/i18n/messages";

type AuthLanguageSwitcherProps = {
  language: AuthFormLanguage;
  onLanguageChange: (language: AuthFormLanguage) => void;
  t: (key: AuthFormMessageKey) => string;
};

const languages: AuthFormLanguage[] = ["en", "fr", "de"];

export function AuthLanguageSwitcher({
  language,
  onLanguageChange,
  t,
}: AuthLanguageSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("auth.language.selector")}
          className="h-10 gap-2 rounded-md px-2.5 text-[0.84rem] font-medium text-[#27334b] hover:bg-[#f4f6fa] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/15"
          size="sm"
          type="button"
          variant="ghost"
        >
          <HiOutlineGlobeAlt aria-hidden="true" className="size-[1.05rem]" />
          <span>{t(`auth.language.${language}`)}</span>
          <HiOutlineChevronDown aria-hidden="true" className="size-3.5 text-[#6d7890]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 rounded-md border border-[#dfe5ee] bg-white p-1.5 text-[#17213a] shadow-[0_12px_28px_rgb(17_30_56_/_10%)]"
        sideOffset={6}
      >
        <DropdownMenuRadioGroup
          onValueChange={(value) => onLanguageChange(value as AuthFormLanguage)}
          value={language}
        >
          {languages.map((option) => (
            <DropdownMenuRadioItem
              className="rounded-[0.3rem] px-2.5 py-2 text-[0.84rem] font-medium focus:bg-[#eef3ff] focus:text-[#1746ba]"
              key={option}
              value={option}
            >
              {t(`auth.language.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
