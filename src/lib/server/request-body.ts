/** Total body-read deadline: a slow upload cannot hold an authenticated slot forever. */
export async function readBodyChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    void reader.cancel().catch(() => {});
    throw new Error("REQUEST_BODY_TIMEOUT");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("REQUEST_BODY_TIMEOUT"));
          void reader.cancel().catch(() => {});
        }, remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
