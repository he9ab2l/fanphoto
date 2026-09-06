declare module 'utif' {
  interface IFD {
    width: number
    height: number
    t256?: number[]
    t257?: number[]
    [key: string]: unknown
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): IFD[]
    decodeImage(buffer: ArrayBuffer, image: IFD): void
    toRGBA8(image: IFD): Uint8Array
  }
  export default UTIF
}
