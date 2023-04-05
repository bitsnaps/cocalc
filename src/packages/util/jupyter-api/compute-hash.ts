import { sha1 } from "@cocalc/util/misc";

export default function computeHash({
  history,
  input,
  kernel,
}: {
  history?: string[];
  input: string;
  kernel: string;
}): string {
  return sha1(JSON.stringify([history ?? [], input, kernel]));
}