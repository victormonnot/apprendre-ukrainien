import assert from "node:assert/strict";
import { access, readFile, stat, truncate, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import type {
  AudioDescriptor,
  AudioVoiceId,
} from "../../src/lib/audio-types.ts";
import {
  AudioProviderError,
  audioVoices,
  describeAudio,
  synthesizeAudio,
} from "../../src/lib/server/audio-provider.ts";

const secret = "test-audio-key-not-a-real-credential";
const descriptor = describeAudio("openai-marin", "Кава, будь ласка.");
const localDescriptor = describeAudio("macos-lesya", "Кава, будь ласка.");
const localOptions = { platform: "darwin" as const, disableLocal: false };
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function wav(streamed = false): Buffer<ArrayBuffer> {
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(streamed ? 0xffffffff : bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(22_050, 24);
  bytes.writeUInt32LE(44_100, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(streamed ? 0xffffffff : 4, 40);
  bytes.writeInt16LE(32, 44);
  bytes.writeInt16LE(-32, 46);
  return bytes;
}

function transport(reply: Response): typeof fetch {
  return async () => reply;
}

function failsWith(status: number, expected?: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof AudioProviderError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, new RegExp(secret));
    if (expected) assert.match(error.message, expected);
    return true;
  };
}

async function assertRemoved(directory: string) {
  assert.ok(directory);
  await assert.rejects(access(directory), { code: "ENOENT" });
}

test("audio descriptors normalize Ukrainian text and pin voice, model and instructions", () => {
  assert.deepEqual(describeAudio("macos-lesya", "  Кава,\nбудь\tласка.  "), {
    text: "Кава, будь ласка.",
    voiceId: "macos-lesya",
    voiceLabel: "Lesya",
    provider: "macos",
    model: "macos-lesya-v1",
    instructionsVersion: 1,
  });
  assert.deepEqual(describeAudio("openai-cedar", "і\u0308жа"), {
    text: "їжа",
    voiceId: "openai-cedar",
    voiceLabel: "Cedar",
    provider: "openai",
    model: "gpt-4o-mini-tts-2025-12-15",
    instructionsVersion: 1,
  });
  for (const invalid of [
    "",
    " ",
    "café",
    "к".repeat(1_001),
    "ка\u0301ва",
    "ка\u0000ва",
    "ка\u007fва",
    "Кава [[voice Alex]]",
    "Кава [[slnc 10000",
    "Кава ]]",
  ]) {
    assert.throws(() => describeAudio("macos-lesya", invalid), failsWith(400));
  }
  assert.throws(
    () => describeAudio("unknown" as AudioVoiceId, "Кава"),
    failsWith(400),
  );
});

test("voice availability checks the exact installed Ukrainian voice and keeps credentials private", async () => {
  let calls = 0;
  const voices = await audioVoices({
    ...localOptions,
    apiKey: secret,
    execFile: async (command, args, options) => {
      calls += 1;
      assert.equal(command, "/usr/bin/say");
      assert.deepEqual(args, ["-v", "?"]);
      assert.equal(options.shell, false);
      assert.equal(options.timeout, 45_000);
      return {
        stdout: "Alex en_US # Hello!\nLesya               uk_UA # Вітаю!\n",
      };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(
    voices.map((voice) => [voice.id, voice.available]),
    [
      ["macos-lesya", true],
      ["openai-marin", true],
      ["openai-cedar", true],
    ],
  );
  assert.doesNotMatch(JSON.stringify(voices), new RegExp(secret));
  for (const output of [
    "Lesya en_US # Hello",
    "OtherLesya uk_UA # Вітаю",
    "Other uk_UA # Lesya",
    "",
  ]) {
    const absent = await audioVoices({
      ...localOptions,
      apiKey: "",
      execFile: async () => ({ stdout: output }),
    });
    assert.ok(absent.every((voice) => !voice.available));
  }
});

test("local audio is unavailable off macOS, when disabled or when enumeration fails", async () => {
  for (const unavailable of [
    { platform: "linux" as const, disableLocal: false },
    { platform: "darwin" as const, disableLocal: true },
  ]) {
    const voices = await audioVoices({
      ...unavailable,
      apiKey: "",
      execFile: async () => {
        assert.fail("disabled local voice must not spawn a process");
      },
    });
    assert.ok(voices.every((voice) => !voice.available));
    await assert.rejects(
      synthesizeAudio(localDescriptor, {
        ...unavailable,
        execFile: async () => {
          assert.fail("disabled local voice must not spawn a process");
        },
      }),
      failsWith(503, /pas disponible/),
    );
  }
  const voices = await audioVoices({
    ...localOptions,
    apiKey: "",
    execFile: async () => {
      throw new Error("say executable unavailable");
    },
  });
  assert.ok(voices.every((voice) => !voice.available));
});

test("local synthesis uses private input and output files, fixed shell-free arguments and cleans up", async () => {
  const text = "Кава `touch bad` $(touch bad) ; кава";
  let directory = "";
  let calls = 0;
  const result = await synthesizeAudio(describeAudio("macos-lesya", text), {
    ...localOptions,
    execFile: async (command, args, options) => {
      calls += 1;
      assert.equal(command, "/usr/bin/say");
      assert.equal(options.shell, false);
      assert.equal(options.timeout, 45_000);
      if (args[1] === "?") return { stdout: "Lesya uk_UA # Вітаю!" };
      const input = args[3]!;
      const output = args[5]!;
      directory = dirname(input);
      assert.equal(dirname(output), directory);
      assert.deepEqual(args, [
        "-v",
        "Lesya",
        "-f",
        input,
        "-o",
        output,
        "--file-format=WAVE",
        "--data-format=LEI16@22050",
      ]);
      assert.ok(!args.some((arg) => arg.includes(text)));
      assert.equal((await stat(directory)).mode & 0o777, 0o700);
      assert.equal((await stat(input)).mode & 0o777, 0o600);
      assert.equal((await stat(output)).mode & 0o777, 0o600);
      assert.equal(await readFile(input, "utf8"), text);
      await writeFile(output, wav());
      return { stdout: "" };
    },
    fetch: async () => {
      assert.fail("local synthesis must not call an external service");
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.mimeType, "audio/wav");
  assert.deepEqual(result.bytes, wav());
  await assertRemoved(directory);
});

test("local synthesis cleans temporary files on timeout, process failure and invalid output", async () => {
  for (const failure of [
    "timeout",
    "process",
    "invalid",
    "empty",
    "oversized",
  ]) {
    let directory = "";
    await assert.rejects(
      synthesizeAudio(localDescriptor, {
        ...localOptions,
        execFile: async (_command, args) => {
          if (args[1] === "?") return { stdout: "Lesya uk_UA # Вітаю!" };
          directory = dirname(args[3]!);
          if (failure === "timeout")
            throw Object.assign(new Error(secret), { killed: true });
          if (failure === "process") throw new Error(secret);
          if (failure === "invalid") await writeFile(args[5]!, "not audio");
          if (failure === "oversized")
            await truncate(args[5]!, MAX_AUDIO_BYTES + 1);
          return { stdout: "" };
        },
      }),
      failsWith(failure === "timeout" ? 504 : 502),
    );
    await assertRemoved(directory);
  }
});

test("audio provider refuses missing OpenAI credentials and altered descriptors before synthesis", async () => {
  let calls = 0;
  const fetchMock: typeof fetch = async () => {
    calls += 1;
    return new Response(wav());
  };
  await assert.rejects(
    synthesizeAudio(descriptor, { apiKey: "", fetch: fetchMock }),
    failsWith(503, /pas encore configurées/),
  );
  for (const changed of [
    { model: "other" },
    { provider: "macos" },
    { voiceLabel: "Injected" },
    { instructionsVersion: 2 },
    { text: " Кава " },
  ]) {
    await assert.rejects(
      synthesizeAudio({ ...descriptor, ...changed } as AudioDescriptor, {
        apiKey: secret,
        fetch: fetchMock,
        execFile: async () => {
          assert.fail("altered metadata must not launch a command");
        },
      }),
      failsWith(400),
    );
  }
  assert.equal(calls, 0);
});

test("OpenAI synthesis uses the fixed endpoint and WAV format with normal-speed Ukrainian instructions", async () => {
  for (const voice of ["openai-marin", "openai-cedar"] as const) {
    let calls = 0;
    const result = await synthesizeAudio(
      describeAudio(voice, descriptor.text),
      {
        apiKey: secret,
        fetch: async (url, init) => {
          calls += 1;
          assert.equal(url, "https://api.openai.com/v1/audio/speech");
          assert.equal(init?.method, "POST");
          assert.equal(init?.redirect, "error");
          assert.ok(init?.signal instanceof AbortSignal);
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            `Bearer ${secret}`,
          );
          const body = JSON.parse(init?.body as string);
          assert.equal(body.model, "gpt-4o-mini-tts-2025-12-15");
          assert.equal(body.input, "Кава, будь ласка.");
          assert.equal(
            body.voice,
            voice === "openai-marin" ? "marin" : "cedar",
          );
          assert.equal(body.response_format, "wav");
          assert.equal(body.speed, 1);
          assert.match(body.instructions, /Speak in Ukrainian/);
          assert.match(body.instructions, /Read exactly the provided text/);
          assert.doesNotMatch(init?.body as string, new RegExp(secret));
          return new Response(wav(), {
            headers: { "Content-Type": "audio/wav" },
          });
        },
      },
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, { bytes: wav(), mimeType: "audio/wav" });
  }
});

test("OpenAI synthesis accepts valid streamed WAV headers and rejects malformed or empty audio", async () => {
  const streamed = await synthesizeAudio(descriptor, {
    apiKey: secret,
    fetch: transport(new Response(wav(true))),
  });
  assert.deepEqual(streamed.bytes, wav());
  const wrongRiff = wav();
  wrongRiff.write("JSON");
  const wrongWave = wav();
  wrongWave.write("TEXT", 8);
  const truncated = wav().subarray(0, 46);
  const empty = wav().subarray(0, 44);
  empty.writeUInt32LE(36, 4);
  empty.writeUInt32LE(0, 40);
  const invalidFormat = wav();
  invalidFormat.writeUInt16LE(0, 20);
  const invalidRate = wav();
  invalidRate.writeUInt32LE(0, 28);
  const badData = wav();
  badData.writeUInt32LE(500, 40);
  const missingData = wav();
  missingData.write("JUNK", 36);
  for (const bytes of [
    Buffer.from('{"error":"upstream"}'),
    wrongRiff,
    wrongWave,
    truncated,
    empty,
    invalidFormat,
    invalidRate,
    badData,
    missingData,
  ]) {
    await assert.rejects(
      synthesizeAudio(descriptor, {
        apiKey: secret,
        fetch: transport(new Response(bytes)),
      }),
      failsWith(502, /inexploitable/),
    );
  }
  await assert.rejects(
    synthesizeAudio(descriptor, {
      apiKey: secret,
      fetch: transport(
        new Response(wav(), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    }),
    failsWith(502),
  );
});

test("audio response size is bounded before and during streamed download", async () => {
  let canceled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_AUDIO_BYTES + 1));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(
    synthesizeAudio(descriptor, {
      apiKey: secret,
      fetch: transport(new Response(oversized)),
    }),
    failsWith(502),
  );
  assert.equal(canceled, true);
  let pulled = false;
  const declaredOversized = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    synthesizeAudio(descriptor, {
      apiKey: secret,
      fetch: transport(
        new Response(declaredOversized, {
          headers: { "Content-Length": String(MAX_AUDIO_BYTES + 1) },
        }),
      ),
    }),
    failsWith(502),
  );
  assert.equal(pulled, false);
});

test("audio provider redacts HTTP errors and connection failures", async () => {
  for (const [upstream, expected] of [
    [401, 503],
    [403, 503],
    [429, 429],
    [400, 502],
    [500, 502],
  ]) {
    await assert.rejects(
      synthesizeAudio(descriptor, {
        apiKey: secret,
        fetch: transport(
          new Response(`Remote body contains ${secret}`, { status: upstream }),
        ),
      }),
      failsWith(expected!),
    );
  }
  await assert.rejects(
    synthesizeAudio(descriptor, {
      apiKey: secret,
      fetch: async () => {
        throw new Error(`Connection error contains ${secret}`);
      },
    }),
    failsWith(502, /connexion/),
  );
});

test("slow audio requests abort after 45 seconds and can be retried", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const pending = synthesizeAudio(descriptor, {
    apiKey: secret,
    fetch: async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException(secret, "AbortError")),
          { once: true },
        );
      });
    },
  });
  assert.equal(signal?.aborted, false);
  context.mock.timers.tick(44_999);
  assert.equal(signal?.aborted, false);
  context.mock.timers.tick(1);
  await assert.rejects(pending, failsWith(504, /trop de temps/));
  assert.equal(signal?.aborted, true);
  assert.deepEqual(
    await synthesizeAudio(descriptor, {
      apiKey: secret,
      fetch: transport(new Response(wav())),
    }),
    { bytes: wav(), mimeType: "audio/wav" },
  );
});
