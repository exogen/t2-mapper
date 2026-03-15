import { ReactNode, Suspense } from "react";
import { Canvas, GLProps, RootState } from "@react-three/fiber";
import { NoToneMapping, PCFShadowMap, SRGBColorSpace } from "three";
import { useDebug } from "./SettingsProvider";

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

  return (
    <Canvas
      frameloop={renderOnDemand ? "demand" : "always"}
      dpr={dprFromProps}
      gl={glSettings}
      shadows={{ type: PCFShadowMap }}
      onCreated={onCreated}
    >
      <Suspense>{children}</Suspense>
    </Canvas>
  );
}
