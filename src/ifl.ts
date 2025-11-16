export function parseImageFrameList(source: string) {
  const lines = source
    .split(/(?:\r\n|\r|\n)/g)
    .map((line) => line.trim())
    .filter(Boolean);
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
