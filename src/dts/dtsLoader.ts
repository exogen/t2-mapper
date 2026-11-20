import {
  FileLoader,
  Loader,
  TextureLoader,
  type LoadingManager,
  type Texture,
} from "three";
import { parseDTS } from "./dts";
import { buildDTS } from "./dtsBuilder";
import {
  mergeDSQ,
  mergeDTSSequenceSources,
  type DSQData,
  type DTSSequenceSource,
} from "./dsq";
import {
  loadDTSImageLists,
  defaultDTSImageResolver,
  type DTSImageListSource,
} from "./dtsTextures";
import { DTSMaterialFlags, type DTSShapeData } from "./dtsTypes";
import type { DTSModel } from "./dtsModel";

export type { DTSSequenceSource } from "./dsq";

const DTS_DOWNLOAD_TIMEOUT_MS = 8_000;

/** Browser and Node-compatible native loader. parse() needs neither a DOM nor
 * a WebGL context. Texture/DSQ resolution can follow the host application's
 * resource rules without importing them into the format reader. */
export class DTSLoader extends Loader<DTSModel> {
  imageListResolver?: (name: string) => DTSImageListSource | null;
  textureResolver?: (name: string, flags: number) => Texture | null;
  sequenceResolver?: (url: string) => readonly DTSSequenceSource[];
  constructor(manager?: LoadingManager) {
    super(manager);
  }
  setTextureResolver(resolve: DTSLoader["textureResolver"]): this {
    this.textureResolver = resolve;
    return this;
  }
  setSequenceResolver(resolve: DTSLoader["sequenceResolver"]): this {
    this.sequenceResolver = resolve;
    return this;
  }
  override load(
    url: string,
    onLoad: (data: DTSModel) => void,
    onProgress?: Parameters<FileLoader["load"]>[2],
    onError?: (error: unknown) => void,
  ): void {
    void this.loadShapeData(url, onProgress).then(async (data) => {
      try {
        const textureLoader = new TextureLoader(this.manager).setCrossOrigin(
          this.crossOrigin,
        );
        const texture =
          this.textureResolver ??
          ((name: string, flags: number) =>
            flags & DTSMaterialFlags.IflMaterial
              ? null
              : textureLoader.load(
                  (this.resourcePath ||
                    this.path ||
                    url.slice(0, url.lastIndexOf("/") + 1)) +
                    (/\.[a-z0-9]+$/i.test(name) ? name : `${name}.png`),
                ));
        const model = this.buildModel(data, texture);
        await loadDTSImageLists(
          model,
          this.imageListResolver ??
            defaultDTSImageResolver(
              this.resourcePath ||
                this.path ||
                url.slice(0, url.lastIndexOf("/") + 1),
              this.manager,
            ),
          this.manager,
        );
        onLoad(model);
      } catch (error) {
        if (onError) onError(error);
        else console.error(error);
        this.manager.itemError(url);
      }
    }, onError ?? console.error);
  }

  /** Authored shape and sequences without textures or a view hierarchy. */
  loadShapeData(
    url: string,
    onProgress?: Parameters<FileLoader["load"]>[2],
  ): Promise<DTSShapeData> {
    const shapeLoader = this.fileLoader().setPath(this.path);
    const sequenceLoader = this.fileLoader();
    // Release Three's shared in-flight requests as well as the render wait.
    const timeout = setTimeout(() => {
      shapeLoader.abort();
      sequenceLoader.abort();
    }, DTS_DOWNLOAD_TIMEOUT_MS);
    return shapeLoader
      .loadAsync(url, onProgress)
      .then(async (buffer) => {
        try {
          const shape = parseDTS(buffer as ArrayBuffer);
          const sources = this.sequenceResolver?.(url) ?? [];
          return await mergeDTSSequenceSources(
            shape,
            sources,
            async (file) =>
              (await sequenceLoader.loadAsync(file)) as ArrayBuffer,
          );
        } catch (error) {
          this.manager.itemError(url);
          throw error;
        }
      })
      .finally(() => clearTimeout(timeout));
  }

  private fileLoader(): FileLoader {
    return new FileLoader(this.manager)
      .setResponseType("arraybuffer")
      .setRequestHeader(this.requestHeader)
      .setWithCredentials(this.withCredentials);
  }

  parse(
    buffer: ArrayBuffer,
    sequences: readonly { data: DSQData; name?: string }[] = [],
    texture = this.textureResolver,
  ): DTSModel {
    const shape = parseDTS(buffer);
    return this.buildModel(
      sequences.length ? mergeDSQ(shape, sequences) : shape,
      texture,
    );
  }

  private buildModel(
    data: DTSShapeData,
    texture: DTSLoader["textureResolver"],
  ): DTSModel {
    return buildDTS(data, {
      texture: texture
        ? (name, index) => texture(name, data.materials[index].flags)
        : undefined,
    });
  }
}
