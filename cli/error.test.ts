import { getFileNameFromErrorStack } from "./error.ts";
import { assertEquals } from "@std/assert";

Deno.test("getFileNameFromErrorStack", () => {
  if (Deno.build.os === "windows") {
    assertEquals(getFileNameFromErrorStack(`Error
  at Context.defineBench (file:///V:/gdbs/cli/mod.ts:52:17)
  at file:///V:/test/__bench__.ts:3:9`), "V:\\test\\__bench__.ts");
  }
});