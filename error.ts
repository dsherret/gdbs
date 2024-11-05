import { fromFileUrl } from "@std/path/from-file-url";

export function getCallerFromError(error: Error) {
  const stack = error.stack;
  return getFileNameFromErrorStack(stack ?? "");
}

export function getFileNameFromErrorStack(stack: string) {
  const lines = stack.split("\n").map((line) => line.trim()).filter((line) =>
    line.startsWith("at")
  );
  const caller = /file:\/\/\/[^/]+[^:]+/.exec(lines[1])?.[0];
  if (caller == null) {
    throw new Error(
      "Couldn't determine the caller. Ensure you're running this code in Deno.",
    );
  }
  return fromFileUrl(caller);
}
