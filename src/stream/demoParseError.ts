import {
  BlockTypePacket,
  type DemoBlock,
  type PacketData,
} from "t2-demo-parser";

/** A parser fault halts later packets; never present that prefix as a full scan. */
export function assertDemoBlockParsed(block: DemoBlock, timeSec: number): void {
  const fault =
    block.parseError ??
    (block.type === BlockTypePacket
      ? (block.parsed as PacketData | undefined)?.parseFault?.message
      : undefined);
  if (fault) {
    throw new Error(`Demo parsing failed at ${timeSec.toFixed(3)}s: ${fault}`);
  }
}
