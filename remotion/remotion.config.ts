import { Config } from "@remotion/cli/config";
import path from "path";

Config.overrideWebpackConfig((config) => {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
