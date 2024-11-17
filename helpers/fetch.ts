import {join as joinPath} from "@std/path/join";
import { withRetries } from "./_retries.ts";

export async function fetchUrlWithCache(opts: {
  url: string,
  folder: string,
  tempFileSuffix?: string,
}) {
  const fileName = await hash(opts.url) + (opts.tempFileSuffix ?? "");
  const filePath = joinPath(opts.folder, fileName);
  try {
    if(Deno.statSync(filePath).isFile) {
      return filePath;
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // continue
    } else {
      throw err;
    }
  }

  Deno.mkdirSync(opts.folder, { recursive: true });
  const tempFilePath = filePath + ".tmp";
  await withRetries(async () => {
    const response = await fetch(opts.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${opts.url}: ${response.statusText}`);
    }

    {
      using file = Deno.openSync(tempFilePath, { write: true, create: true });
      await response.body!.pipeTo(file.writable);
    }
  });
  Deno.renameSync(tempFilePath, filePath);
  return filePath;
}

async function hash(url: string) {
  const bytes = new TextEncoder().encode(url);
  const buffer = await crypto.subtle.digest('SHA-256', bytes)
  return hex(new Uint8Array(buffer));
}

function hex(bytes: Uint8Array) {
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}
