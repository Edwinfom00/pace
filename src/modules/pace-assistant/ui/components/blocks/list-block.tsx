export function ListBlock({ style, items }: { readonly style: "bullet" | "ordered"; readonly items: readonly string[] }) {
  const Component = style === "ordered" ? "ol" : "ul";
  return (
    <Component className={style === "ordered" ? "ml-5 list-decimal space-y-1.5 text-[13px] leading-5 text-[#536079] marker:text-[#7a849a]" : "ml-5 list-disc space-y-1.5 text-[13px] leading-5 text-[#536079] marker:text-[#7a849a]"}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </Component>
  );
}
