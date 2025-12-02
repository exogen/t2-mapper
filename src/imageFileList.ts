/**
 * Parse an IFL file, for frame based image animation.
 *
 * See:
 * - https://help.autodesk.com/view/3DSMAX/2025/ENU/?guid=GUID-CA63616D-9E87-42FC-8E84-D67E1990EE71
 * - https://docs.torque3d.org/for-artists/materials/material-animation
 * - http://wiki.torque3d.org/artist:mapping-materials-to-textures#toc4
 */
export function parseImageFileList(source: string) {
  const lines = source
    .split(/(?:\r\n|\r|\n)/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith(";")); // discard comments

  return lines.map((line) => {
    const fileWithCount = line.match(/^(.+)\s(\d+)$/);
    if (fileWithCount) {
      const frameCount = parseInt(fileWithCount[2], 10);
      return { name: fileWithCount[1], frameCount };
    } else {
      return { name: line, frameCount: 1 };
    }
  });
}
