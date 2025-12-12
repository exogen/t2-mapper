const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = (phase, { defaultConfig }) => {
  return {
    output: phase === PHASE_DEVELOPMENT_SERVER ? undefined : "export",
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? undefined : "./docs",
    basePath: "/t2-mapper",
    assetPrefix: "/t2-mapper/",
    trailingSlash: true,
    headers:
      phase === PHASE_DEVELOPMENT_SERVER
        ? async () => {
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
          }
        : undefined,
    redirects:
      phase === PHASE_DEVELOPMENT_SERVER
        ? async () => {
            // For the dev server, redirect / to the `basePath` for convenience, so you
            // can just open localhost:3000.
            return [
              {
                source: "/",
                destination: "/t2-mapper/",
                basePath: false,
                permanent: false,
              },
            ];
          }
        : undefined,
  };
};
