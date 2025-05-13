# Neuroglancer Mini

Neuroglancer Mini is a trimmed-down version of the original Neuroglancer source code, designed to make its core logic more accessible and easier to understand. This is not a new implementation, but rather a carefully curated subset of the original codebase (~115,510 lines) that has been reduced to about 22,677 lines by retaining only the minimal core functionality needed for the program to run, reducing npm dependencies, and simplifying the build process. This lightweight version serves as a learning demo, allowing developers to grasp the core concepts and architecture of Neuroglancer without being overwhelmed by the complexity of the original implementation.

<img width="974" alt="img2" src="https://github.com/user-attachments/assets/c69a9014-3250-4d05-8350-abb96975b64c" />

## Motivation

When I first attempted to understand Neuroglancer's source code, I encountered significant challenges. The project's complexity, coupled with numerous abstract layers and features that weren't immediately relevant to my learning goals, made it difficult to grasp the core functionality.

I was particularly interested in understanding:
- How data is loaded in batches
- The rendering mechanisms
- Core visualization principles

To address these challenges, I created Neuroglancer Mini by carefully selecting and preserving the essential parts of the original codebase:
1. Retaining only the essential code needed for basic functionality
2. Removing complex interface and data transfer logic
3. Streamlining the build process
4. Focusing on core visualization features

This project serves as a learning resource, providing a more approachable entry point for developers who want to understand the fundamental concepts behind Neuroglancer's powerful visualization capabilities. This is a derivative work based on the original Neuroglancer codebase, and the core implementation is derived from the original authors' work.

## How to Run

This lightweight demo uses the File System Access API to load data directly from your local filesystem. This API is currently only supported in Chrome-based browsers. Please use Chrome to run this project.

<img width="974" alt="img1" src="https://github.com/user-attachments/assets/42784acc-39cc-4585-948b-0b2d4a971ee1" />

### Option 1: Local Development
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in Chrome

### Option 2: Online Demo
Visit the deployed version at [neuroglancer-mini.vercel.app](https://neuroglancer-mini.vercel.app)

### Supported File Formats
The application supports Zarr format (both v2 and v3) and OME-NGFF (OME Zarr) multiscale datasets. Supported data types include uint8, int8, uint16, int16, uint32, int32, uint64, and float32. For Zarr v2, supported compressors are blosc, gzip, null (raw), zlib, and zstd.

## Project Structure

The project is organized into several key directories, each handling specific aspects of the system:

### Application Core
- `src/main.ts`: The entry point of the application, handling initialization and user interface setup
- `src/state/`: Manages application state:
  - Coordinate transformation
  - Navigation state
  - Trackable values
  - State synchronization

### Data Management
- `src/datasource/`: Manages data source providers and protocols, including:
  - Zarr format support
  - URL handling and normalization
  - Data source registration and management
  - Layer naming and grouping
- `src/chunk_manager/`: Implements efficient data chunking and loading:
  - Frontend-backend communication for chunk management
  - Generic file source handling
  - Chunk request prioritization
  - Memory management for loaded chunks

### Visualization System
- `src/layer/`: Defines the layer system architecture:
  - Layer data source management
  - Display context handling
  - Layer state management
  - Layer composition and blending
- `src/sliceview/`: Manages the three orthogonal slice views:
  - Volume rendering
  - Chunk format handling
  - Panel management
  - Bounding box visualization
  - Frontend-backend synchronization
- `src/visibility_priority/`: Implements a priority system for managing visibility states:
  - Tracks visibility status of different components
  - Handles priority-based prefetching
  - Manages shared visibility states between frontend and backend
  - Supports infinite visibility states and priority levels

### Rendering Engine
- `src/webgl/`: Provides WebGL rendering infrastructure:
  - Shader management and compilation
  - Texture handling and access
  - Buffer management
  - Dynamic shader generation
  - Colormap support
  - Offscreen rendering
  - Bounding box visualization
- `src/render/`: Implements the core rendering pipeline:
  - Render layer management
  - Coordinate transformation
  - Projection parameter handling
  - Panel rendering
  - Real-time mouse position tracking
  - Smooth navigation controls

### Background Processing
- `src/worker/`: Handles background processing:
  - Web Worker implementation
  - RPC communication
  - Shared state management
  - Chunk processing

### Utilities
- `src/util/`: Provides utility functions and classes:
  - Data type handling
  - Matrix operations
  - Color manipulation
  - Event handling
  - Mouse and keyboard bindings
  - JSON processing
  - Memory management
  - Error handling
  - File system access

### Build Configuration
- `vite.config.ts`: Vite build configuration
- `tsconfig.json`: TypeScript configuration
- `package.json`: Project dependencies and scripts

