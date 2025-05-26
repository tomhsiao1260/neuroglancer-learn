import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import settingsRouter from "./routes/settings";
import dataRouter from "./routes/data";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/settings", settingsRouter);
app.use("/api/data", dataRouter);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
