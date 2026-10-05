const COLOR_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "text-decoration-color",
  "-webkit-text-stroke-color",
  "column-rule-color",
  "outline-color",
] as const;

const COMPOSITE_PROPERTIES = [
  "box-shadow",
  "text-shadow",
  "background-image",
] as const;

const IMAGE_LOAD_TIMEOUT_MS = 10_000;

const MODERN_COLOR_FUNCTION = /\b(oklch|oklab|lab|lch|hwb|color|color-mix)\(/i;

export function makeColorsCanvasSafe(root: Element) {
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  const probe = createColorProbe();
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (
    let ancestor = root.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    elements.push(ancestor);
  }

  for (const element of elements) {
    // html2canvas adopts nodes cloned in the parent document, so instanceof
    // checks against the clone's window are always false here.
    if (!hasInlineStyle(element)) continue;
    const computed = view.getComputedStyle(element);
    for (const property of COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (MODERN_COLOR_FUNCTION.test(value)) {
        element.style.setProperty(property, probe(value), "important");
      }
    }
    for (const property of COMPOSITE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (MODERN_COLOR_FUNCTION.test(value)) {
        element.style.setProperty(
          property,
          replaceColorFunctions(value, probe),
          "important",
        );
      }
    }
  }
}

// html2canvas reloads <img> sources through `new Image()`; an SVG without
// width/height then falls back to 300x150 and is drawn cropped. The canonical
// brand files stay untouched: only the offscreen render gets sized data URLs.
export async function giveSvgImagesIntrinsicSize(root: Element) {
  const images = Array.from(root.querySelectorAll("img")).filter((image) =>
    /\.svg(?:[?#]|$)/i.test(image.currentSrc || image.src),
  );
  await Promise.all(
    images.map(async (image) => {
      const markup = await fetch(image.currentSrc || image.src)
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null);
      if (!markup) return;
      const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
      if (svg.nodeName !== "svg") return;
      const [, , width, height] = (svg.getAttribute("viewBox") ?? "")
        .split(/[\s,]+/)
        .map(Number);
      if (!width || !height) return;
      if (!svg.hasAttribute("width")) svg.setAttribute("width", String(width));
      if (!svg.hasAttribute("height")) svg.setAttribute("height", String(height));
      const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        new XMLSerializer().serializeToString(svg),
      )}`;
      image.removeAttribute("srcset");
      image.src = source;
      await imageReady(image);
    }),
  );
}

// html2canvas measures text baselines with a 1x1 probe <img> that must sit
// inline; Tailwind preflight makes every img display:block, which pushes the
// probe below the line and draws all PDF text ~0.3em too low.
const BASELINE_PROBE_FIX =
  'img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"] { display: inline !important; }';

export async function withAccurateTextBaselines<T>(run: () => Promise<T>) {
  const style = document.createElement("style");
  style.textContent = BASELINE_PROBE_FIX;
  document.head.appendChild(style);
  try {
    return await run();
  } finally {
    style.remove();
  }
}

// next/image defaults to loading="lazy", and the offscreen render never
// intersects the viewport, so lazy images would never start loading.
export async function waitForImages(root: Element) {
  await Promise.all(Array.from(root.querySelectorAll("img")).map(imageReady));
}

function imageReady(image: HTMLImageElement) {
  image.loading = "eager";
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, IMAGE_LOAD_TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  });
}

function hasInlineStyle(
  element: Element,
): element is Element & ElementCSSInlineStyle {
  return "style" in element && typeof element.style === "object";
}

function replaceColorFunctions(
  value: string,
  probe: (color: string) => string,
) {
  let output = "";
  let index = 0;
  const pattern = new RegExp(MODERN_COLOR_FUNCTION.source, "gi");
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    const start = match.index;
    let depth = 0;
    let end = start + match[0].length - 1;
    for (; end < value.length; end += 1) {
      if (value[end] === "(") depth += 1;
      else if (value[end] === ")" && --depth === 0) break;
    }
    output += value.slice(index, start) + probe(value.slice(start, end + 1));
    index = end + 1;
    pattern.lastIndex = index;
  }
  return output + value.slice(index);
}

function createColorProbe() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map<string, string>();

  return (color: string) => {
    const cached = cache.get(color);
    if (cached) return cached;
    let resolved = "rgba(0, 0, 0, 0)";
    if (context) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "rgba(0, 0, 0, 0)";
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      resolved = `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`;
    }
    cache.set(color, resolved);
    return resolved;
  };
}
