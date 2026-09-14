"use client";

import { getTranslations, type SupportedLanguage } from "@/i18n/messages";
import Link from "next/link";

export function FinanceNavigation({
  active,
  language,
}: {
  active: "ask" | "inbox" | "recurring";
  language: SupportedLanguage;
}) {
  const t = getTranslations(language);
  const links = [
    { href: "/", key: "ask" as const, label: t("nav.askPace") },
    { href: "/inbox", key: "inbox" as const, label: t("nav.inbox") },
    { href: "/recurring", key: "recurring" as const, label: t("nav.recurring") },
  ];

  return (
    <aside className="finance-navigation" aria-label={t("brand.name")}>
      <Link className="finance-brand" href="/">
        <span aria-hidden="true" className="finance-brand-mark">{t("brand.short")}</span>
        <span>{t("brand.name")}</span>
      </Link>
      <nav>
        {links.map((link) => (
          <Link className={link.key === active ? "finance-nav-active" : ""} href={link.href} key={link.key}>
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
