// src/App.tsx（或任何你使用的 React 組件）
import { useState } from "react";

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    console.log(import.meta);
    const selectedPath = await window.electron.selectFolder();
    if (selectedPath) {
      setFolderPath(selectedPath);
      
      await fetch("http://localhost:3005" + "/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ zarr_data_path: selectedPath }),
      });
    }
  };

  return (
    <div>
      <button onClick={handleSelectFolder}>選取資料夾</button>
      {folderPath && <p>你選取的資料夾：{folderPath}</p>}
    </div>
  );
}

export default App;
