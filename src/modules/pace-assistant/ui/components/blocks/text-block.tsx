import { Fragment, type ReactElement } from "react";

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function renderInlineText(text: string) {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-[#25314a]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-[#f1f3f7] px-1 py-0.5 font-mono text-[0.82em] text-[#34405a]">{part.slice(1, -1)}</code>;
    const match = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
    if (match && isSafeUrl(match[2]!)) return <a className="font-medium text-[#2867e8] underline underline-offset-2" href={match[2]} key={index} rel="noreferrer" target="_blank">{match[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function TextBlock({ text }: { readonly text: string }) {
  return (
    <div className="space-y-2 text-[13px] leading-5 text-[#536079]">
      {text.split(/\n{2,}/).flatMap((paragraph, paragraphIndex) => renderParagraph(paragraph, paragraphIndex))}
    </div>
  );
}

function renderParagraph(paragraph: string, paragraphIndex: number): ReactElement[] {
  const flatItems = paragraph.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
  if (flatItems.length > 1 && /:\s*$/.test(flatItems[0]!)) {
    return [
      <p key={`${paragraphIndex}-intro`}>{renderInlineText(flatItems[0]!)}</p>,
      <ul className="list-disc space-y-1.5 pl-4" key={`${paragraphIndex}-list`}>
        {flatItems.slice(1).map((item, itemIndex) => <li key={itemIndex}>{renderInlineText(item)}</li>)}
      </ul>,
    ];
  }

  const parts: ReactElement[] = [];
  let prose: string[] = [];
  let items: string[] = [];
  const flushProse = () => {
    if (prose.length === 0) return;
    parts.push(<p key={`${paragraphIndex}-prose-${parts.length}`}>{renderInlineText(prose.join(" "))}</p>);
    prose = [];
  };
  const flushItems = () => {
    if (items.length === 0) return;
    parts.push(<ul className="list-disc space-y-1.5 pl-4" key={`${paragraphIndex}-items-${parts.length}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineText(item)}</li>)}</ul>);
    items = [];
  };

  for (const line of paragraph.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const match = /^[-*]\s+(.+)$/.exec(line);
    if (match) {
      flushProse();
      items.push(match[1]!);
    } else {
      flushItems();
      prose.push(line);
    }
  }
  flushProse();
  flushItems();
  return parts;
}
