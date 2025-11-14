import { ConsoleObject, getProperty } from "@/src/mission";
import { useSettings } from "./SettingsProvider";
import { Suspense, useMemo } from "react";
import { BASE_URL, getUrlForPath, loadDetailMapList } from "@/src/loaders";
import { useQuery } from "@tanstack/react-query";
import { useCubeTexture } from "@react-three/drei";
import { Color } from "three";

const FALLBACK_URL = `${BASE_URL}/black.png`;

/**
 * Load a .dml file, used to list the textures for different faces of a skybox.
 */
function useDetailMapList(name: string) {
  return useQuery({
    queryKey: ["detailMapList", name],
    queryFn: () => loadDetailMapList(name),
  });
}

export function SkyBox({ materialList }: { materialList: string }) {
  const { data: detailMapList } = useDetailMapList(materialList);

  const skyBoxFiles = useMemo(
    () =>
      detailMapList
        ? [
            getUrlForPath(detailMapList[1], FALLBACK_URL), // +x
            getUrlForPath(detailMapList[3], FALLBACK_URL), // -x
            getUrlForPath(detailMapList[4], FALLBACK_URL), // +y
            getUrlForPath(detailMapList[5], FALLBACK_URL), // -y
            getUrlForPath(detailMapList[0], FALLBACK_URL), // +z
            getUrlForPath(detailMapList[2], FALLBACK_URL), // -z
          ]
        : [
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
          ],
    [detailMapList]
  );

  const skyBox = useCubeTexture(skyBoxFiles, { path: "" });

  return <primitive attach="background" object={skyBox} />;
}

export function Sky({ object }: { object: ConsoleObject }) {
  const { fogEnabled } = useSettings();

  // Skybox textures.
  const materialList = getProperty(object, "materialList")?.value;

  // Fog parameters.
  // TODO: There can be multiple fog volumes/layers. Render simple fog for now.
  const fogDistance = useMemo(() => {
    const distanceString = getProperty(object, "fogDistance")?.value;
    if (distanceString) {
      return parseFloat(distanceString);
    }
  }, [object]);

  const fogColor = useMemo(() => {
    const colorString = getProperty(object, "fogColor")?.value;
    if (colorString) {
      // `colorString` might specify an alpha value, but three.js doesn't
      // support opacity on fog or scene backgrounds, so ignore it.
      const [r, g, b] = colorString.split(" ").map((s) => parseFloat(s));
      return new Color().setRGB(r, g, b);
    }
  }, [object]);

  const backgroundColor = fogColor ? (
    <color attach="background" args={[fogColor]} />
  ) : null;

  return (
    <>
      {materialList ? (
        // If there's a skybox, its textures will need to load. Render just the
        // fog color as the background in the meantime.
        <Suspense fallback={backgroundColor}>
          <SkyBox materialList={materialList} />
        </Suspense>
      ) : (
        // If there's no skybox, just render the fog color as the background.
        backgroundColor
      )}
      {fogEnabled && fogDistance && fogColor ? (
        <fog attach="fog" color={fogColor} near={0} far={fogDistance * 2} />
      ) : null}
    </>
  );
}
