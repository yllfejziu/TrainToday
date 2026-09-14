import { parseHealthText } from "../lib/import";
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    self.postMessage({
      ok: true,
      data: parseHealthText(await event.data.text()),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof SyntaxError
          ? "The JSON file is not valid. Your existing data is unchanged."
          : error instanceof Error
            ? error.message
            : "This file could not be imported.",
    });
  }
};
