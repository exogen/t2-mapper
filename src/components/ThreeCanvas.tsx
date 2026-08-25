import { ReactNode, Suspense, useCallback } from "react";
import { Canvas, GLProps, RootState } from "@react-three/fiber";
import { NoToneMapping, PCFShadowMap, SRGBColorSpace } from "three";
import { useDebug, useSettings } from "./SettingsProvider";
import { LimitFPS } from "./LimitFPS";
import { registerShadowRenderer } from "./shadowControl";

export type InvalidateFunction = RootState["invalidate"];

// Renderer settings to match Tribes 2's simple rendering pipeline.
// Tribes 2 (Torque engine, 2001) worked entirely in gamma/sRGB space with no HDR
// or tone mapping. We disable tone mapping and ensure proper sRGB output.
const glSettings: GLProps = {
  toneMapping: NoToneMapping,
  outputColorSpace: SRGBColorSpace,
};

export function ThreeCanvas({
  children,
  renderOnDemand: renderOnDemandFromProps = false,
  dpr: dprFromProps,
  onCreated,
}: {
  children?: ReactNode;
  dpr?: number;
  renderOnDemand?: boolean;
  onCreated?: (state: RootState) => void;
}) {
  const { renderOnDemand: renderOnDemandFromSettings } = useDebug();
  const renderOnDemand = renderOnDemandFromProps || renderOnDemandFromSettings;
  const { fpsLimit } = useSettings();
  const fpsLimitActive = fpsLimit != null && !renderOnDemand;

  const handleCreated = useCallback(
    (state: RootState) => {
      registerShadowRenderer(state.gl);
      onCreated?.(state);
    },
    [onCreated],
  );

  return (
    <Canvas
      frameloop={renderOnDemand || fpsLimitActive ? "demand" : "always"}
      dpr={dprFromProps}
      gl={glSettings}
      shadows={{ type: PCFShadowMap }}
      // Face Torque north (world +X; three's default forward −Z is west)
      // so the compass reads N, not W, before a mission camera takes over.
      camera={{ rotation: [0, -Math.PI / 2, 0] }}
      onCreated={handleCreated}
    >
      <Suspense>{children}</Suspense>
      {fpsLimitActive ? <LimitFPS /> : null}
    </Canvas>
  );
}
