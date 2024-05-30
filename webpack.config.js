import { EsbuildPlugin } from "esbuild-loader";
import HtmlWebpackPlugin from "html-webpack-plugin";

export default (env, args) => {
  const mode = args.mode === "production" ? "production" : "development";
  const config = {
    mode,
    context: import.meta.dirname,
    entry: {
      main: "./src/main.ts",
    },
    devtool: "source-map",
    module: {
      rules: [
        // Needed to support Neuroglancer TypeScript sources.
        {
          test: /\.tsx?$/,
          loader: "esbuild-loader",
          options: {
            // Needed to ensure `import.meta.url` is available.
            target: "es2020",
          },
        },
        // Necessary to handle CSS files.
        {
          test: /\.css$/,
          use: [
            {
              loader: "style-loader",
            },
            { loader: "css-loader" },
          ],
        },
      ],
    },
    optimization: {
      // splitChunks: {
      //   chunks: "all",
      // },
      minimizer: [
        new EsbuildPlugin({
          target: "es2020",
          format: "esm",
          css: true,
        }),
      ],
    },
    devServer: {
      client: {
        overlay: {
          // Prevent intrusive notification spam.
          runtimeErrors: false,
        },
      },
      hot: false,
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: "Neuroglancer",
        scriptLoading: "module",
      }),
    ],
    experiments: {
      outputModule: true,
    },
  };
  return config;
};
