export async function mod(code: string) {
    const tempFilePath = await Deno.makeTempFile();
    await Deno.writeTextFile(tempFilePath, code);
    const module = await import(tempFilePath);
    return module;
}
