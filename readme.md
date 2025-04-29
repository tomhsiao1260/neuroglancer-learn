# Neuroglancer Mini

Neuroglancer Mini is a streamlined version of the original Neuroglancer source code, designed to make its core logic more accessible and easier to understand. This lightweight demo project serves as an educational tool, allowing developers to explore and build upon the fundamental concepts for their own applications.

## Motivation

When I first attempted to understand Neuroglancer's source code, I encountered significant challenges. The project's complexity, coupled with numerous abstract layers and features that weren't immediately relevant to my learning goals, made it difficult to grasp the core functionality.

I was particularly interested in understanding:
- How data is loaded in batches
- The rendering mechanisms
- Core visualization principles

To address these challenges, I created Neuroglancer Mini by:
1. Simplifying the original Neuroglancer codebase
2. Removing complex interface and data transfer logic
3. Streamlining the build process
4. Focusing on essential visualization features

This project serves as a learning resource, providing a more approachable entry point for developers who want to understand the fundamental concepts behind Neuroglancer's powerful visualization capabilities. 

## How to Run

### Important Note
This lightweight demo uses the File System Access API to load data directly from your local filesystem. This API is currently only supported in Chrome-based browsers. Please use Chrome to run this project.

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
Visit the deployed version at [neuroglancer-learn.vercel.app](https://neuroglancer-learn.vercel.app)

### Supported File Formats
The application supports Zarr format (both v2 and v3) and OME-NGFF (OME Zarr) multiscale datasets. Supported data types include uint8, int8, uint16, int16, uint32, int32, uint64, and float32. For Zarr v2, supported compressors are blosc, gzip, null (raw), zlib, and zstd.

## Project Structure

The project is organized into several key directories, each handling specific aspects of the visualization system:

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

### Build Configuration
- `vite.config.ts`: Vite build configuration
- `tsconfig.json`: TypeScript configuration
- `package.json`: Project dependencies and scripts

This structure maintains a clear separation of concerns while keeping the codebase manageable and focused on the core visualization functionality.
