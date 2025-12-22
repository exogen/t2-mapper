const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = (phase, { defaultConfig }) => {
  return {
    // Suppress static export config warnings in dev mode as they are not relevant.
    output: phase === PHASE_DEVELOPMENT_SERVER ? undefined : "export",
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? undefined : "./docs",
    basePath: "/t2-mapper",
    assetPrefix: "/t2-mapper/",
    trailingSlash: true,
    headers:
      // TorqueScript files should be served as text. This won't affect what
      // GitHub Pages does with the static export, but it'll at least improve
      // the dev server. Otherwise, the responses can't be easily inspected in
      // the Network tab.
      phase === PHASE_DEVELOPMENT_SERVER
        ? async () => {
            return [
              {
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
    // For the dev server, redirect / to the `basePath` for convenience, so you
    // can just open localhost:3000.
    redirects:
      phase === PHASE_DEVELOPMENT_SERVER
        ? async () => {
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
