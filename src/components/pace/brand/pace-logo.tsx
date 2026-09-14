import Image from "next/image"
import type { CSSProperties } from "react"


export const PACE_LOGO_SRC = "/brand/pace-logo.svg"
export const PACE_ICON_SRC = "/brand/pace-icon.svg"

const PACE_LOGO_ALT = "Pace"
const PACE_LOGO_SIZE = { width: 160, height: 48 }
const PACE_ICON_SIZE = { width: 48, height: 48 }
const PACE_LOGO_DEFAULT_SIZE = { width: 120, height: 36 }
const PACE_ICON_DEFAULT_SIZE = { width: 32, height: 32 }

type PaceLogoVariant = "full" | "icon"

type PaceLogoProps = {
  variant?: PaceLogoVariant
  width?: number
  height?: number
  alt?: string
  className?: string
  preload?: boolean
}

type LogoSize = {
  width: number
  height: number
}

function getContainedSize(
  width: number | undefined,
  height: number | undefined,
  naturalSize: LogoSize
): LogoSize {
  if (width === undefined && height === undefined) {
    return naturalSize
  }

  if (width === undefined) {
    return {
      width: height! * (naturalSize.width / naturalSize.height),
      height: height!,
    }
  }

  if (height === undefined) {
    return {
      width,
      height: width * (naturalSize.height / naturalSize.width),
    }
  }

  const scale = Math.min(width / naturalSize.width, height / naturalSize.height)

  return {
    width: naturalSize.width * scale,
    height: naturalSize.height * scale,
  }
}

function toPixels(value: number) {
  return `${value}px`
}


function PaceLogo({
  variant = "full",
  width,
  height,
  alt = PACE_LOGO_ALT,
  className,
  preload,
}: PaceLogoProps) {
  const isIcon = variant === "icon"
  const source = isIcon ? PACE_ICON_SRC : PACE_LOGO_SRC
  const intrinsicSize = isIcon ? PACE_ICON_SIZE : PACE_LOGO_SIZE
  const defaultSize = isIcon ? PACE_ICON_DEFAULT_SIZE : PACE_LOGO_DEFAULT_SIZE
  const displaySize = getContainedSize(width, height, defaultSize)
  const imageStyle: CSSProperties = {
    height: toPixels(displaySize.height),
    width: toPixels(displaySize.width),
  }

  return (
    <Image
      data-slot="pace-logo"
      src={source}
      alt={alt}
      width={intrinsicSize.width}
      height={intrinsicSize.height}
      sizes={toPixels(displaySize.width)}
      className={["block", className].filter(Boolean).join(" ")}
      preload={preload}
      unoptimized
      style={imageStyle}
    />
  )
}

export { PaceLogo }
export type { PaceLogoProps, PaceLogoVariant }
