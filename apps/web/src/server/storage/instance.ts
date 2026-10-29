import "server-only";
import path from "node:path";
import { env } from "../env";
import { LocalDiskStorage, type ObjectStorage } from "./index";

let storage: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  storage ??= new LocalDiskStorage(path.resolve(process.cwd(), env().STORAGE_LOCAL_DIR));
  return storage;
}
