import { EsbuildPlugin } from "esbuild-loader";
import HtmlWebpackPlugin from "html-webpack-plugin";
import StartupChunkDependenciesPlugin from "webpack/lib/runtime/StartupChunkDependenciesPlugin.js";

export default (env, args) => {
  const mode = args.mode === "production" ? "production" : "development";
  const config = {
    mode,
    context: import.meta.dirname,
    entry: {
      main: "./src/main.js",
    },
    performance: {
      // Avoid unhelpful warnings due to large bundles.
      maxAssetSize: 3 * 1024 * 1024,
      maxEntrypointSize: 3 * 1024 * 1024,
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
        // Needed for .svg?raw imports used for embedding icons.
        {
          resourceQuery: /raw/,
          type: "asset/source",
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
      // Fixes esm output with splitChunks
      // https://github.com/webpack/webpack/pull/17015/files
      new StartupChunkDependenciesPlugin({
        chunkLoading: "import",
        asyncChunkLoading: true,
      }),
      new HtmlWebpackPlugin({
        title: "Neuroglancer",
        scriptLoading: "module",
      }),
    ],
    target: ["es2020", "web"],
    experiments: {
      outputModule: true,
    },
  };
  return config;
};
