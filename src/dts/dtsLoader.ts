import {
  FileLoader,
  Loader,
  TextureLoader,
  type LoadingManager,
  type Texture,
} from "three";
import { parseDTS } from "./dts";
import { buildDTS } from "./dtsBuilder";
import { mergeDSQ, parseDSQ, type DSQData } from "./dsq";
import {
  loadDTSImageLists,
  defaultDTSImageResolver,
  type DTSImageListSource,
} from "./dtsTextures";
import { DTSMaterialFlags } from "./dtsTypes";
import type { DTSModel } from "./dtsModel";

export interface DTSSequenceSource {
  url: string;
  name?: string;
}
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
    const loader = new FileLoader(this.manager)
      .setPath(this.path)
      .setResponseType("arraybuffer")
      .setRequestHeader(this.requestHeader)
      .setWithCredentials(this.withCredentials);
    loader.load(
      url,
      async (buffer) => {
        try {
          const sources = this.sequenceResolver?.(url) ?? [];
          const sequences = await Promise.all(
            sources.map(async (source) => {
              const data = await new FileLoader(this.manager)
                .setResponseType("arraybuffer")
                .setRequestHeader(this.requestHeader)
                .setWithCredentials(this.withCredentials)
                .loadAsync(source.url);
              // An empty optional DSQ ships with medium_male. It contains no sequence.
              return (data as ArrayBuffer).byteLength
                ? { data: parseDSQ(data as ArrayBuffer), name: source.name }
                : null;
            }),
          );
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
          const model = this.parse(
            buffer as ArrayBuffer,
            sequences.filter(
              (s): s is { data: DSQData; name: string | undefined } =>
                s !== null,
            ),
            texture,
          );
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
      },
      onProgress,
      onError,
    );
  }
  parse(
    buffer: ArrayBuffer,
    sequences: readonly { data: DSQData; name?: string }[] = [],
    texture = this.textureResolver,
  ): DTSModel {
    const parsed = parseDTS(buffer);
    const data = sequences.length ? mergeDSQ(parsed, sequences) : parsed;
    return buildDTS(data, {
      texture: texture
        ? (name, index) => texture(name, data.materials[index].flags)
        : undefined,
    });
  }
}
