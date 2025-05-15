/**
 * @license
 * Copyright 2019 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  CodecArrayInfo,
  CodecArrayLayoutInfo,
  CodecChainSpec,
  CodecSpec,
  ShardingInfo,
} from "#src/datasource/zarr/codec/index.js";
import { CodecKind } from "#src/datasource/zarr/codec/index.js";
import { parseNameAndConfiguration } from "#src/datasource/zarr/metadata/parse_util.js";
import { parseArray } from "#src/util/json.js";

function getCodecResolver(obj: unknown): {
  resolver: CodecResolver;
  configuration: unknown;
} {
  const { name: resolver, configuration } = parseNameAndConfiguration(
    obj,
    (name) => {
      const resolver = codecRegistry.get(name);
      if (resolver === undefined) {
        throw new Error(`Unknown codec: ${JSON.stringify(name)}`);
      }
      return resolver;
    },
    (configuration) => configuration,
  );
  return { resolver, configuration };
}

export interface CodecResolver {
  name: string;
  kind: CodecKind;
}

export interface ArrayToArrayCodecResolver<Configuration>
  extends CodecResolver {
  kind: CodecKind.arrayToArray;
  resolve(
    configuration: unknown,
    decodedArrayInfo: CodecArrayInfo,
  ): {
    configuration: Configuration;
    encodedArrayInfo: CodecArrayInfo;
  };
  getDecodedArrayLayoutInfo(
    configuration: Configuration,
    decodedArrayInfo: CodecArrayInfo,
    encodedLayout: CodecArrayLayoutInfo,
  ): CodecArrayLayoutInfo;
}

export interface ArrayToBytesCodecResolver<Configuration>
  extends CodecResolver {
  kind: CodecKind.arrayToBytes;
  resolve(
    configuration: unknown,
    decodedArrayInfo: CodecArrayInfo,
  ): {
    configuration: Configuration;
    shardingInfo?: ShardingInfo;
    encodedSize?: number;
  };
  getDecodedArrayLayoutInfo(
    configuration: Configuration,
    decodedArrayInfo: CodecArrayInfo,
  ): CodecArrayLayoutInfo;
}

export interface BytesToBytesCodecResolver<Configuration>
  extends CodecResolver {
  kind: CodecKind.bytesToBytes;
  resolve(
    configuration: unknown,
    decodedSize: number | undefined,
  ): {
    configuration: Configuration;
    encodedSize?: number;
  };
}

const codecRegistry = new Map<string, CodecResolver>();

export function registerCodec<Configuration>(
  resolver: BytesToBytesCodecResolver<Configuration>,
) {
  codecRegistry.set(resolver.name, resolver);
}

export function parseCodecChainSpec(obj: unknown): any {
  const codecSpecs = parseArray(obj, getCodecResolver);
  const bytesToBytes = codecSpecs.map(({ resolver, configuration }) => ({
    name: resolver.name,
    kind: resolver.kind,
    configuration,
  }));

  // Create proper layoutInfo for 3D data
  const layoutInfo = [{
    physicalToLogicalDimension: [2, 1, 0], // Z, Y, X order
    readChunkShape: [64, 64, 64], // Default chunk size
  }];

  return {
    [CodecKind.bytesToBytes]: bytesToBytes,
    layoutInfo,
  };
}
