import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
    devIndicators: false,
};

export default withEve(nextConfig);