import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";

export default defineAgent({
  model: deepseek("deepseek-v4-flash"),
});