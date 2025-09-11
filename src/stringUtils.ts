export function normalize(pathString: string) {
  return pathString.replace(/\\/g, "/").replace(/\/+/g, "/");
}
