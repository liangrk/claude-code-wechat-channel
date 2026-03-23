declare module "qrcode-terminal" {
  function generate(
    data: string,
    options: { small?: boolean },
    cb: (qr: string) => void,
  ): void;
  export { generate };
  export default { generate };
}
