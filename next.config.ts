module.exports = {
  output: "export",
  distDir: process.env.NODE_ENV === "production" ? "./docs" : undefined,
  basePath: "/t2-mapper",
  assetPrefix: "/t2-mapper/",
  trailingSlash: true,
};
