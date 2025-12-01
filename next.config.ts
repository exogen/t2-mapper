module.exports = {
  output: "export",
  distDir: process.env.NODE_ENV === "production" ? "./docs" : undefined,
  basePath: "/t2-mapper",
  assetPrefix: "/t2-mapper/",
  trailingSlash: true,
  async headers() {
    return [
      {
        // TorqueScript files should be served as text
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
};
