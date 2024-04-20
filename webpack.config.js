import HtmlWebpackPlugin from "html-webpack-plugin";

export default (env, args) => {
  const mode = args.mode === "production" ? "production" : "development";
  const config = {
    mode,
    context: import.meta.dirname,
    entry: {
      main: "./src/main.bundle.js",
    },
    devtool: "source-map",
    module: {
      rules: [],
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
    }
  };
  return config
};
