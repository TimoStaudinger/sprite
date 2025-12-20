export const encode = (code: string): string =>
  encodeURIComponent(
    btoa(new TextEncoder().encode(code).reduce(
      (acc, byte) => acc + String.fromCharCode(byte),
      ""
    ))
  );

export const decode = (code: string): string => {
  const binary = atob(decodeURIComponent(code));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};