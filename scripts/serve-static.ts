/**
 * Serve the `/docs` folder from `/t2-mapper` on localhost, for testing
 * production builds locally.
 */
import express from "express";

const app = express();
app.use("/t2-mapper", express.static("./docs"));
app.listen(3000, () => console.log("http://localhost:3000/t2-mapper/"));
