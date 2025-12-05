module.exports = {
  output: "export",
  distDir: process.env.NODE_ENV === "production" ? "./docs" : undefined,
  basePath: "/t2-mapper",
  assetPrefix: "/t2-mapper/",
  trailingSlash: true,
  async headers() {
    return [
      {
        // TorqueScript files should be served as text. This won't affect what
        // GitHub Pages does, but it'll at least improve the dev server. Otherwise,
        // the responses can't be easily inspected in the Network tab.
        source: "/:path*.cs",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain; charset=utf-8",
          },
        ],
      },
    ];
  },
  async redirects() {
    // For the dev server, redirect / to the `basePath` for convenience, so you
    // can just open localhost:3000.
    if (process.env.NODE_ENV !== "production") {
      return [
        {
          source: "/",
          destination: "/t2-mapper/",
          basePath: false,
          permanent: false,
        },
      ];
    }
    return [];
  },
};
