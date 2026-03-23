declare module 'mammoth/mammoth.browser' {
  interface ConvertResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }
  function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertResult>
}
