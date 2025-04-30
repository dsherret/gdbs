import { withRetries } from "./_retries.ts";
import type { Path } from "@david/path";

export async function fetchUrlWithCache(opts: {
  url: string;
  folder: Path;
  tempFileSuffix?: string;
}) {
  const fileName = await hash(opts.url) + (opts.tempFileSuffix ?? "");
  const filePath = opts.folder.join(fileName);

  if (filePath.statSync()?.isFile) {
    return filePath;
  }

  opts.folder.mkdirSync({ recursive: true });
  const tempFilePath = filePath.withExtname(".tmp");
  await withRetries(async () => {
    const response = await fetch(opts.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${opts.url}: ${response.statusText}`);
    }

    {
      using file = tempFilePath.openSync({ write: true, create: true });
      await response.body!.pipeTo(file.writable);
    }
  });
  tempFilePath.renameSync(filePath);
  return filePath;
}

async function hash(url: string) {
  const bytes = new TextEncoder().encode(url);
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return hex(new Uint8Array(buffer));
}

function hex(bytes: Uint8Array) {
  return bytes.reduce(
    (str, byte) => str + byte.toString(16).padStart(2, "0"),
    "",
  );
}
