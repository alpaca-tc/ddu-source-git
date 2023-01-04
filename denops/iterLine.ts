import { TextLineStream } from "https://deno.land/std@0.165.0/streams/mod.ts";

export const iterLine = async function* (
  r: Deno.Reader,
): AsyncIterable<string> {
  const lines = r.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  for await (const line of lines) {
    if (line.length) {
      yield line;
    }
  }
};
